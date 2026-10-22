// Pure business rules. Every function here is unit tested (tests/unit) and has
// no dependency on the browser, so it also runs inside server routes.
import { CONFIDENTIAL_CATEGORY } from './types.ts';
import type { Account, Feedback, Priority, Role, Session, Settings, Status, Urgency } from './types.ts';
import { DAY_MS, hoursBetween, startOfDay } from './time.ts';

// ---------------------------------------------------------------------------
// Login safety: lockout + session expiry
// ---------------------------------------------------------------------------

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 5 * 60_000; // 5 minutes
export const SESSION_MAX_MS = 8 * 60 * 60_000; // hard expiry after 8 hours
export const IDLE_LIMIT_MS = 15 * 60_000; // auto sign-out after 15 minutes idle
export const IDLE_WARN_MS = 60_000; // warn in the last minute

export interface AttemptRecord {
	fails: number;
	lockedUntil?: number;
	lastFailAt: number;
}

export interface LockState {
	locked: boolean;
	remainingMs: number;
	attemptsLeft: number;
}

export function lockState(rec: AttemptRecord | undefined, at: number): LockState {
	if (!rec) return { locked: false, remainingMs: 0, attemptsLeft: MAX_FAILED_ATTEMPTS };
	if (rec.lockedUntil && rec.lockedUntil > at) {
		return { locked: true, remainingMs: rec.lockedUntil - at, attemptsLeft: 0 };
	}
	// An expired lock resets the counter.
	if (rec.lockedUntil && rec.lockedUntil <= at) return { locked: false, remainingMs: 0, attemptsLeft: MAX_FAILED_ATTEMPTS };
	return { locked: false, remainingMs: 0, attemptsLeft: Math.max(0, MAX_FAILED_ATTEMPTS - rec.fails) };
}

export function registerFailure(rec: AttemptRecord | undefined, at: number): AttemptRecord {
	const base = rec && !(rec.lockedUntil && rec.lockedUntil <= at) ? rec : { fails: 0, lastFailAt: at };
	const fails = base.fails + 1;
	const next: AttemptRecord = { fails, lastFailAt: at };
	if (fails >= MAX_FAILED_ATTEMPTS) next.lockedUntil = at + LOCKOUT_MS;
	return next;
}

export type SessionState = 'active' | 'expired' | 'idle' | 'none';

export function sessionState(session: Session | undefined | null, at: number): SessionState {
	if (!session) return 'none';
	if (at - session.startedAt >= SESSION_MAX_MS) return 'expired';
	if (at - session.lastSeenAt >= IDLE_LIMIT_MS) return 'idle';
	return 'active';
}

/** Milliseconds until the inactivity warning should appear (0 = show it now). */
export function idleWarnIn(session: Session, at: number): number {
	return Math.max(0, session.lastSeenAt + IDLE_LIMIT_MS - IDLE_WARN_MS - at);
}

export const sessionExpiresAt = (session: Session) => session.startedAt + SESSION_MAX_MS;

// ---------------------------------------------------------------------------
// Route guards by role
// ---------------------------------------------------------------------------

export type GuardArea = 'employee' | 'manager' | 'admin' | 'public';

export interface GuardResult {
	allow: boolean;
	redirect?: string;
	message?: string;
}

/** Which area a pathname belongs to. */
export function areaOf(pathname: string): GuardArea {
	if (pathname === '/manager/login') return 'public';
	if (pathname.startsWith('/manager')) return 'manager';
	if (pathname.startsWith('/app')) return 'employee';
	return 'public';
}

/**
 * Route protection. Employees can never open /manager/*; a manager or admin can
 * never use the employee portal while signed in; protected pages redirect to the
 * right login page with a message.
 */
export function guard(pathname: string, role: Role | undefined, adminOnly = false): GuardResult {
	const area = areaOf(pathname);
	if (area === 'public') return { allow: true };

	if (area === 'manager') {
		if (!role) return { allow: false, redirect: '/manager/login', message: 'Sign in to the manager portal to continue.' };
		if (role === 'employee') return { allow: false, redirect: '/app', message: 'That page is part of the manager portal. Your account does not have access.' };
		if (adminOnly && role !== 'admin') return { allow: false, redirect: '/manager', message: 'Only Admin/HR can open that page.' };
		return { allow: true };
	}

	// area === 'employee'
	if (!role) return { allow: false, redirect: '/login', message: 'Sign in to open your feedback portal.' };
	if (role !== 'employee') return { allow: false, redirect: '/manager', message: 'You are signed in to the manager portal. Sign out to use the employee portal.' };
	return { allow: true };
}

export const homeFor = (role: Role | undefined) => (role === 'employee' ? '/app' : role ? '/manager' : '/login');
export const loginFor = (role: Role | undefined) => (role === 'employee' ? '/login' : '/manager/login');

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<Status, Status[]> = {
	New: ['Under review', 'In progress', 'Resolved', 'Declined'],
	'Under review': ['In progress', 'Resolved', 'Declined'],
	'In progress': ['Under review', 'Resolved', 'Declined'],
	Resolved: ['In progress'],
	Declined: ['Under review']
};

export const nextStatuses = (from: Status): Status[] => TRANSITIONS[from] ?? [];

export function canTransition(from: Status, to: Status): boolean {
	return from === to || nextStatuses(from).includes(to);
}

export interface TransitionCheck {
	ok: boolean;
	error?: string;
}

export function checkTransition(from: Status, to: Status, reason?: string): TransitionCheck {
	if (from === to) return { ok: false, error: `The item is already "${from}".` };
	if (!canTransition(from, to)) return { ok: false, error: `Cannot move from "${from}" to "${to}".` };
	if (to === 'Declined' && !reason?.trim()) return { ok: false, error: 'A reason is required to decline feedback.' };
	return { ok: true };
}

export const isOpen = (s: Status) => s !== 'Resolved' && s !== 'Declined';

// ---------------------------------------------------------------------------
// SLA / overdue
// ---------------------------------------------------------------------------

export const DEFAULT_SLA: Record<Priority, { respond: number; resolve: number }> = {
	Critical: { respond: 1, resolve: 3 },
	High: { respond: 2, resolve: 7 },
	Medium: { respond: 3, resolve: 14 },
	Low: { respond: 5, resolve: 30 }
};

/** Due date implied by the SLA when no explicit due date is set. */
export function slaDueDate(item: Pick<Feedback, 'createdAt' | 'priority' | 'dueDate'>, sla = DEFAULT_SLA): number {
	if (item.dueDate) return item.dueDate;
	const days = sla[item.priority]?.resolve ?? DEFAULT_SLA[item.priority].resolve;
	return startOfDay(item.createdAt) + days * DAY_MS + DAY_MS - 1;
}

/** Overdue = still open and past the (explicit or SLA) due date. */
export function isOverdue(item: Pick<Feedback, 'createdAt' | 'priority' | 'dueDate' | 'status'>, at = Date.now(), sla = DEFAULT_SLA): boolean {
	if (!isOpen(item.status)) return false;
	return slaDueDate(item, sla) < at;
}

/** Open items due within `days` (and not already overdue). */
export function isDueSoon(item: Pick<Feedback, 'createdAt' | 'priority' | 'dueDate' | 'status'>, days = 3, at = Date.now(), sla = DEFAULT_SLA): boolean {
	if (!isOpen(item.status)) return false;
	const due = slaDueDate(item, sla);
	return due >= at && due - at <= days * DAY_MS;
}

export function respondDueDate(item: Pick<Feedback, 'createdAt' | 'priority'>, sla = DEFAULT_SLA): number {
	const days = sla[item.priority]?.respond ?? DEFAULT_SLA[item.priority].respond;
	return startOfDay(item.createdAt) + days * DAY_MS + DAY_MS - 1;
}

/** Hours from submission to the first public response, or undefined. */
export const firstResponseHours = (item: Feedback): number | undefined =>
	item.firstResponseAt ? hoursBetween(item.createdAt, item.firstResponseAt) : undefined;

export const resolutionHours = (item: Feedback): number | undefined => (item.resolvedAt ? hoursBetween(item.createdAt, item.resolvedAt) : undefined);

// ---------------------------------------------------------------------------
// Anonymity threshold
// ---------------------------------------------------------------------------

export const DEFAULT_ANONYMITY_THRESHOLD = 5;

/** Results for any group smaller than the threshold must never be shown. */
export function meetsThreshold(responseCount: number, threshold = DEFAULT_ANONYMITY_THRESHOLD): boolean {
	return responseCount >= Math.max(1, threshold);
}

export const THRESHOLD_MESSAGE = 'Not enough responses to protect anonymity';

// ---------------------------------------------------------------------------
// Tracking codes
// ---------------------------------------------------------------------------

/** No 0/O/1/I/L to keep codes easy to read and retype. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 10;

export function generateTrackingCode(random: () => number = Math.random): string {
	let out = '';
	for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
	return out;
}

/** Strips spaces, dashes and case from what the user typed. */
export function normalizeTrackingCode(input: string): string {
	return (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidTrackingCode(input: string): boolean {
	const code = (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
	return code.length === CODE_LENGTH;
}

/** Look up an anonymous item by code, tolerant of case/spacing and look-alike characters. */
export function findByTrackingCode(items: Feedback[], input: string): Feedback | undefined {
	const want = canonicalCode(input);
	if (want.length !== CODE_LENGTH) return undefined;
	return items.find((f) => f.trackingCode && canonicalCode(f.trackingCode) === want);
}

/** Collapses look-alike characters so O/0, I/1/L all compare equal. */
export function canonicalCode(input: string): string {
	return (input || '')
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')
		.replace(/[O0]/g, '0')
		.replace(/[IL1]/g, '1');
}

// ---------------------------------------------------------------------------
// eNPS
// ---------------------------------------------------------------------------

export interface Enps {
	score: number;
	promoters: number;
	passives: number;
	detractors: number;
	responses: number;
}

/** eNPS = %promoters (9-10) - %detractors (0-6), rounded to a whole number. */
export function enps(scores: number[]): Enps {
	const valid = scores.filter((n) => Number.isFinite(n) && n >= 0 && n <= 10);
	const promoters = valid.filter((n) => n >= 9).length;
	const detractors = valid.filter((n) => n <= 6).length;
	const passives = valid.length - promoters - detractors;
	const score = valid.length ? Math.round(((promoters - detractors) / valid.length) * 100) : 0;
	return { score, promoters, passives, detractors, responses: valid.length };
}

// ---------------------------------------------------------------------------
// Sentiment (bundled keyword lexicon; no AI, no API calls)
// ---------------------------------------------------------------------------

export const POSITIVE_WORDS = [
	'thank', 'thanks', 'great', 'good', 'excellent', 'love', 'helpful', 'appreciate', 'appreciated', 'amazing', 'fantastic',
	'supportive', 'kind', 'smooth', 'improved', 'improvement', 'better', 'happy', 'proud', 'clear', 'well', 'win', 'praise',
	'recognition', 'brilliant', 'outstanding', 'fast', 'reliable', 'enjoy', 'enjoyed', 'positive', 'nice', 'respect'
];

export const NEGATIVE_WORDS = [
	'bad', 'worse', 'worst', 'broken', 'slow', 'frustrating', 'frustrated', 'angry', 'unfair', 'ignored', 'rude', 'blocked',
	'blocker', 'delay', 'delayed', 'confusing', 'confused', 'stress', 'stressed', 'stressful', 'burnout', 'overloaded',
	'understaffed', 'noisy', 'dirty', 'uncomfortable', 'disappointed', 'disappointing', 'problem', 'issue', 'fail', 'failing',
	'failed', 'crash', 'crashes', 'lack', 'missing', 'concern', 'concerned', 'difficult', 'impossible', 'wrong', 'never',
	'complaint', 'unacceptable', 'bully', 'bullying', 'harassment', 'discrimination', 'retaliation', 'exhausted', 'toxic'
];

const NEGATORS = ['not', 'no', "isn't", "wasn't", "don't", "doesn't", 'never', 'cannot', "can't", 'without'];

export function tokenize(text: string): string[] {
	return (text || '')
		.toLowerCase()
		.replace(/[^a-z0-9'\s-]/g, ' ')
		.split(/[\s-]+/)
		.filter(Boolean);
}

/**
 * Keyword sentiment with simple negation handling ("not helpful" counts negative).
 * Labelled "auto-estimated" everywhere in the UI; managers can override it.
 */
export function estimateSentiment(
	text: string,
	positive: string[] = POSITIVE_WORDS,
	negative: string[] = NEGATIVE_WORDS
): 'Positive' | 'Neutral' | 'Negative' {
	const pos = new Set(positive.map((w) => w.toLowerCase()));
	const neg = new Set(negative.map((w) => w.toLowerCase()));
	const words = tokenize(text);
	let score = 0;
	words.forEach((w, i) => {
		const prev = i > 0 ? words[i - 1] : '';
		const flip = NEGATORS.includes(prev) ? -1 : 1;
		if (pos.has(w)) score += flip;
		else if (neg.has(w)) score -= flip;
	});
	if (score >= 1) return 'Positive';
	if (score <= -1) return 'Negative';
	return 'Neutral';
}

// ---------------------------------------------------------------------------
// Duplicate detection (title token similarity)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
	'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'be', 'we', 'our', 'it', 'this', 'that',
	'with', 'at', 'by', 'from', 'as', 'has', 'have', 'please', 'can', 'could', 'would', 'should', 'more', 'need', 'needs'
]);

export function titleTokens(title: string): string[] {
	return [...new Set(tokenize(title).filter((w) => w.length > 2 && !STOP_WORDS.has(w)))];
}

/** Jaccard similarity of significant title tokens, 0..1. */
export function titleSimilarity(a: string, b: string): number {
	const ta = new Set(titleTokens(a));
	const tb = new Set(titleTokens(b));
	if (!ta.size || !tb.size) return 0;
	let shared = 0;
	for (const t of ta) if (tb.has(t)) shared++;
	const union = ta.size + tb.size - shared;
	return union ? shared / union : 0;
}

export const DUPLICATE_THRESHOLD = 0.4;

/** Public, non-confidential items similar enough to suggest upvoting instead. */
export function findSimilar(items: Feedback[], title: string, limit = 3, threshold = DUPLICATE_THRESHOLD): Feedback[] {
	if (titleTokens(title).length === 0) return [];
	return items
		.filter((f) => f.isPublic && f.category !== CONFIDENTIAL_CATEGORY)
		.map((f) => ({ f, score: titleSimilarity(title, f.title) }))
		.filter((x) => x.score >= threshold)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((x) => x.f);
}

// ---------------------------------------------------------------------------
// Department scoping + confidential visibility
// ---------------------------------------------------------------------------

export const isConfidential = (item: Pick<Feedback, 'category'>) => item.category === CONFIDENTIAL_CATEGORY;

/**
 * What a signed-in staff member may see in the manager portal:
 * - Admin/HR: every department, including confidential reports.
 * - Manager: their own department only, never confidential reports.
 */
export function visibleToStaff(item: Feedback, viewer: Pick<Account, 'role' | 'department'>): boolean {
	if (viewer.role === 'admin') return true;
	if (viewer.role !== 'manager') return false;
	if (isConfidential(item)) return false;
	return item.department === viewer.department;
}

export function scopeForStaff(items: Feedback[], viewer: Pick<Account, 'role' | 'department'>): Feedback[] {
	return items.filter((item) => visibleToStaff(item, viewer));
}

/** Concerns about individuals and confidential reports are never public. */
export function canBePublic(item: Pick<Feedback, 'category' | 'type'>): boolean {
	return !isConfidential(item) && item.type !== 'Concern';
}

/** Ideas board content: public, non-confidential, not a concern. */
export function publicIdeas(items: Feedback[]): Feedback[] {
	return items.filter((f) => f.isPublic && canBePublic(f));
}

/** Strips every author-identifying field from an anonymous item before display/export. */
export function publicView<T extends Feedback>(item: T): T {
	if (!item.anonymous) return item;
	const copy = { ...item } as T;
	delete (copy as Partial<Feedback>).authorId;
	delete (copy as Partial<Feedback>).authorName;
	return copy;
}

export const submitterLabel = (item: Pick<Feedback, 'anonymous' | 'authorName'>) => (item.anonymous ? 'Anonymous' : item.authorName || 'Unknown');

// ---------------------------------------------------------------------------
// Misc validation
// ---------------------------------------------------------------------------

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const COMMENT_MAX = 400;

export interface FeedbackDraft {
	title: string;
	description: string;
	category: string;
	department?: string;
	urgency: Urgency;
	confidentialAck?: boolean;
}

export function validateDraft(d: FeedbackDraft): { ok: boolean; errors: Record<string, string> } {
	const errors: Record<string, string> = {};
	const title = d.title.trim();
	const description = d.description.trim();
	if (title.length < 5) errors.title = 'Give the feedback a short title (at least 5 characters).';
	else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;
	if (description.length < 20) errors.description = 'Please describe it in at least 20 characters so it can be acted on.';
	else if (description.length > DESCRIPTION_MAX) errors.description = `Keep the description under ${DESCRIPTION_MAX} characters.`;
	if (!d.category) errors.category = 'Choose a category.';
	if (d.category === CONFIDENTIAL_CATEGORY && !d.confidentialAck) errors.confidentialAck = 'Please confirm you have read the notice above.';
	return { ok: Object.keys(errors).length === 0, errors };
}

export const emailLooksValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());

/** Settings that the rules modules depend on, with safe fallbacks. */
export function effectiveSla(settings: Pick<Settings, 'sla'> | undefined): Record<Priority, { respond: number; resolve: number }> {
	const sla = settings?.sla;
	if (!sla) return DEFAULT_SLA;
	const out = { ...DEFAULT_SLA };
	for (const p of Object.keys(DEFAULT_SLA) as Priority[]) {
		const row = sla[p];
		if (row && Number.isFinite(row.respond) && Number.isFinite(row.resolve)) out[p] = { respond: row.respond, resolve: row.resolve };
	}
	return out;
}
