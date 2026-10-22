// POST /api/auth/logout - clears the signed session cookie.
import type { RequestHandler } from './$types';
import { clearSessionCookie } from '$lib/server/auth.ts';
import { ok } from '$lib/server/api.ts';

export const POST: RequestHandler = async (event) => {
	clearSessionCookie(event.cookies);
	return ok({});
};
