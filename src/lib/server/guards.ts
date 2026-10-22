// Small guard helpers kept separate from api.ts to avoid an import cycle
// (api.ts needs these; auth.ts must not depend on api.ts).
import { json } from '@sveltejs/kit';
import { dbConfigured } from './schema.ts';

export { authenticate } from './auth.ts';

/**
 * Returns an error Response when the shared database is not configured, so a
 * misconfigured deployment fails loudly instead of silently losing data or
 * falling back to per-browser storage (the original bug).
 */
export function dbReady(): Response | null {
	if (dbConfigured()) return null;
	return json(
		{
			ok: false,
			error: 'The shared database is not configured. Set DATABASE_URL (Neon Postgres) so feedback is visible across devices.'
		},
		{ status: 503 }
	);
}

/** Back-compat alias used by the routes. */
export const blobReady = dbReady;
