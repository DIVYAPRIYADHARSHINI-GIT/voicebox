// FeedbackStore: the single data-access seam for the whole app.
//
// There is exactly one implementation today (LocalFeedbackStore, backed by
// localStorage) so VoiceBox runs on Vercel Hobby with no database and no keys.
// A hosted database could later implement the same interface without touching
// any page code. No database is implemented now, on purpose.
import type { Database, Feedback, Notification, PulseResponse, Session, Settings } from './types.ts';

export interface StoreStatus {
	/** False when localStorage is unavailable (private mode, blocked, full). */
	available: boolean;
	message?: string;
}

export interface FeedbackStore {
	readonly kind: 'local';
	status(): StoreStatus;
	/** Full database document (always returns a usable value, even on failure). */
	read(): Database;
	write(db: Database): StoreStatus;
	update(fn: (db: Database) => void): StoreStatus;
	session(): Session | null;
	setSession(s: Session | null): void;
	clearAll(): void;
}

const DB_KEY = 'voicebox.db.v1';
const SESSION_KEY = 'voicebox.session.v1';

function safeLocalStorage(): Storage | null {
	try {
		const ls = globalThis.localStorage;
		if (!ls) return null;
		const probe = '__vb_probe__';
		ls.setItem(probe, '1');
		ls.removeItem(probe);
		return ls;
	} catch {
		return null;
	}
}

export class LocalFeedbackStore implements FeedbackStore {
	readonly kind = 'local' as const;
	private ls: Storage | null;
	private lastError?: string;
	/** In-memory fallback so the app still works (for this tab) without storage. */
	private memory: Database | null = null;
	private memorySession: Session | null = null;

	constructor(private makeEmpty: () => Database) {
		this.ls = safeLocalStorage();
		if (!this.ls) this.lastError = 'This browser blocked local storage, so changes will be lost when you close the tab.';
	}

	status(): StoreStatus {
		return { available: Boolean(this.ls) && !this.lastError, message: this.lastError };
	}

	read(): Database {
		if (!this.ls) return (this.memory ??= this.makeEmpty());
		try {
			const raw = this.ls.getItem(DB_KEY);
			if (!raw) return this.makeEmpty();
			const parsed = JSON.parse(raw) as Database;
			return migrate(parsed, this.makeEmpty());
		} catch (e) {
			this.lastError = 'Saved data could not be read, so VoiceBox started from a fresh copy.';
			console.warn('VoiceBox: could not read saved data', e);
			return this.makeEmpty();
		}
	}

	write(db: Database): StoreStatus {
		if (!this.ls) {
			this.memory = db;
			return this.status();
		}
		try {
			this.ls.setItem(DB_KEY, JSON.stringify(db));
			this.lastError = undefined;
		} catch (e) {
			const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
			this.lastError = quota
				? 'Browser storage is full. Export a JSON backup and use "Start fresh" to free space.'
				: 'Changes could not be saved to this browser.';
			console.warn('VoiceBox: could not save data', e);
		}
		return this.status();
	}

	update(fn: (db: Database) => void): StoreStatus {
		const db = this.read();
		fn(db);
		return this.write(db);
	}

	session(): Session | null {
		if (!this.ls) return this.memorySession;
		try {
			const raw = this.ls.getItem(SESSION_KEY);
			return raw ? (JSON.parse(raw) as Session) : null;
		} catch {
			return null;
		}
	}

	setSession(s: Session | null): void {
		this.memorySession = s;
		if (!this.ls) return;
		try {
			if (s) this.ls.setItem(SESSION_KEY, JSON.stringify(s));
			else this.ls.removeItem(SESSION_KEY);
		} catch (e) {
			console.warn('VoiceBox: could not save the session', e);
		}
	}

	clearAll(): void {
		this.memory = null;
		this.memorySession = null;
		if (!this.ls) return;
		try {
			this.ls.removeItem(DB_KEY);
			this.ls.removeItem(SESSION_KEY);
		} catch (e) {
			console.warn('VoiceBox: could not clear saved data', e);
		}
	}
}

/** Fills in anything a newer version added, so an old backup still loads. */
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

function normalizeFeedback(f: Feedback): Feedback {
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
