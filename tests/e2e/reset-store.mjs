// Test fixture reset for the SHARED database.
//
// With one server-side dataset, test runs are no longer isolated the way
// per-browser localStorage runs were:
//  - the login lockout is shared, so a previous run's failed attempts can lock
//    a demo account for the next run (correct product behaviour, but it makes
//    the suite non-deterministic);
//  - load-test records accumulate.
//
// This clears exactly those two things. It is a test utility and is never
// imported by the app.
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

export async function resetStore({ quiet = false } = {}) {
	const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
	if (!url) {
		if (!quiet) console.log('reset-store: no DATABASE_URL, skipping');
		return { skipped: true };
	}

	const sql = neon(url);
	try {
		const [lock] = await sql`DELETE FROM lockouts RETURNING email`.then((r) => [r.length]);
		const [load] = await sql`DELETE FROM feedback WHERE title ~ '^(LOAD|CONC)[A-Z0-9]{4} ' RETURNING id`.then((r) => [r.length]);
		if (!quiet) console.log(`reset-store: cleared ${lock} lockout(s), removed ${load} load record(s)`);
		return { lockouts: lock, removed: load };
	} catch (e) {
		// A fresh database has no tables yet; the app creates them on first use.
		if (!quiet) console.log('reset-store: nothing to clear yet -', e.message.split('\n')[0]);
		return { skipped: true };
	}
}

// Allow running it directly: `node tests/e2e/reset-store.mjs`.
// pathToFileURL handles paths containing spaces, which a template literal does not.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	await resetStore();
}
