// FeedbackStore: the single data-access seam for the whole app.
//
// HISTORY / WHY THIS CHANGED
// The first version had one implementation backed by localStorage. That made
// the data per-browser: a ticket raised on a phone was invisible to a manager
// on a laptop, because the two devices had entirely separate datasets. A
// feedback system has to be shared, so the live implementation is now
// `ApiFeedbackStore` (src/lib/api.ts), which talks to the SvelteKit server
// routes backed by Vercel Blob.
//
// This module keeps the shared types and the `migrate()` normaliser used by
// both the server (reading the blob) and backup import.
import type { Database, Feedback, Notification, PulseResponse, Settings } from './types.ts';

export interface StoreStatus {
	/** False when the shared store is unreachable or not configured. */
	available: boolean;
	message?: string;
}

/**
 * Fills in anything a newer version added, so an old backup still loads, and
 * normalises every record defensively. Used on the server when reading the
 * shared blob and when importing a backup.
 */
export function migrate(db: Partial<Database>, empty: Database): Database {
	const settings: Settings = { ...empty.settings, ...(db.settings ?? {}) };
	settings.sla = { ...empty.settings.sla, ...(db.settings?.sla ?? {}) };
	if (!Array.isArray(settings.pulseQuestions) || settings.pulseQuestions.length === 0) settings.pulseQuestions = empty.settings.pulseQuestions;
	if (!Array.isArray(settings.departments) || !settings.departments.length) settings.departments = empty.settings.departments;
	if (!Array.isArray(settings.categories) || !settings.categories.length) settings.categories = empty.settings.categories;
	return {
		version: empty.version,
		settings,
		accounts: Array.isArray(db.accounts) ? db.accounts : [],
		feedback: Array.isArray(db.feedback) ? db.feedback.map(normalizeFeedback) : [],
		pulse: Array.isArray(db.pulse) ? (db.pulse as PulseResponse[]) : [],
		participation: Array.isArray(db.participation) ? db.participation : [],
		notifications: Array.isArray(db.notifications) ? (db.notifications as Notification[]) : [],
		lockouts: db.lockouts && typeof db.lockouts === 'object' ? db.lockouts : {},
		seeded: Boolean(db.seeded)
	};
}

export function normalizeFeedback(f: Feedback): Feedback {
	// Explicit fallbacks, not a spread of defaults: a key present with the value
	// `undefined` (common in hand-edited or older backups) would overwrite a
	// default and crash every `.length` / `.map` in the UI.
	const list = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
	const item: Feedback = {
		...f,
		tags: list(f.tags),
		upvotes: list(f.upvotes),
		comments: list(f.comments),
		responses: list(f.responses),
		notes: list(f.notes),
		history: list(f.history),
		readBy: list(f.readBy)
	};
	// Anonymity is enforced on read as well: a tampered backup can never
	// reintroduce author data for an anonymous item.
	if (item.anonymous) {
		delete item.authorId;
		delete item.authorName;
	}
	return item;
}
