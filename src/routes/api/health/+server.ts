import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { storageInfo } from '$lib/server/db.ts';

/**
 * Liveness + storage diagnostics. `storage.configured: false` means the database
 * URL is missing, which is exactly the condition that would silently break
 * cross-device sharing, so it is surfaced explicitly.
 */
export const GET: RequestHandler = async () => {
	const storage = await storageInfo();
	return json({
		ok: true,
		app: 'VoiceBox',
		mode: storage.configured && storage.reachable ? 'shared' : 'unconfigured',
		storage: { kind: 'postgres', ...storage },
		at: new Date().toISOString()
	});
};
