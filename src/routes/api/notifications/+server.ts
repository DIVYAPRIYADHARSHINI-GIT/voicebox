// GET  /api/notifications - my notifications (filtered server-side by account)
// POST /api/notifications - mark one or all as read, or refresh derived ones
//
// Notifications are per-account rows in the shared database, so an employee
// sees a manager's response on any device they sign in from.
import type { RequestHandler } from './$types';
import { fail, ok, readJson, requireAccount, str } from '$lib/server/api.ts';
import {
	countUnread,
	hasAnswered,
	listFeedbackForStaff,
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead,
	notificationExists
} from '$lib/server/db.ts';
import { notify } from '$lib/server/notify.ts';
import { CONFIDENTIAL_CATEGORY } from '$lib/core/types.ts';
import { isOverdue } from '$lib/core/rules.ts';
import { weekKey } from '$lib/core/time.ts';

/** Any signed-in role may read its own notifications. */
async function anyAccount(event: Parameters<RequestHandler>[0]) {
	const staff = await requireAccount(event, 'staff');
	if (!('response' in staff)) return staff;
	return requireAccount(event, 'employee');
}

export const GET: RequestHandler = async (event) => {
	const guard = await anyAccount(event);
	if ('response' in guard) return guard.response;
	const { account } = guard;
	return ok({ items: await listNotifications(account.id), unread: await countUnread(account.id) });
};

export const POST: RequestHandler = async (event) => {
	const guard = await anyAccount(event);
	if ('response' in guard) return guard.response;
	const { account, settings } = guard;

	const body = await readJson<{ action?: unknown; id?: unknown }>(event, 5000);
	const action = str(body?.action, 20);

	if (action === 'read-all') {
		await markAllNotificationsRead(account.id);
	} else if (action === 'read') {
		await markNotificationRead(account.id, str(body?.id, 120));
	} else if (action === 'refresh') {
		// Time-derived notifications: overdue items I own, and a pulse reminder.
		// Generated here (not in a reactive client effect) so they cannot loop.
		if (account.role !== 'employee') {
			const items = await listFeedbackForStaff(account, CONFIDENTIAL_CATEGORY);
			for (const item of items) {
				if (item.ownerId !== account.id || !isOverdue(item, Date.now(), settings.sla)) continue;
				const marker = `overdue:${item.id}`;
				if (await notificationExists(account.id, marker)) continue;
				await notify(account.id, 'overdue', `Overdue: ${item.title}`, `/manager?item=${item.id}#${marker}`);
			}
		} else {
			const week = weekKey(Date.now());
			const marker = `pulse:${week}`;
			if (!(await hasAnswered(account.id, week)) && !(await notificationExists(account.id, marker))) {
				await notify(account.id, 'pulse', 'This week\u2019s pulse survey is available', `/app/pulse#${marker}`);
			}
		}
	} else {
		return fail('Unknown action.', 422);
	}

	return ok({ items: await listNotifications(account.id), unread: await countUnread(account.id) });
};
