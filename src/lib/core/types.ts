// Domain model for VoiceBox. Everything here is serialisable JSON so the whole
// database is one localStorage document (demo mode) and can be exported as a
// JSON backup. No secrets other than PBKDF2 hashes are ever stored.

export type Role = 'employee' | 'manager' | 'admin';

export type FeedbackType = 'Praise' | 'Concern' | 'Suggestion';

export type Status = 'New' | 'Under review' | 'In progress' | 'Resolved' | 'Declined';

export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';

export type Urgency = 'Low' | 'Medium' | 'High';

export type Sentiment = 'Positive' | 'Neutral' | 'Negative';

/** Category id strings are free-form (Admin can edit the list in Settings). */
export const CONFIDENTIAL_CATEGORY = 'Confidential report';

export interface Account {
	id: string;
	name: string;
	email: string;
	role: Role;
	department: string;
	title?: string;
	active: boolean;
	createdAt: number;
	/** PBKDF2-SHA256 credential; never a plain password. */
	cred: Credential;
	/** Set when an admin resets the password; shown as a hint to the user. */
	mustChangePassword?: boolean;
}

export interface Credential {
	alg: 'PBKDF2-SHA256';
	iterations: number;
	/** base64 */
	salt: string;
	/** base64 */
	hash: string;
}

export interface StatusEvent {
	at: number;
	/** Role of the actor; anonymous-safe (never an employee name for submitters). */
	actorRole: Role | 'system' | 'submitter';
	actorName: string;
	from?: Status;
	to?: Status;
	note: string;
}

export interface PublicResponse {
	id: string;
	at: number;
	authorRole: Role;
	authorName: string;
	text: string;
}

export interface InternalNote {
	id: string;
	at: number;
	authorId: string;
	authorName: string;
	text: string;
}

export interface Comment {
	id: string;
	at: number;
	/** Empty string for anonymous-submitted threads is not allowed: comments require sign-in. */
	authorId: string;
	authorName: string;
	text: string;
}

export interface Feedback {
	id: string;
	title: string;
	description: string;
	type: FeedbackType;
	category: string;
	department: string;
	urgency: Urgency;
	anonymous: boolean;
	/** Always undefined when anonymous. */
	authorId?: string;
	authorName?: string;
	/** Only present for anonymous items; the submitter keeps the code. */
	trackingCode?: string;
	createdAt: number;
	updatedAt: number;
	status: Status;
	priority: Priority;
	sentiment: Sentiment;
	/** True when a manager overrode the auto-estimated sentiment. */
	sentimentOverridden?: boolean;
	ownerId?: string;
	ownerName?: string;
	dueDate?: number;
	tags: string[];
	/** Visible on the public ideas board. */
	isPublic: boolean;
	upvotes: string[];
	comments: Comment[];
	responses: PublicResponse[];
	notes: InternalNote[];
	history: StatusEvent[];
	readBy: string[];
	firstResponseAt?: number;
	resolvedAt?: number;
	declineReason?: string;
}

export interface PulseQuestion {
	id: string;
	text: string;
	kind: 'scale5' | 'nps' | 'comment';
}

export interface PulseResponse {
	id: string;
	/** ISO week key, e.g. "2026-W41". */
	week: string;
	at: number;
	department: string;
	/** questionId -> numeric answer. */
	scores: Record<string, number>;
	comment?: string;
}

/** Stored separately from the answers so an answer can never be linked to a person. */
export interface PulseParticipation {
	/** `${accountId}:${week}` */
	key: string;
	at: number;
}

export interface Notification {
	id: string;
	accountId: string;
	at: number;
	kind: 'status' | 'response' | 'assigned' | 'overdue' | 'pulse';
	text: string;
	href: string;
	read: boolean;
}

export interface SlaDays {
	respond: number;
	resolve: number;
}

export interface Settings {
	companyName: string;
	departments: string[];
	categories: string[];
	sla: Record<Priority, SlaDays>;
	anonymityThreshold: number;
	pulseQuestions: PulseQuestion[];
	sentimentPositive: string[];
	sentimentNegative: string[];
	theme: 'light' | 'dark';
}

export interface Session {
	accountId: string;
	role: Role;
	startedAt: number;
	lastSeenAt: number;
}

export interface LockoutState {
	/** email (lowercased) -> attempt record */
	[email: string]: { fails: number; lockedUntil?: number; lastFailAt: number };
}

export interface Database {
	version: number;
	settings: Settings;
	accounts: Account[];
	feedback: Feedback[];
	pulse: PulseResponse[];
	participation: PulseParticipation[];
	notifications: Notification[];
	lockouts: LockoutState;
	seeded: boolean;
}

export const STATUSES: Status[] = ['New', 'Under review', 'In progress', 'Resolved', 'Declined'];
export const PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Critical'];
export const TYPES: FeedbackType[] = ['Praise', 'Concern', 'Suggestion'];
export const URGENCIES: Urgency[] = ['Low', 'Medium', 'High'];
export const SENTIMENTS: Sentiment[] = ['Positive', 'Neutral', 'Negative'];
