// GET /api/auth/me - who am I, and what does this portal need to render?
//
// Returns the signed-in account plus the shared settings. Credentials are never
// included. This is the single source of truth the client trusts for the
// current role, replacing the old browser-held session.
import type { RequestHandler } from './$types';
import { authenticate } from '$lib/server/auth.ts';
import { dbReady } from '$lib/server/guards.ts';
import { ensureSeeded, fail, ok } from '$lib/server/api.ts';
import { getSettings } from '$lib/server/db.ts';

export const GET: RequestHandler = async (event) => {
	const notReady = dbReady();
	if (notReady) return notReady;

	try {
		await ensureSeeded();
	} catch (e) {
		return fail(`The shared database is unreachable: ${e instanceof Error ? e.message : String(e)}`, 503);
	}

	const auth = await authenticate(event.cookies);
	const all = await getSettings();

	// Categories/departments drive the public submit form, so they are always
	// returned; the SLA table and sentiment lexicon are only useful to staff.
	const settings = {
		companyName: all.companyName,
		departments: all.departments,
		categories: all.categories,
		anonymityThreshold: all.anonymityThreshold,
		pulseQuestions: all.pulseQuestions,
		theme: all.theme,
		...(auth.account && auth.account.role !== 'employee'
			? { sla: all.sla, sentimentPositive: all.sentimentPositive, sentimentNegative: all.sentimentNegative }
			: {})
	};

	if (!auth.account) return ok({ account: null, reason: auth.reason ?? null, status: auth.status, settings });

	const { cred: _cred, ...safe } = auth.account;
	return ok({ account: safe, status: auth.status, settings });
};
