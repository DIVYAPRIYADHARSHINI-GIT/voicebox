// Database schema and connection for the shared VoiceBox dataset.
//
// WHY POSTGRES (and not object storage)
// The first attempt at sharing stored the whole dataset as one JSON blob. That
// worked, but every single ticket rewrote the entire ~500 KB document, which
// burned through the storage provider's write quota and got the store
// suspended. Object storage is the wrong tool for a write-heavy record store.
//
// Postgres gives us what this app actually needs:
//   - one INSERT per ticket instead of a whole-document rewrite
//   - real row-level reads, so department scoping is a WHERE clause
//   - atomic updates without an application-level lock or revision counter
//
// Feedback keeps its nested detail (responses, notes, history, tags) in JSONB
// columns: those are always read and written with their parent row, so
// splitting them into separate tables would add joins for no benefit.
import { neon } from '@neondatabase/serverless';

const connectionString = () =>
	process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? '';

export const dbConfigured = () => Boolean(connectionString());

/** Lazily created so an unconfigured deployment fails with a clear message. */
let client: ReturnType<typeof neon> | null = null;

export function sql() {
	if (!client) {
		const url = connectionString();
		if (!url) throw new Error('No database connection string is configured.');
		client = neon(url);
	}
	return client;
}

/**
 * Creates the schema if it does not exist. Cheap enough to call on demand, and
 * guarded so concurrent cold starts cannot race each other.
 */
let migrated: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
	migrated ??= (async () => {
		const q = sql();

		await q`
			CREATE TABLE IF NOT EXISTS accounts (
				id            TEXT PRIMARY KEY,
				name          TEXT NOT NULL,
				email         TEXT NOT NULL UNIQUE,
				role          TEXT NOT NULL CHECK (role IN ('employee', 'manager', 'admin')),
				department    TEXT NOT NULL,
				title         TEXT,
				active        BOOLEAN NOT NULL DEFAULT TRUE,
				created_at    BIGINT NOT NULL,
				cred          JSONB NOT NULL,
				must_change   BOOLEAN NOT NULL DEFAULT FALSE
			)`;

		await q`
			CREATE TABLE IF NOT EXISTS feedback (
				id               TEXT PRIMARY KEY,
				title            TEXT NOT NULL,
				description      TEXT NOT NULL,
				type             TEXT NOT NULL,
				category         TEXT NOT NULL,
				department       TEXT NOT NULL,
				urgency          TEXT NOT NULL,
				anonymous        BOOLEAN NOT NULL,
				-- NULL for anonymous items: the columns are simply never populated.
				author_id        TEXT,
				author_name      TEXT,
				tracking_code    TEXT,
				created_at       BIGINT NOT NULL,
				updated_at       BIGINT NOT NULL,
				status           TEXT NOT NULL,
				priority         TEXT NOT NULL,
				sentiment        TEXT NOT NULL,
				sentiment_over   BOOLEAN NOT NULL DEFAULT FALSE,
				owner_id         TEXT,
				owner_name       TEXT,
				due_date         BIGINT,
				is_public        BOOLEAN NOT NULL DEFAULT FALSE,
				first_response_at BIGINT,
				resolved_at      BIGINT,
				decline_reason   TEXT,
				tags             JSONB NOT NULL DEFAULT '[]'::jsonb,
				upvotes          JSONB NOT NULL DEFAULT '[]'::jsonb,
				comments         JSONB NOT NULL DEFAULT '[]'::jsonb,
				responses        JSONB NOT NULL DEFAULT '[]'::jsonb,
				notes            JSONB NOT NULL DEFAULT '[]'::jsonb,
				history          JSONB NOT NULL DEFAULT '[]'::jsonb,
				read_by          JSONB NOT NULL DEFAULT '[]'::jsonb
			)`;

		// The manager inbox filters by department and sorts by recency.
		await q`CREATE INDEX IF NOT EXISTS feedback_department_idx ON feedback (department, created_at DESC)`;
		await q`CREATE INDEX IF NOT EXISTS feedback_author_idx ON feedback (author_id) WHERE author_id IS NOT NULL`;
		// Tracking codes are looked up directly and must be unique.
		await q`CREATE UNIQUE INDEX IF NOT EXISTS feedback_code_idx ON feedback (tracking_code) WHERE tracking_code IS NOT NULL`;

		await q`
			CREATE TABLE IF NOT EXISTS pulse_responses (
				id          TEXT PRIMARY KEY,
				week        TEXT NOT NULL,
				at          BIGINT NOT NULL,
				-- Department only. There is deliberately NO account reference here.
				department  TEXT NOT NULL,
				scores      JSONB NOT NULL,
				comment     TEXT
			)`;
		await q`CREATE INDEX IF NOT EXISTS pulse_week_idx ON pulse_responses (week, department)`;

		// Participation is stored SEPARATELY from answers, with no foreign key to
		// pulse_responses, so an answer can never be traced back to a person.
		await q`
			CREATE TABLE IF NOT EXISTS pulse_participation (
				key TEXT PRIMARY KEY,
				at  BIGINT NOT NULL
			)`;

		await q`
			CREATE TABLE IF NOT EXISTS notifications (
				id          TEXT PRIMARY KEY,
				account_id  TEXT NOT NULL,
				at          BIGINT NOT NULL,
				kind        TEXT NOT NULL,
				text        TEXT NOT NULL,
				href        TEXT NOT NULL,
				read        BOOLEAN NOT NULL DEFAULT FALSE
			)`;
		await q`CREATE INDEX IF NOT EXISTS notifications_account_idx ON notifications (account_id, at DESC)`;

		// Sign-in lockouts, keyed by email. Server-side so clearing browser
		// storage cannot reset the counter.
		await q`
			CREATE TABLE IF NOT EXISTS lockouts (
				email        TEXT PRIMARY KEY,
				fails        INTEGER NOT NULL DEFAULT 0,
				last_fail_at BIGINT NOT NULL,
				locked_until BIGINT
			)`;

		// Settings are a single row of JSON: small, read often, written rarely.
		await q`
			CREATE TABLE IF NOT EXISTS settings (
				id   BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
				data JSONB NOT NULL
			)`;
	})().catch((e) => {
		// Let the next request retry rather than caching a failed migration.
		migrated = null;
		throw e;
	});
	return migrated;
}
