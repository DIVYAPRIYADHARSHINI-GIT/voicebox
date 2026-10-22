// POST /api/ideas - upvote (toggle) or comment on a public idea.
//
// One vote per person is enforced server-side against the shared row, so the
// count is a real organisation-wide tally rather than a per-browser number.
import type { RequestHandler } from './$types';
import { fail, ok, readJson, requireAccount, str } from '$lib/server/api.ts';
import { feedbackById, updateFeedback } from '$lib/server/db.ts';
import { COMMENT_MAX, canBePublic } from '$lib/core/rules.ts';
import { id as newId } from '$lib/core/seed.ts';

interface Body {
	itemId?: unknown;
	action?: unknown;
	text?: unknown;
}

export const POST: RequestHandler = async (event) => {
	// Voting and commenting are employee actions.
	const guard = await requireAccount(event, 'employee');
	if ('response' in guard) return guard.response;
	const actor = guard.account;

	const body = await readJson<Body>(event, 20_000);
	const itemId = str(body?.itemId, 120);
	const action = str(body?.action, 20);
	if (!itemId || (action !== 'upvote' && action !== 'comment')) return fail('An itemId and a valid action are required.');

	const item = await feedbackById(itemId);
	if (!item) return fail('That idea no longer exists.', 404);
	// Only genuinely public items are votable: confidential reports and concerns
	// about individuals never are.
	if (!item.isPublic || !canBePublic(item)) return fail('That item cannot be voted on or commented.', 403);

	if (action === 'upvote') {
		item.upvotes = item.upvotes.includes(actor.id) ? item.upvotes.filter((x) => x !== actor.id) : [...item.upvotes, actor.id];
	} else {
		const text = str(body?.text, COMMENT_MAX);
		if (!text) return fail('A comment cannot be empty.', 422);
		item.comments = [...item.comments, { id: newId('cmt'), at: Date.now(), authorId: actor.id, authorName: actor.name, text }];
	}
	item.updatedAt = Date.now();
	await updateFeedback(item);

	return ok({ upvotes: item.upvotes.length, voted: item.upvotes.includes(actor.id), comments: item.comments });
};
