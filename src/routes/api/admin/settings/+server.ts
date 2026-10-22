// PATCH /api/admin/settings - update shared settings.
//
// Settings now affect everyone, so they are validated and stored centrally:
// changing the anonymity threshold or the SLA days applies to every device.
// Theme is the one exception - it is a personal preference.
import type { RequestHandler } from './$types';
import { authenticate } from '$lib/server/auth.ts';
import { dbReady } from '$lib/server/guards.ts';
import { ensureSeeded, fail, ok, readJson, str } from '$lib/server/api.ts';
import { getSettings, saveSettings } from '$lib/server/db.ts';
import { CONFIDENTIAL_CATEGORY, PRIORITIES, type Priority, type Settings } from '$lib/core/types.ts';

export const PATCH: RequestHandler = async (event) => {
	const notReady = dbReady();
	if (notReady) return notReady;
	try {
		await ensureSeeded();
	} catch (e) {
		return fail(`The shared database is unreachable: ${e instanceof Error ? e.message : String(e)}`, 503);
	}

	const body = await readJson<Record<string, unknown>>(event, 200_000);
	if (!body) return fail('Request body must be valid JSON.');

	const auth = await authenticate(event.cookies);
	if (!auth.account) return fail(auth.reason ?? 'Sign in to continue.', 401);

	// Theme is a personal preference and is allowed for any signed-in user;
	// everything else is Admin/HR only.
	const themeOnly = Object.keys(body).length === 1 && 'theme' in body;
	if (!themeOnly && auth.account.role !== 'admin') return fail('Only Admin/HR can change settings.', 403);

	const current = await getSettings();
	const next: Settings = { ...current };

	if (body.theme === 'light' || body.theme === 'dark') next.theme = body.theme;

	if (!themeOnly) {
		if (typeof body.companyName === 'string') next.companyName = str(body.companyName, 120) || 'Company';

		if (Array.isArray(body.departments)) {
			const depts = body.departments.map((d) => str(d, 120)).filter(Boolean);
			if (!depts.length) return fail('At least one department is required.', 422);
			next.departments = [...new Set(depts)];
		}

		if (Array.isArray(body.categories)) {
			const cats = body.categories.map((c) => str(c, 120)).filter(Boolean);
			if (!cats.length) return fail('At least one category is required.', 422);
			// The confidential category drives the Admin-only visibility rule, so it
			// can never be removed.
			if (!cats.includes(CONFIDENTIAL_CATEGORY)) cats.push(CONFIDENTIAL_CATEGORY);
			next.categories = [...new Set(cats)];
		}

		if (body.sla && typeof body.sla === 'object') {
			const incoming = body.sla as Record<string, { respond?: unknown; resolve?: unknown }>;
			const sla = { ...next.sla };
			for (const p of PRIORITIES) {
				const row = incoming[p];
				if (!row) continue;
				const respond = Number(row.respond);
				const resolve = Number(row.resolve);
				if (Number.isFinite(respond) && Number.isFinite(resolve)) {
					sla[p as Priority] = {
						respond: Math.max(1, Math.min(365, Math.round(respond))),
						resolve: Math.max(1, Math.min(365, Math.round(resolve)))
					};
				}
			}
			next.sla = sla;
		}

		if (body.anonymityThreshold !== undefined) {
			const t = Number(body.anonymityThreshold);
			if (!Number.isFinite(t)) return fail('The anonymity threshold must be a number.', 422);
			next.anonymityThreshold = Math.max(1, Math.min(500, Math.round(t)));
		}

		if (Array.isArray(body.pulseQuestions)) {
			// Only the wording is editable; ids and kinds are structural.
			next.pulseQuestions = current.pulseQuestions.map((q) => {
				const incoming = (body.pulseQuestions as Array<{ id?: unknown; text?: unknown }>).find((x) => str(x?.id, 120) === q.id);
				const text = str(incoming?.text, 300);
				return text ? { ...q, text } : q;
			});
		}

		if (Array.isArray(body.sentimentPositive)) next.sentimentPositive = body.sentimentPositive.map((w) => str(w, 40).toLowerCase()).filter(Boolean);
		if (Array.isArray(body.sentimentNegative)) next.sentimentNegative = body.sentimentNegative.map((w) => str(w, 40).toLowerCase()).filter(Boolean);
	}

	await saveSettings(next);
	return ok({ settings: next });
};
