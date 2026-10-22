import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Liveness check for the serverless functions (used by the e2e suite). */
export const GET: RequestHandler = async () =>
	json({ ok: true, app: 'VoiceBox', mode: 'demo', storage: 'browser-localStorage', at: new Date().toISOString() });
