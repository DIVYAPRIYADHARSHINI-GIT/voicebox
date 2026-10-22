// GET  /api/pulse - results (staff) or "have I answered this week?" (employee)
// POST /api/pulse - submit this week's response
//
// ANONYMITY, SERVER-SIDE
// The answer row stores the department and nothing else. The "already answered"
// marker lives in a SEPARATE table with no reference to the answer, so even
// full database access cannot link a person to their responses.
//
// Employees never receive raw pulse rows; staff receive aggregates that the
// anonymity threshold has already been applied to.
import type { RequestHandler } from './$types';
import { authenticate } from '$lib/server/auth.ts';
import { dbReady } from '$lib/server/guards.ts';
import { ensureSeeded, fail, ok, readJson, requireAccount, str } from '$lib/server/api.ts';
import { getSettings, hasAnswered, insertPulse, listPulse } from '$lib/server/db.ts';
import { weekKey } from '$lib/core/time.ts';
import { pulseByDepartment, summarizePulse } from '$lib/core/stats.ts';
import { id as newId } from '$lib/core/seed.ts';
import type { PulseResponse } from '$lib/core/types.ts';

export const GET: RequestHandler = async (event) => {
	const notReady = dbReady();
	if (notReady) return notReady;
	try {
		await ensureSeeded();
	} catch (e) {
		return fail(`The shared database is unreachable: ${e instanceof Error ? e.message : String(e)}`, 503);
	}

	const auth = await authenticate(event.cookies);
	if (!auth.account) return fail(auth.reason ?? 'Sign in to continue.', 401, { reason: auth.status });
	const account = auth.account;
	const settings = await getSettings();
	const week = weekKey(Date.now());

	if (account.role === 'employee') {
		// Only the participation marker is readable - never anyone's answers.
		return ok({ week, answered: await hasAnswered(account.id, week), questions: settings.pulseQuestions });
	}

	// Managers see their own department only.
	const rows = account.role === 'admin' ? await listPulse() : await listPulse(account.department);
	const departments = account.role === 'admin' ? settings.departments : [account.department];

	return ok({
		week,
		overall: summarizePulse(rows, settings),
		byDepartment: pulseByDepartment(rows, settings, departments).map((d) => ({
			department: d.department,
			responses: d.summary.responses,
			shown: d.summary.shown,
			scores: d.summary.shown ? d.summary.scores : [],
			enps: d.summary.shown ? d.summary.enps : null
		})),
		threshold: settings.anonymityThreshold
	});
};

export const POST: RequestHandler = async (event) => {
	const guard = await requireAccount(event, 'employee');
	if ('response' in guard) return guard.response;
	const { account, settings } = guard;

	const body = await readJson<{ scores?: unknown; comment?: unknown }>(event, 20_000);
	const rawScores = body?.scores && typeof body.scores === 'object' ? (body.scores as Record<string, unknown>) : null;
	if (!rawScores) return fail('Scores are required.');

	// Accept only the configured questions, clamped to their valid range.
	const scores: Record<string, number> = {};
	for (const q of settings.pulseQuestions) {
		if (q.kind === 'comment') continue;
		const raw = rawScores[q.id];
		if (typeof raw !== 'number' || !Number.isFinite(raw)) return fail('Please answer every scored question.', 422);
		const max = q.kind === 'nps' ? 10 : 5;
		const min = q.kind === 'nps' ? 0 : 1;
		scores[q.id] = Math.max(min, Math.min(max, Math.round(raw)));
	}
	if (Object.keys(scores).length === 0) return fail('Please answer every scored question.', 422);

	const week = weekKey(Date.now());
	const response: PulseResponse = {
		id: newId('pulse'),
		week,
		at: Date.now(),
		// Department only - never a name or account id.
		department: account.department,
		scores,
		comment: str(body?.comment, 400) || undefined
	};

	const accepted = await insertPulse(account.id, week, response);
	if (!accepted) return fail('You have already answered this week\u2019s pulse.', 409);
	return ok({ week });
};
