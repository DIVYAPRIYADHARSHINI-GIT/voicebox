// Shared helpers for the API routes: JSON responses, auth guards, seeding and
// the server-side login lockout.
//
// The lockout lives in the database now. In the browser-only version a user
// could clear their own localStorage to reset the counter, which was tolerable
// when the only data at risk was their own. With one shared dataset that would
// be a real hole, so attempts are counted server-side per email.
import { json, type RequestEvent } from '@sveltejs/kit';
import type { Account, Settings } from '../core/types.ts';
import { LOCKOUT_MS, MAX_FAILED_ATTEMPTS, lockState, registerFailure } from '../core/rules.ts';
import { authenticate } from './auth.ts';
import { dbReady } from './guards.ts';
import { clearLockout, getLockout, getSettings, isEmpty, pruneLockouts, replaceAll, saveLockout } from './db.ts';

export const ok = <T>(data: T, init?: ResponseInit) => json({ ok: true, ...data }, init);
export const fail = (message: string, status = 400, extra: Record<string, unknown> = {}) =>
	json({ ok: false, error: message, ...extra }, { status });

export { MAX_FAILED_ATTEMPTS };

// ---------------------------------------------------------------------------
// First-run seeding
// ---------------------------------------------------------------------------

let seeding: Promise<void> | null = null;

/**
 * Seeds the Northwind Studio sample data the first time the database is used,
 * so a fresh deployment is immediately usable. Guarded so concurrent cold
 * starts cannot seed twice.
 */
export async function ensureSeeded(): Promise<void> {
	seeding ??= (async () => {
		if (!(await isEmpty())) return;
		const { buildSampleDatabase } = await import('../core/seed.ts');
		const sample = await buildSampleDatabase();
		await replaceAll({
			settings: sample.settings,
			accounts: sample.accounts,
			feedback: sample.feedback,
			pulse: sample.pulse,
			participation: sample.participation,
			notifications: sample.notifications
		});
	})().catch((e) => {
		seeding = null; // let the next request retry
		throw e;
	});
	return seeding;
}

// ---------------------------------------------------------------------------
// Lockout
// ---------------------------------------------------------------------------

export async function lockFor(email: string, at = Date.now()) {
	return lockState(await getLockout(email), at);
}

export async function recordFailure(email: string, at = Date.now()) {
	const next = registerFailure(await getLockout(email), at);
	await saveLockout(email, next);
	return lockState(next, at);
}

export async function clearFailures(email: string) {
	await clearLockout(email);
}

/** Housekeeping: drop lockouts whose window has already elapsed. */
export async function prune(at = Date.now()) {
	await pruneLockouts(at - LOCKOUT_MS);
}

/** Message appended to a failed sign-in, warning about the approaching lock. */
export function lockoutHint(remaining: number, locked: boolean): string {
	if (locked) return ' The form is locked for 5 minutes.';
	if (remaining <= 2 && remaining > 0) return ` ${remaining} attempt(s) left before the form locks for 5 minutes.`;
	return '';
}

// ---------------------------------------------------------------------------
// Request guards
// ---------------------------------------------------------------------------

export interface Authed {
	account: Account;
	settings: Settings;
}

/**
 * Guard for routes that need a signed-in account in a given area. Returns the
 * account and the shared settings, or a Response to return immediately.
 */
export async function requireAccount(event: RequestEvent, area: 'employee' | 'staff' | 'admin'): Promise<Authed | { response: Response }> {
	const notReady = dbReady();
	if (notReady) return { response: notReady };

	try {
		await ensureSeeded();
	} catch (e) {
		return { response: fail(`The shared database is unreachable: ${e instanceof Error ? e.message : String(e)}`, 503) };
	}

	const auth = await authenticate(event.cookies);
	if (!auth.account) return { response: fail(auth.reason ?? 'Sign in to continue.', 401, { reason: auth.status }) };

	const role = auth.account.role;
	const allowed = area === 'employee' ? role === 'employee' : area === 'admin' ? role === 'admin' : role === 'manager' || role === 'admin';

	if (!allowed) {
		return {
			response: fail(
				area === 'employee'
					? 'You are signed in to the manager portal. Sign out to use the employee portal.'
					: area === 'admin'
						? 'Only Admin/HR can do that.'
						: 'That area is part of the manager portal. Your account does not have access.',
				403,
				{ role }
			)
		};
	}

	return { account: auth.account, settings: await getSettings() };
}

/** Parses a JSON body, capping its size. */
export async function readJson<T>(event: RequestEvent, maxBytes = 1_000_000): Promise<T | null> {
	const text = await event.request.text();
	if (text.length > maxBytes) return null;
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}

export const str = (v: unknown, max = 4000): string => (typeof v === 'string' ? v.slice(0, max).trim() : '');
export const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
export const bool = (v: unknown): boolean => v === true;
