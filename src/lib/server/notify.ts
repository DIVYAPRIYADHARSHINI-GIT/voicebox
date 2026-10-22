// Typed helper for creating a notification row.
//
// Kept in one place so `kind` is always the literal union (not `string`) and
// every call site is correct by construction.
import type { Notification } from '../core/types.ts';
import { insertNotification } from './db.ts';
import { id as newId } from '../core/seed.ts';

export async function notify(
	accountId: string,
	kind: Notification['kind'],
	text: string,
	href: string,
	at = Date.now()
): Promise<void> {
	await insertNotification({ id: newId('ntf'), accountId, at, kind, text, href, read: false });
}
