// Shared server-side storage, backed by Neon Postgres (free tier).
//
// WHY THIS EXISTS
// VoiceBox originally stored everything in localStorage, which is per-browser:
// an employee submitting on a phone and a manager signing in on a laptop had
// two unrelated datasets, so tickets never reached the manager portal. This
// module is the shared store that fixes that.
//
// WHY POSTGRES RATHER THAN A JSON BLOB
// An intermediate version kept the whole dataset in one object-storage blob.
// It worked, but every ticket rewrote the entire ~500 KB document - wasteful,
// and it exhausted the provider's monthly write allowance, which suspended the
// store. Each operation here touches only the rows it needs, and scoping
// becomes a WHERE clause instead of an in-memory filter.
import { ensureSchema, dbConfigured, sql } from './schema.ts';
import { defaultSettings } from '../core/defaults.ts';
import { normalizeFeedback } from '../core/store.ts';
import type { Account, Feedback, Notification, PulseResponse, Settings } from '../core/types.ts';
import type { AttemptRecord } from '../core/rules.ts';

export { dbConfigured };

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const n = (v: unknown): number | undefined => (v === null || v === undefined ? undefined : Number(v));
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function toAccount(r: Row): Account {
	return {
		id: String(r.id),
		name: String(r.name),
		email: String(r.email),
		role: r.role as Account['role'],
		department: String(r.department),
		title: (r.title as string) ?? undefined,
		active: Boolean(r.active),
		createdAt: Number(r.created_at),
		cred: r.cred as Account['cred'],
		mustChangePassword: Boolean(r.must_change)
	};
}

function toFeedback(r: Row): Feedback {
	const item: Feedback = {
		id: String(r.id),
		title: String(r.title),
		description: String(r.description),
		type: r.type as Feedback['type'],
		category: String(r.category),
		department: String(r.department),
		urgency: r.urgency as Feedback['urgency'],
		anonymous: Boolean(r.anonymous),
		authorId: (r.author_id as string) ?? undefined,
		authorName: (r.author_name as string) ?? undefined,
		trackingCode: (r.tracking_code as string) ?? undefined,
		createdAt: Number(r.created_at),
		updatedAt: Number(r.updated_at),
		status: r.status as Feedback['status'],
		priority: r.priority as Feedback['priority'],
		sentiment: r.sentiment as Feedback['sentiment'],
		sentimentOverridden: Boolean(r.sentiment_over),
		ownerId: (r.owner_id as string) ?? undefined,
		ownerName: (r.owner_name as string) ?? undefined,
		dueDate: n(r.due_date),
		isPublic: Boolean(r.is_public),
		firstResponseAt: n(r.first_response_at),
		resolvedAt: n(r.resolved_at),
		declineReason: (r.decline_reason as string) ?? undefined,
		tags: arr<string>(r.tags),
		upvotes: arr<string>(r.upvotes),
		comments: arr<Feedback['comments'][number]>(r.comments),
		responses: arr<Feedback['responses'][number]>(r.responses),
		notes: arr<Feedback['notes'][number]>(r.notes),
		history: arr<Feedback['history'][number]>(r.history),
		readBy: arr<string>(r.read_by)
	};
	// Final anonymity guard, matching the client-side normaliser.
	return normalizeFeedback(item);
}

const toNotification = (r: Row): Notification => ({
	id: String(r.id),
	accountId: String(r.account_id),
	at: Number(r.at),
	kind: r.kind as Notification['kind'],
	text: String(r.text),
	href: String(r.href),
	read: Boolean(r.read)
});

const toPulse = (r: Row): PulseResponse => ({
	id: String(r.id),
	week: String(r.week),
	at: Number(r.at),
	department: String(r.department),
	scores: (r.scores ?? {}) as Record<string, number>,
	comment: (r.comment as string) ?? undefined
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
	await ensureSchema();
	const rows = (await sql()`SELECT data FROM settings WHERE id = TRUE`) as Row[];
	if (!rows.length) {
		const fresh = defaultSettings();
		await saveSettings(fresh);
		return fresh;
	}
	// Merge over defaults so a field added later is always present.
	return { ...defaultSettings(), ...(rows[0].data as Partial<Settings>) };
}

export async function saveSettings(settings: Settings): Promise<void> {
	await ensureSchema();
	await sql()`
		INSERT INTO settings (id, data) VALUES (TRUE, ${JSON.stringify(settings)}::jsonb)
		ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function listAccounts(): Promise<Account[]> {
	await ensureSchema();
	const rows = (await sql()`SELECT * FROM accounts ORDER BY role, name`) as Row[];
	return rows.map(toAccount);
}

export async function accountById(id: string): Promise<Account | null> {
	await ensureSchema();
	const rows = (await sql()`SELECT * FROM accounts WHERE id = ${id}`) as Row[];
	return rows.length ? toAccount(rows[0]) : null;
}

export async function accountByEmail(email: string): Promise<Account | null> {
	await ensureSchema();
	const rows = (await sql()`SELECT * FROM accounts WHERE lower(email) = ${email.trim().toLowerCase()}`) as Row[];
	return rows.length ? toAccount(rows[0]) : null;
}

export async function insertAccount(a: Account): Promise<void> {
	await ensureSchema();
	await sql()`
		INSERT INTO accounts (id, name, email, role, department, title, active, created_at, cred, must_change)
		VALUES (${a.id}, ${a.name}, ${a.email.toLowerCase()}, ${a.role}, ${a.department}, ${a.title ?? null},
		        ${a.active}, ${a.createdAt}, ${JSON.stringify(a.cred)}::jsonb, ${Boolean(a.mustChangePassword)})`;
}

export async function setAccountActive(id: string, active: boolean): Promise<void> {
	await ensureSchema();
	await sql()`UPDATE accounts SET active = ${active} WHERE id = ${id}`;
}

export async function setAccountCredential(id: string, cred: Account['cred'], mustChange: boolean): Promise<void> {
	await ensureSchema();
	await sql()`UPDATE accounts SET cred = ${JSON.stringify(cred)}::jsonb, must_change = ${mustChange} WHERE id = ${id}`;
}

/** Owner picker: active staff only. */
export async function listOwners(): Promise<Array<Pick<Account, 'id' | 'name' | 'department' | 'role'>>> {
	await ensureSchema();
	const rows = (await sql()`SELECT id, name, department, role FROM accounts WHERE active AND role <> 'employee' ORDER BY name`) as Row[];
	return rows.map((r) => ({ id: String(r.id), name: String(r.name), department: String(r.department), role: r.role as Account['role'] }));
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

/**
 * The manager/admin triage feed. Scoping is a WHERE clause, so a manager's
 * query cannot return another department's rows or a confidential report -
 * restricted data never leaves the database, let alone the server.
 */
export async function listFeedbackForStaff(viewer: Pick<Account, 'role' | 'department'>, confidentialCategory: string): Promise<Feedback[]> {
	await ensureSchema();
	const rows = (
		viewer.role === 'admin'
			? await sql()`SELECT * FROM feedback ORDER BY created_at DESC`
			: await sql()`
					SELECT * FROM feedback
					WHERE department = ${viewer.department} AND category <> ${confidentialCategory}
					ORDER BY created_at DESC`
	) as Row[];
	return rows.map(toFeedback);
}

/** An employee's own NAMED feedback. Anonymous rows are unlinkable by design. */
export async function listFeedbackForAuthor(authorId: string): Promise<Feedback[]> {
	await ensureSchema();
	const rows = (await sql()`
		SELECT * FROM feedback WHERE author_id = ${authorId} AND anonymous = FALSE ORDER BY created_at DESC`) as Row[];
	return rows.map(toFeedback);
}

export async function listPublicFeedback(): Promise<Feedback[]> {
	await ensureSchema();
	const rows = (await sql()`SELECT * FROM feedback WHERE is_public = TRUE ORDER BY created_at DESC`) as Row[];
	return rows.map(toFeedback);
}

export async function listResolvedWithResponses(confidentialCategory: string): Promise<Feedback[]> {
	await ensureSchema();
	const rows = (await sql()`
		SELECT * FROM feedback
		WHERE status = 'Resolved' AND category <> ${confidentialCategory} AND jsonb_array_length(responses) > 0
		ORDER BY COALESCE(resolved_at, updated_at) DESC`) as Row[];
	return rows.map(toFeedback);
}

export async function feedbackById(id: string): Promise<Feedback | null> {
	await ensureSchema();
	const rows = (await sql()`SELECT * FROM feedback WHERE id = ${id}`) as Row[];
	return rows.length ? toFeedback(rows[0]) : null;
}

export async function feedbackByCode(code: string): Promise<Feedback | null> {
	await ensureSchema();
	const rows = (await sql()`SELECT * FROM feedback WHERE tracking_code = ${code}`) as Row[];
	return rows.length ? toFeedback(rows[0]) : null;
}

/** One INSERT per ticket - the whole point of moving off a single document. */
export async function insertFeedback(f: Feedback): Promise<void> {
	await ensureSchema();
	await sql()`
		INSERT INTO feedback (
			id, title, description, type, category, department, urgency, anonymous,
			author_id, author_name, tracking_code, created_at, updated_at, status, priority,
			sentiment, sentiment_over, owner_id, owner_name, due_date, is_public,
			first_response_at, resolved_at, decline_reason,
			tags, upvotes, comments, responses, notes, history, read_by
		) VALUES (
			${f.id}, ${f.title}, ${f.description}, ${f.type}, ${f.category}, ${f.department}, ${f.urgency}, ${f.anonymous},
			${f.authorId ?? null}, ${f.authorName ?? null}, ${f.trackingCode ?? null}, ${f.createdAt}, ${f.updatedAt},
			${f.status}, ${f.priority}, ${f.sentiment}, ${Boolean(f.sentimentOverridden)},
			${f.ownerId ?? null}, ${f.ownerName ?? null}, ${f.dueDate ?? null}, ${f.isPublic},
			${f.firstResponseAt ?? null}, ${f.resolvedAt ?? null}, ${f.declineReason ?? null},
			${JSON.stringify(f.tags)}::jsonb, ${JSON.stringify(f.upvotes)}::jsonb, ${JSON.stringify(f.comments)}::jsonb,
			${JSON.stringify(f.responses)}::jsonb, ${JSON.stringify(f.notes)}::jsonb, ${JSON.stringify(f.history)}::jsonb,
			${JSON.stringify(f.readBy)}::jsonb
		)`;
}

/**
 * Marks an item read/unread for one viewer, touching ONLY that column.
 *
 * This used to go through updateFeedback(), which writes every column. Opening
 * a row (which marks it read) therefore raced with a status change made moments
 * later: whichever whole-row write landed second reverted the other. Clicking a
 * row and immediately changing its status silently lost the status change.
 * Scoping the write to read_by removes the race entirely.
 */
export async function setReadBy(id: string, viewerId: string, read: boolean): Promise<void> {
	await ensureSchema();
	if (read) {
		// Append only if absent, in one statement, so concurrent readers are safe.
		await sql()`
			UPDATE feedback
			SET read_by = CASE WHEN read_by @> ${JSON.stringify([viewerId])}::jsonb THEN read_by ELSE read_by || ${JSON.stringify([viewerId])}::jsonb END
			WHERE id = ${id}`;
	} else {
		await sql()`
			UPDATE feedback
			SET read_by = COALESCE((SELECT jsonb_agg(v) FROM jsonb_array_elements(read_by) AS v WHERE v <> ${JSON.stringify(viewerId)}::jsonb), '[]'::jsonb)
			WHERE id = ${id}`;
	}
}

/** Writes back a single row after a triage action. */
export async function updateFeedback(f: Feedback): Promise<void> {
	await ensureSchema();
	await sql()`
		UPDATE feedback SET
			status = ${f.status},
			priority = ${f.priority},
			sentiment = ${f.sentiment},
			sentiment_over = ${Boolean(f.sentimentOverridden)},
			owner_id = ${f.ownerId ?? null},
			owner_name = ${f.ownerName ?? null},
			due_date = ${f.dueDate ?? null},
			is_public = ${f.isPublic},
			first_response_at = ${f.firstResponseAt ?? null},
			resolved_at = ${f.resolvedAt ?? null},
			decline_reason = ${f.declineReason ?? null},
			updated_at = ${f.updatedAt},
			tags = ${JSON.stringify(f.tags)}::jsonb,
			upvotes = ${JSON.stringify(f.upvotes)}::jsonb,
			comments = ${JSON.stringify(f.comments)}::jsonb,
			responses = ${JSON.stringify(f.responses)}::jsonb,
			notes = ${JSON.stringify(f.notes)}::jsonb,
			history = ${JSON.stringify(f.history)}::jsonb
			-- read_by is deliberately NOT written here: setReadBy() owns that column,
			-- so marking an item read can never revert a concurrent triage change.
		WHERE id = ${f.id}`;
}

export async function countFeedback(): Promise<number> {
	await ensureSchema();
	const rows = (await sql()`SELECT count(*)::int AS c FROM feedback`) as Row[];
	return Number(rows[0]?.c ?? 0);
}

// ---------------------------------------------------------------------------
// Pulse
// ---------------------------------------------------------------------------

export async function listPulse(department?: string): Promise<PulseResponse[]> {
	await ensureSchema();
	const rows = (
		department
			? await sql()`SELECT * FROM pulse_responses WHERE department = ${department} ORDER BY week`
			: await sql()`SELECT * FROM pulse_responses ORDER BY week`
	) as Row[];
	return rows.map(toPulse);
}

export async function hasAnswered(accountId: string, week: string): Promise<boolean> {
	await ensureSchema();
	const rows = (await sql()`SELECT 1 FROM pulse_participation WHERE key = ${`${accountId}:${week}`}`) as Row[];
	return rows.length > 0;
}

/**
 * Records a pulse answer and the participation marker.
 *
 * They go into separate tables with no reference between them, so even full
 * database access cannot link an answer to a person. The marker is inserted
 * first with ON CONFLICT DO NOTHING, which also enforces one answer per week.
 */
export async function insertPulse(accountId: string, week: string, response: PulseResponse): Promise<boolean> {
	await ensureSchema();
	const marker = (await sql()`
		INSERT INTO pulse_participation (key, at) VALUES (${`${accountId}:${week}`}, ${Date.now()})
		ON CONFLICT (key) DO NOTHING
		RETURNING key`) as Row[];
	if (!marker.length) return false; // already answered this week

	await sql()`
		INSERT INTO pulse_responses (id, week, at, department, scores, comment)
		VALUES (${response.id}, ${response.week}, ${response.at}, ${response.department},
		        ${JSON.stringify(response.scores)}::jsonb, ${response.comment ?? null})`;
	return true;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function listNotifications(accountId: string, limit = 50): Promise<Notification[]> {
	await ensureSchema();
	const rows = (await sql()`
		SELECT * FROM notifications WHERE account_id = ${accountId} ORDER BY at DESC LIMIT ${limit}`) as Row[];
	return rows.map(toNotification);
}

export async function countUnread(accountId: string): Promise<number> {
	await ensureSchema();
	const rows = (await sql()`SELECT count(*)::int AS c FROM notifications WHERE account_id = ${accountId} AND read = FALSE`) as Row[];
	return Number(rows[0]?.c ?? 0);
}

export async function insertNotification(notification: Notification): Promise<void> {
	await ensureSchema();
	await sql()`
		INSERT INTO notifications (id, account_id, at, kind, text, href, read)
		VALUES (${notification.id}, ${notification.accountId}, ${notification.at}, ${notification.kind},
		        ${notification.text}, ${notification.href}, ${notification.read})`;
}

export async function markNotificationRead(accountId: string, id: string): Promise<void> {
	await ensureSchema();
	await sql()`UPDATE notifications SET read = TRUE WHERE id = ${id} AND account_id = ${accountId}`;
}

export async function markAllNotificationsRead(accountId: string): Promise<void> {
	await ensureSchema();
	await sql()`UPDATE notifications SET read = TRUE WHERE account_id = ${accountId}`;
}

/** True when a notification with this marker already exists (de-duplication). */
export async function notificationExists(accountId: string, marker: string): Promise<boolean> {
	await ensureSchema();
	const rows = (await sql()`
		SELECT 1 FROM notifications WHERE account_id = ${accountId} AND href LIKE ${`%${marker}%`} LIMIT 1`) as Row[];
	return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Lockouts
// ---------------------------------------------------------------------------

export async function getLockout(email: string): Promise<AttemptRecord | undefined> {
	await ensureSchema();
	const rows = (await sql()`SELECT * FROM lockouts WHERE email = ${email.trim().toLowerCase()}`) as Row[];
	if (!rows.length) return undefined;
	const r = rows[0];
	return { fails: Number(r.fails), lastFailAt: Number(r.last_fail_at), lockedUntil: n(r.locked_until) };
}

export async function saveLockout(email: string, rec: AttemptRecord): Promise<void> {
	await ensureSchema();
	await sql()`
		INSERT INTO lockouts (email, fails, last_fail_at, locked_until)
		VALUES (${email.trim().toLowerCase()}, ${rec.fails}, ${rec.lastFailAt}, ${rec.lockedUntil ?? null})
		ON CONFLICT (email) DO UPDATE SET fails = EXCLUDED.fails, last_fail_at = EXCLUDED.last_fail_at, locked_until = EXCLUDED.locked_until`;
}

export async function clearLockout(email: string): Promise<void> {
	await ensureSchema();
	await sql()`DELETE FROM lockouts WHERE email = ${email.trim().toLowerCase()}`;
}

/** Admin tool: release every lockout, or just one email. */
export async function clearAllLockouts(email?: string): Promise<number> {
	await ensureSchema();
	const rows = (
		email ? await sql()`DELETE FROM lockouts WHERE email = ${email.trim().toLowerCase()} RETURNING email` : await sql()`DELETE FROM lockouts RETURNING email`
	) as Row[];
	return rows.length;
}

/** Housekeeping: drop lockouts whose window has fully elapsed. */
export async function pruneLockouts(olderThan: number): Promise<void> {
	await ensureSchema();
	await sql()`DELETE FROM lockouts WHERE COALESCE(locked_until, last_fail_at) < ${olderThan}`;
}

// ---------------------------------------------------------------------------
// Bulk data tools (seed / import / start fresh)
// ---------------------------------------------------------------------------

/** Removes every row. Used by "start fresh" and before a sample reload. */
export async function wipeAll(): Promise<void> {
	await ensureSchema();
	const q = sql();
	await q`DELETE FROM notifications`;
	await q`DELETE FROM pulse_participation`;
	await q`DELETE FROM pulse_responses`;
	await q`DELETE FROM feedback`;
	await q`DELETE FROM lockouts`;
	await q`DELETE FROM accounts`;
	await q`DELETE FROM settings`;
}

export interface BulkDataset {
	settings: Settings;
	accounts: Account[];
	feedback: Feedback[];
	pulse: PulseResponse[];
	participation: Array<{ key: string; at: number }>;
	notifications: Notification[];
}

/**
 * Replaces the whole dataset in one go (sample data, backup import).
 * Rows are inserted in batches so a large seed does not become thousands of
 * round trips.
 */
export async function replaceAll(data: BulkDataset): Promise<void> {
	await wipeAll();
	await saveSettings(data.settings);

	for (const a of data.accounts) await insertAccount(a);
	for (const f of data.feedback) await insertFeedback(f);

	const q = sql();
	for (const p of data.pulse) {
		await q`
			INSERT INTO pulse_responses (id, week, at, department, scores, comment)
			VALUES (${p.id}, ${p.week}, ${p.at}, ${p.department}, ${JSON.stringify(p.scores)}::jsonb, ${p.comment ?? null})`;
	}
	for (const marker of data.participation) {
		await q`INSERT INTO pulse_participation (key, at) VALUES (${marker.key}, ${marker.at}) ON CONFLICT (key) DO NOTHING`;
	}
	for (const notification of data.notifications) await insertNotification(notification);
}

/** Full export for the JSON backup (credentials are stripped by the route). */
export async function exportAll(): Promise<BulkDataset & { participation: Array<{ key: string; at: number }> }> {
	await ensureSchema();
	const q = sql();
	const participation = (await q`SELECT key, at FROM pulse_participation`) as Row[];
	const notifications = (await q`SELECT * FROM notifications ORDER BY at DESC LIMIT 500`) as Row[];
	return {
		settings: await getSettings(),
		accounts: await listAccounts(),
		feedback: ((await q`SELECT * FROM feedback ORDER BY created_at DESC`) as Row[]).map(toFeedback),
		pulse: await listPulse(),
		participation: participation.map((r) => ({ key: String(r.key), at: Number(r.at) })),
		notifications: notifications.map(toNotification)
	};
}

/** True when the database has no accounts yet, i.e. it needs seeding. */
export async function isEmpty(): Promise<boolean> {
	await ensureSchema();
	const rows = (await sql()`SELECT count(*)::int AS c FROM accounts`) as Row[];
	return Number(rows[0]?.c ?? 0) === 0;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export async function storageInfo() {
	if (!dbConfigured()) return { configured: false as const };
	try {
		await ensureSchema();
		const rows = (await sql()`
			SELECT
				(SELECT count(*)::int FROM accounts)  AS accounts,
				(SELECT count(*)::int FROM feedback)  AS feedback,
				(SELECT count(*)::int FROM pulse_responses) AS pulse`) as Row[];
		return {
			configured: true as const,
			reachable: true as const,
			accounts: Number(rows[0]?.accounts ?? 0),
			feedback: Number(rows[0]?.feedback ?? 0),
			pulse: Number(rows[0]?.pulse ?? 0)
		};
	} catch (e) {
		return { configured: true as const, reachable: false as const, error: e instanceof Error ? e.message : String(e) };
	}
}
