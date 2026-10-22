// Admin/HR account management against the shared database.
// GET   - list accounts (never credentials)
// POST  - create an account
// PATCH - activate/deactivate, or reset a password
import type { RequestHandler } from './$types';
import { bool, fail, ok, readJson, requireAccount, str } from '$lib/server/api.ts';
import { accountByEmail, insertAccount, listAccounts, setAccountActive, setAccountCredential } from '$lib/server/db.ts';
import { checkPassword, hashPassword } from '$lib/core/password.ts';
import { emailLooksValid } from '$lib/core/rules.ts';
import { id as newId } from '$lib/core/seed.ts';
import type { Role } from '$lib/core/types.ts';

const ROLES: Role[] = ['employee', 'manager', 'admin'];
const strip = <T extends { cred?: unknown }>(a: T) => {
	const { cred: _cred, ...rest } = a;
	return rest;
};

export const GET: RequestHandler = async (event) => {
	const guard = await requireAccount(event, 'admin');
	if ('response' in guard) return guard.response;
	return ok({ accounts: (await listAccounts()).map(strip) });
};

export const POST: RequestHandler = async (event) => {
	const guard = await requireAccount(event, 'admin');
	if ('response' in guard) return guard.response;

	const body = await readJson<Record<string, unknown>>(event, 20_000);
	if (!body) return fail('Request body must be valid JSON.');

	const name = str(body.name, 120);
	const email = str(body.email, 320).toLowerCase();
	const password = typeof body.password === 'string' ? body.password : '';
	const role = ROLES.includes(body.role as Role) ? (body.role as Role) : 'employee';
	const department = str(body.department, 120);
	const title = str(body.title, 120);

	if (name.length < 2) return fail('Enter the person\u2019s name.', 422);
	if (!emailLooksValid(email)) return fail('Enter a valid email address.', 422);
	const pw = checkPassword(password);
	if (!pw.ok) return fail(pw.message, 422);
	if (!guard.settings.departments.includes(department)) return fail('Choose a valid department.', 422);
	if (await accountByEmail(email)) return fail('An account with that email already exists.', 409);

	const account = {
		id: newId('acct'),
		name,
		email,
		role,
		department,
		title: title || undefined,
		active: true,
		createdAt: Date.now(),
		cred: await hashPassword(password)
	};
	await insertAccount(account);
	return ok({ account: strip(account) });
};

export const PATCH: RequestHandler = async (event) => {
	const guard = await requireAccount(event, 'admin');
	if ('response' in guard) return guard.response;

	const body = await readJson<Record<string, unknown>>(event, 20_000);
	if (!body) return fail('Request body must be valid JSON.');

	const accountId = str(body.accountId, 120);
	const action = str(body.action, 20);
	if (!accountId) return fail('An accountId is required.');

	const accounts = await listAccounts();
	const target = accounts.find((a) => a.id === accountId);
	if (!target) return fail('That account no longer exists.', 404);

	if (action === 'active') {
		// Admins cannot lock themselves out.
		if (target.id === guard.account.id && !bool(body.active)) return fail('You cannot deactivate your own account.', 422);
		await setAccountActive(target.id, bool(body.active));
		return ok({ account: strip({ ...target, active: bool(body.active) }) });
	}

	if (action === 'reset') {
		const password = typeof body.password === 'string' ? body.password : '';
		const pw = checkPassword(password);
		if (!pw.ok) return fail(pw.message, 422);
		await setAccountCredential(target.id, await hashPassword(password), true);
		return ok({ account: strip({ ...target, mustChangePassword: true }) });
	}

	return fail('Unknown action.', 422);
};
