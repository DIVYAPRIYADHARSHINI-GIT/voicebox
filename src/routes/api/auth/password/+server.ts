// POST /api/auth/password - change my own password.
//
// Verified server-side against the stored PBKDF2 hash, so the browser can
// never bypass the current-password check.
import type { RequestHandler } from './$types';
import { fail, ok, readJson, requireAccount } from '$lib/server/api.ts';
import { accountById, setAccountCredential } from '$lib/server/db.ts';
import { checkPassword, hashPassword, verifyPassword } from '$lib/core/password.ts';

/** Any signed-in role may change its own password. */
async function anyAccount(event: Parameters<RequestHandler>[0]) {
	const staff = await requireAccount(event, 'staff');
	if (!('response' in staff)) return staff;
	return requireAccount(event, 'employee');
}

export const POST: RequestHandler = async (event) => {
	const guard = await anyAccount(event);
	if ('response' in guard) return guard.response;

	const body = await readJson<{ current?: unknown; next?: unknown }>(event, 10_000);
	const current = typeof body?.current === 'string' ? body.current : '';
	const next = typeof body?.next === 'string' ? body.next : '';

	const check = checkPassword(next);
	if (!check.ok) return fail(check.message, 422);

	const target = await accountById(guard.account.id);
	if (!target) return fail('Sign in to continue.', 401);
	if (!(await verifyPassword(current, target.cred))) return fail('Your current password is incorrect.', 422);

	await setAccountCredential(target.id, await hashPassword(next), false);
	return ok({});
};
