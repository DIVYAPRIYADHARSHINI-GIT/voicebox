// Admin/HR data tools against the shared database.
// GET  - JSON backup (never includes credentials)
// POST - import a backup, reload sample data, clear lockouts, or start fresh
//
// These affect the whole organisation's data, not one browser, so they are
// Admin-only and the destructive ones are confirmed in the UI first.
import type { RequestHandler } from './$types';
import { fail, ok, readJson, requireAccount, str } from '$lib/server/api.ts';
import { clearAllLockouts, exportAll, insertAccount, listAccounts, replaceAll, wipeAll } from '$lib/server/db.ts';
import { buildSampleDatabase } from '$lib/core/seed.ts';
import { migrate } from '$lib/core/store.ts';
import { emptyDatabase } from '$lib/core/defaults.ts';
import { hashPassword } from '$lib/core/password.ts';
import type { Account, Database } from '$lib/core/types.ts';

const IMPORT_TEMP_PASSWORD = 'Voicebox@123';

export const GET: RequestHandler = async (event) => {
	const guard = await requireAccount(event, 'admin');
	if ('response' in guard) return guard.response;

	const data = await exportAll();
	const payload = {
		app: 'VoiceBox',
		version: 1,
		exportedAt: new Date().toISOString(),
		note: 'Account credentials are not included in backups. Imported accounts get a temporary password.',
		data: {
			...data,
			// Credentials are stripped: a backup never carries passwords or hashes.
			accounts: data.accounts.map(({ cred: _cred, ...rest }) => ({ ...rest, credRemoved: true })),
			lockouts: {}
		}
	};

	return new Response(JSON.stringify(payload, null, 2), {
		headers: {
			'content-type': 'application/json',
			'content-disposition': `attachment; filename="VoiceBox_Backup_${new Date().toISOString().slice(0, 10)}.json"`,
			'cache-control': 'no-store'
		}
	});
};

export const POST: RequestHandler = async (event) => {
	const guard = await requireAccount(event, 'admin');
	if ('response' in guard) return guard.response;

	const body = await readJson<{ action?: unknown; backup?: unknown; email?: unknown }>(event, 8_000_000);
	const action = str(body?.action, 20);

	if (action === 'unlock') {
		// Admin/HR need this for real: with a shared server-side counter, a
		// colleague who mistypes five times is locked out until it expires, and
		// HR must be able to release that immediately.
		const email = str(body?.email, 320).toLowerCase();
		const cleared = await clearAllLockouts(email || undefined);
		return ok({ message: email ? `Sign-in unlocked for ${email}.` : `Cleared ${cleared} sign-in lockout(s).`, cleared });
	}

	if (action === 'sample') {
		const sample = await buildSampleDatabase();
		await replaceAll({
			settings: sample.settings,
			accounts: sample.accounts,
			feedback: sample.feedback,
			pulse: sample.pulse,
			participation: sample.participation,
			notifications: sample.notifications
		});
		return ok({ message: 'Sample data loaded for every device.' });
	}

	if (action === 'fresh') {
		// Keep the acting admin so the organisation is not locked out entirely.
		const me = (await listAccounts()).find((a) => a.id === guard.account.id);
		await wipeAll();
		if (me) await insertAccount(me);
		return ok({ message: 'All shared data was cleared. Your admin account was kept so you can sign back in.' });
	}

	if (action === 'import') {
		const raw = body?.backup;
		const source = (raw && typeof raw === 'object' && 'data' in (raw as object) ? (raw as { data: unknown }).data : raw) as Partial<Database> | null;
		if (!source || !Array.isArray(source.feedback) || !Array.isArray(source.accounts)) {
			return fail('That backup does not look like a VoiceBox export.', 422);
		}
		// Backups carry no credentials, so imported accounts get a known temporary
		// password that the admin must communicate.
		const cred = await hashPassword(IMPORT_TEMP_PASSWORD, 10_000);
		const accounts: Account[] = (source.accounts as Account[]).map((a) => ({ ...a, cred: a.cred ?? cred }));
		const next = migrate({ ...source, accounts }, emptyDatabase());
		await replaceAll({
			settings: next.settings,
			accounts: next.accounts,
			feedback: next.feedback,
			pulse: next.pulse,
			participation: next.participation,
			notifications: next.notifications
		});
		return ok({ message: 'Backup imported for every device.', tempPassword: IMPORT_TEMP_PASSWORD });
	}

	return fail('Unknown action.', 422);
};
