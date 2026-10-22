// POST /api/feedback/track - look up an anonymous item by its tracking code.
//
// Public on purpose: the code is the credential. Now that storage is shared, a
// code issued on a phone resolves from a laptop, which is the whole point of
// giving one out. The response contains only what the submitter is entitled to
// see: status, public responses and history - never internal notes.
import type { RequestHandler } from './$types';
import { dbReady } from '$lib/server/guards.ts';
import { ensureSeeded, fail, ok, readJson, str } from '$lib/server/api.ts';
import { feedbackByCode } from '$lib/server/db.ts';
import { isValidTrackingCode, normalizeTrackingCode } from '$lib/core/rules.ts';

export const POST: RequestHandler = async (event) => {
	const notReady = dbReady();
	if (notReady) return notReady;

	const body = await readJson<{ code?: unknown }>(event, 2000);
	const code = str(body?.code, 40);
	if (!isValidTrackingCode(code)) return fail('A tracking code is 10 characters. Check the code and try again.', 422);

	try {
		await ensureSeeded();
	} catch (e) {
		return fail(`The shared database is unreachable: ${e instanceof Error ? e.message : String(e)}`, 503);
	}

	const found = await feedbackByCode(normalizeTrackingCode(code));
	if (!found) return fail('No feedback was found for that code. Codes cannot be recovered, so please check it carefully.', 404);

	// Explicit allow-list: nothing identifying, no internal notes.
	return ok({
		item: {
			id: found.id,
			title: found.title,
			description: found.description,
			type: found.type,
			category: found.category,
			department: found.department,
			urgency: found.urgency,
			anonymous: true,
			createdAt: found.createdAt,
			updatedAt: found.updatedAt,
			status: found.status,
			declineReason: found.declineReason,
			responses: found.responses,
			history: found.history,
			tags: found.tags,
			isPublic: found.isPublic,
			upvotes: found.upvotes.length
		}
	});
};
