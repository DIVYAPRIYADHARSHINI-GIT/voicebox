// POST /api/auth/login - server-side sign-in.
//
// The browser never decides whether a password is correct: it posts the
// credentials, and the server verifies the PBKDF2 hash from the shared
// database, applies the lockout, and issues a signed HttpOnly session cookie.
import type { RequestHandler } from './$types';
import { GENERIC_LOGIN_ERROR, setSessionCookie, verifyCredentials } from '$lib/server/auth.ts';
import { dbReady } from '$lib/server/guards.ts';
import { clearFailures, ensureSeeded, fail, lockFor, lockoutHint, ok, prune, readJson, recordFailure, str } from '$lib/server/api.ts';

interface Body {
	email?: unknown;
	password?: unknown;
	portal?: unknown;
}

export const POST: RequestHandler = async (event) => {
	const notReady = dbReady();
	if (notReady) return notReady;

	const body = await readJson<Body>(event, 10_000);
	if (!body) return fail('Request body must be valid JSON.');

	const email = str(body.email, 320);
	const password = typeof body.password === 'string' ? body.password : '';
	const portal = body.portal === 'manager' ? 'manager' : 'employee';
	if (!email || !password) return fail(GENERIC_LOGIN_ERROR, 401);

	try {
		await ensureSeeded();
		// Housekeeping: drop lockouts whose window has already elapsed.
		await prune();
	} catch (e) {
		return fail(`The shared database is unreachable: ${e instanceof Error ? e.message : String(e)}`, 503);
	}

	const lock = await lockFor(email);
	if (lock.locked) {
		const minutes = Math.ceil(lock.remainingMs / 60_000);
		return fail(`Too many failed attempts. Try again in ${minutes} minute(s).`, 429, { locked: true, minutes });
	}

	const account = await verifyCredentials(email, password);
	if (!account) {
		const after = await recordFailure(email);
		return fail(`${GENERIC_LOGIN_ERROR}${lockoutHint(after.attemptsLeft, after.locked)}`, 401);
	}

	// Portal separation: managers/admins use /manager/login, employees /login.
	if (portal === 'manager' && account.role === 'employee') {
		return fail('This account does not have manager portal access. Use the employee sign-in.', 403);
	}
	if (portal === 'employee' && account.role !== 'employee') {
		return fail('This is a manager account. Please use the manager portal sign-in.', 403);
	}

	await clearFailures(email);
	const now = Date.now();
	setSessionCookie(event.cookies, { accountId: account.id, startedAt: now, lastSeenAt: now });

	const { cred: _cred, ...safe } = account;
	return ok({ account: safe });
};
