// PATCH /api/feedback/:id - triage actions (staff only).
//
// Every action re-checks that this viewer may touch this item, so a manager
// cannot act on another department's feedback or a confidential report by
// guessing an id. The actor recorded in the history comes from the session.
import type { RequestHandler } from './$types';
import { canAccessItem } from '$lib/server/auth.ts';
import { fail, ok, readJson, requireAccount, str } from '$lib/server/api.ts';
import { feedbackById, listOwners, setReadBy, updateFeedback } from '$lib/server/db.ts';
import { notify } from '$lib/server/notify.ts';
import { PRIORITIES, SENTIMENTS, STATUSES, type Priority, type Sentiment, type Status } from '$lib/core/types.ts';
import { checkTransition } from '$lib/core/rules.ts';
import { id as newId } from '$lib/core/seed.ts';

type Action =
	| { action: 'status'; status: Status; reason?: string }
	| { action: 'priority'; priority: Priority }
	| { action: 'sentiment'; sentiment: Sentiment }
	| { action: 'owner'; ownerId: string }
	| { action: 'due'; dueDate: number | null }
	| { action: 'tag-add'; tag: string }
	| { action: 'tag-remove'; tag: string }
	| { action: 'note'; text: string }
	| { action: 'response'; text: string }
	| { action: 'read'; read: boolean };

export const PATCH: RequestHandler = async (event) => {
	const guard = await requireAccount(event, 'staff');
	if ('response' in guard) return guard.response;
	const actor = guard.account;

	const body = await readJson<Action>(event, 100_000);
	if (!body?.action) return fail('An action is required.');

	const item = await feedbackById(event.params.id);
	if (!item) return fail('That feedback no longer exists.', 404);
	// Authoritative per-item access check.
	if (!canAccessItem(item, actor)) return fail('Your account does not have access to that item.', 403);

	const at = Date.now();
	const log = (note: string, from?: Status, to?: Status) => {
		item.history = [...item.history, { at, actorRole: actor.role, actorName: actor.name, from, to, note }];
		item.updatedAt = at;
	};
	const notifyAuthor = async (kind: 'status' | 'response', text: string) => {
		if (!item.authorId) return; // anonymous: nobody to notify
		await notify(item.authorId, kind, text, `/app/my-feedback?item=${item.id}`, at);
	};

	switch (body.action) {
		case 'status': {
			if (!STATUSES.includes(body.status)) return fail('Unknown status.', 422);
			const reason = str(body.reason, 1000);
			const check = checkTransition(item.status, body.status, reason);
			if (!check.ok) return fail(check.error ?? 'Invalid transition.', 422);
			const from = item.status;
			item.status = body.status;
			if (body.status === 'Resolved') item.resolvedAt = at;
			if (body.status === 'Declined') item.declineReason = reason;
			if (from === 'Resolved' && body.status !== 'Resolved') item.resolvedAt = undefined;
			log(body.status === 'Declined' ? `Declined: ${reason}` : `Status changed to ${body.status}`, from, body.status);
			await notifyAuthor('status', `Your feedback "${item.title}" is now ${body.status}`);
			break;
		}
		case 'priority': {
			if (!PRIORITIES.includes(body.priority)) return fail('Unknown priority.', 422);
			if (item.priority === body.priority) break;
			const was = item.priority;
			item.priority = body.priority;
			log(`Priority changed from ${was} to ${body.priority}`);
			break;
		}
		case 'sentiment': {
			if (!SENTIMENTS.includes(body.sentiment)) return fail('Unknown sentiment.', 422);
			if (item.sentiment === body.sentiment) break;
			const was = item.sentiment;
			item.sentiment = body.sentiment;
			item.sentimentOverridden = true;
			log(`Sentiment overridden from ${was} to ${body.sentiment}`);
			break;
		}
		case 'owner': {
			const owners = await listOwners();
			const owner = owners.find((a) => a.id === body.ownerId);
			if (body.ownerId && !owner) return fail('Unknown owner.', 422);
			item.ownerId = owner?.id;
			item.ownerName = owner?.name;
			log(owner ? `Owner set to ${owner.name}` : 'Owner cleared');
			if (owner && owner.id !== actor.id) await notify(owner.id, 'assigned', `You were assigned: ${item.title}`, `/manager?item=${item.id}`, at);
			break;
		}
		case 'due': {
			const due = typeof body.dueDate === 'number' && Number.isFinite(body.dueDate) ? body.dueDate : undefined;
			item.dueDate = due;
			log(due ? `Due date set to ${new Date(due).toLocaleDateString()}` : 'Due date cleared');
			break;
		}
		case 'tag-add': {
			const tag = str(body.tag, 40).toLowerCase().replace(/\s+/g, '-');
			if (!tag || item.tags.includes(tag)) break;
			item.tags = [...item.tags, tag];
			log(`Tag added: ${tag}`);
			break;
		}
		case 'tag-remove': {
			const tag = str(body.tag, 40);
			item.tags = item.tags.filter((t) => t !== tag);
			log(`Tag removed: ${tag}`);
			break;
		}
		case 'note': {
			const text = str(body.text, 2000);
			if (!text) return fail('A note cannot be empty.', 422);
			item.notes = [...item.notes, { id: newId('note'), at, authorId: actor.id, authorName: actor.name, text }];
			item.updatedAt = at;
			break;
		}
		case 'response': {
			const text = str(body.text, 2000);
			if (!text) return fail('A response cannot be empty.', 422);
			item.responses = [...item.responses, { id: newId('resp'), at, authorRole: actor.role, authorName: actor.name, text }];
			if (!item.firstResponseAt) item.firstResponseAt = at;
			log('Public response added');
			await notifyAuthor('response', `A response was added to "${item.title}"`);
			break;
		}
		case 'read': {
			// Scoped to the read_by column so it cannot revert a concurrent triage
			// change (opening a row marks it read, often moments before a status edit).
			await setReadBy(item.id, actor.id, body.read);
			const has = item.readBy.includes(actor.id);
			if (body.read && !has) item.readBy = [...item.readBy, actor.id];
			if (!body.read && has) item.readBy = item.readBy.filter((x) => x !== actor.id);
			return ok({ item });
		}
		default:
			return fail('Unknown action.', 422);
	}

	await updateFeedback(item);
	return ok({ item });
};
