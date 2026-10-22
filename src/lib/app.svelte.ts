// Central app state (Svelte 5 runes) on top of the FeedbackStore.
//
// Design notes:
// - One `$state` database object; every mutation goes through `commit()` which
//   persists via the store. No reactive loops: effects never write state that
//   they also read as a dependency.
// - Session/lockout/role rules live in core/rules.ts and are only applied here.
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { LocalFeedbackStore, type FeedbackStore, type StoreStatus } from './core/store.ts';
import { emptyDatabase } from './core/defaults.ts';
import { buildSampleDatabase, id } from './core/seed.ts';
import { hashPassword, verifyPassword } from './core/password.ts';
import {
	CONFIDENTIAL_CATEGORY,
	type Account,
	type Comment,
	type Database,
	type Feedback,
	type FeedbackType,
	type Notification,
	type Priority,
	type PulseResponse,
	type Role,
	type Sentiment,
	type Session,
	type Settings,
	type Status,
	type Urgency
} from './core/types.ts';
import {
	canBePublic,
	checkTransition,
	effectiveSla,
	estimateSentiment,
	generateTrackingCode,
	findByTrackingCode,
	isOverdue,
	lockState,
	registerFailure,
	scopeForStaff,
	sessionState,
	slaDueDate
} from './core/rules.ts';
import { weekKey } from './core/time.ts';

export interface Toast {
	id: string;
	text: string;
	tone: 'info' | 'success' | 'warn' | 'error';
}

class AppState {
	store: FeedbackStore = new LocalFeedbackStore(emptyDatabase);
	db = $state<Database>(emptyDatabase());
	session = $state<Session | null>(null);
	ready = $state(false);
	storeStatus = $state<StoreStatus>({ available: true });
	toasts = $state<Toast[]>([]);
	/** Set when the inactivity warning should be visible. */
	idleWarning = $state(false);
	/** Message shown on a login page after a redirect from a protected route. */
	redirectMessage = $state('');

	// ----- lifecycle --------------------------------------------------------

	/** Loads data from storage; seeds sample data on first launch. */
	async init(): Promise<void> {
		if (!browser || this.ready) return;
		this.db = this.store.read();
		this.storeStatus = this.store.status();
		if (!this.db.seeded || this.db.accounts.length === 0) {
			this.db = await buildSampleDatabase();
			this.commit();
		}
		const s = this.store.session();
		if (s) {
			const state = sessionState(s, Date.now());
			if (state === 'active') {
				this.session = s;
				this.touch();
			} else {
				this.store.setSession(null);
				this.session = null;
				if (state === 'expired') this.redirectMessage = 'Your session expired after 8 hours. Please sign in again.';
				if (state === 'idle') this.redirectMessage = 'You were signed out after 15 minutes of inactivity.';
			}
		}
		this.applyTheme();
		this.ready = true;
	}

	commit(): void {
		this.storeStatus = this.store.write($state.snapshot(this.db) as Database);
		if (!this.storeStatus.available && this.storeStatus.message) {
			// Surface storage problems once, not on every keystroke.
			if (!this.toasts.some((t) => t.text === this.storeStatus.message)) this.toast(this.storeStatus.message, 'error');
		}
	}

	toast(text: string, tone: Toast['tone'] = 'info'): void {
		const t: Toast = { id: id('toast'), text, tone };
		this.toasts = [...this.toasts, t];
		setTimeout(() => this.dismiss(t.id), 4200);
	}

	dismiss(toastId: string): void {
		this.toasts = this.toasts.filter((t) => t.id !== toastId);
	}

	// ----- accounts / auth --------------------------------------------------

	get account(): Account | undefined {
		return this.session ? this.db.accounts.find((a) => a.id === this.session!.accountId) : undefined;
	}

	get role(): Role | undefined {
		return this.account?.role;
	}

	get isAdmin(): boolean {
		return this.role === 'admin';
	}

	get isStaff(): boolean {
		return this.role === 'manager' || this.role === 'admin';
	}

	accountById(accountId: string | undefined): Account | undefined {
		return accountId ? this.db.accounts.find((a) => a.id === accountId) : undefined;
	}

	lockInfo(email: string) {
		return lockState(this.db.lockouts[email.trim().toLowerCase()], Date.now());
	}

	/**
	 * Simulated browser-side sign-in. Returns a generic error on purpose, so the
	 * form never reveals whether an email exists.
	 */
	async signIn(email: string, password: string, portal: 'employee' | 'manager'): Promise<{ ok: boolean; error?: string }> {
		const key = email.trim().toLowerCase();
		const lock = lockState(this.db.lockouts[key], Date.now());
		if (lock.locked) {
			return { ok: false, error: `Too many failed attempts. Try again in ${Math.ceil(lock.remainingMs / 60_000)} minute(s).` };
		}
		const account = this.db.accounts.find((a) => a.email.toLowerCase() === key);
		const ok = account?.active ? await verifyPassword(password, account.cred) : false;
		if (!ok || !account) {
			this.db.lockouts[key] = registerFailure(this.db.lockouts[key], Date.now());
			this.commit();
			const after = lockState(this.db.lockouts[key], Date.now());
			const suffix = after.locked
				? ' The form is locked for 5 minutes.'
				: after.attemptsLeft <= 2
					? ` ${after.attemptsLeft} attempt(s) left before the form locks for 5 minutes.`
					: '';
			return { ok: false, error: `Email or password is incorrect.${suffix}` };
		}
		// Portal check: the manager portal is for Manager and Admin/HR only.
		if (portal === 'manager' && account.role === 'employee') {
			return { ok: false, error: 'This account does not have manager portal access. Use the employee sign-in.' };
		}
		if (portal === 'employee' && account.role !== 'employee') {
			return { ok: false, error: 'This is a manager account. Please use the manager portal sign-in.' };
		}
		delete this.db.lockouts[key];
		const now = Date.now();
		this.session = { accountId: account.id, role: account.role, startedAt: now, lastSeenAt: now };
		this.store.setSession(this.session);
		this.redirectMessage = '';
		this.idleWarning = false;
		this.commit();
		return { ok: true };
	}

	signOut(message = ''): void {
		this.session = null;
		this.store.setSession(null);
		this.idleWarning = false;
		this.redirectMessage = message;
	}

	/** Refreshes the inactivity clock. Called from user interaction handlers. */
	touch(): void {
		if (!this.session) return;
		this.session = { ...this.session, lastSeenAt: Date.now() };
		this.store.setSession(this.session);
		this.idleWarning = false;
	}

	/** Called by the layout heartbeat; returns true when the session was ended. */
	checkSession(): boolean {
		if (!this.session) return false;
		const state = sessionState(this.session, Date.now());
		if (state === 'expired') {
			const to = this.session.role === 'employee' ? '/login' : '/manager/login';
			this.signOut('Your session expired after 8 hours. Please sign in again.');
			void goto(to);
			return true;
		}
		if (state === 'idle') {
			const to = this.session.role === 'employee' ? '/login' : '/manager/login';
			this.signOut('You were signed out after 15 minutes of inactivity.');
			void goto(to);
			return true;
		}
		this.idleWarning = Date.now() - this.session.lastSeenAt >= 14 * 60_000;
		return false;
	}

	async changePassword(accountId: string, current: string, next: string): Promise<{ ok: boolean; error?: string }> {
		const account = this.db.accounts.find((a) => a.id === accountId);
		if (!account) return { ok: false, error: 'Account not found.' };
		if (!(await verifyPassword(current, account.cred))) return { ok: false, error: 'Your current password is incorrect.' };
		account.cred = await hashPassword(next);
		account.mustChangePassword = false;
		this.commit();
		return { ok: true };
	}

	async createAccount(input: { name: string; email: string; password: string; role: Role; department: string; title?: string }): Promise<{ ok: boolean; error?: string }> {
		const email = input.email.trim().toLowerCase();
		if (this.db.accounts.some((a) => a.email.toLowerCase() === email)) return { ok: false, error: 'An account with that email already exists.' };
		this.db.accounts.push({
			id: id('acct'),
			name: input.name.trim(),
			email,
			role: input.role,
			department: input.department,
			title: input.title?.trim(),
			active: true,
			createdAt: Date.now(),
			cred: await hashPassword(input.password)
		});
		this.commit();
		return { ok: true };
	}

	setAccountActive(accountId: string, active: boolean): void {
		const a = this.db.accounts.find((x) => x.id === accountId);
		if (!a) return;
		a.active = active;
		this.commit();
	}

	async resetPassword(accountId: string, password: string): Promise<void> {
		const a = this.db.accounts.find((x) => x.id === accountId);
		if (!a) return;
		a.cred = await hashPassword(password);
		a.mustChangePassword = true;
		this.commit();
	}

	// ----- settings / theme -------------------------------------------------

	get settings(): Settings {
		return this.db.settings;
	}

	get sla() {
		return effectiveSla(this.db.settings);
	}

	saveSettings(patch: Partial<Settings>): void {
		this.db.settings = { ...this.db.settings, ...patch };
		this.commit();
		this.applyTheme();
	}

	applyTheme(): void {
		if (!browser) return;
		document.documentElement.dataset.theme = this.db.settings.theme;
	}

	toggleTheme(): void {
		this.saveSettings({ theme: this.db.settings.theme === 'dark' ? 'light' : 'dark' });
	}

	// ----- feedback ---------------------------------------------------------

	get feedback(): Feedback[] {
		return this.db.feedback;
	}

	/** Items the signed-in staff member may see (department scoping + confidential). */
	get scopedFeedback(): Feedback[] {
		const a = this.account;
		if (!a || a.role === 'employee') return [];
		return scopeForStaff(this.db.feedback, a);
	}

	byId(itemId: string): Feedback | undefined {
		return this.db.feedback.find((f) => f.id === itemId);
	}

	myFeedback(): Feedback[] {
		const a = this.account;
		if (!a) return [];
		// Anonymous items never appear here, even when submitted while signed in.
		return this.db.feedback.filter((f) => !f.anonymous && f.authorId === a.id).sort((x, y) => y.createdAt - x.createdAt);
	}

	findByCode(code: string): Feedback | undefined {
		return findByTrackingCode(this.db.feedback, code);
	}

	submitFeedback(input: {
		title: string;
		description: string;
		type: FeedbackType;
		category: string;
		department: string;
		urgency: Urgency;
		anonymous: boolean;
		makePublic: boolean;
	}): Feedback {
		const author = input.anonymous ? undefined : this.account;
		const at = Date.now();
		const sentiment = estimateSentiment(`${input.title} ${input.description}`, this.settings.sentimentPositive, this.settings.sentimentNegative);
		const item: Feedback = {
			id: id('fb'),
			title: input.title.trim(),
			description: input.description.trim(),
			type: input.type,
			category: input.category,
			department: input.department || author?.department || 'Unspecified',
			urgency: input.urgency,
			anonymous: input.anonymous,
			authorId: author?.id,
			authorName: author?.name,
			trackingCode: input.anonymous ? generateTrackingCode() : undefined,
			createdAt: at,
			updatedAt: at,
			status: 'New',
			priority: input.urgency === 'High' ? 'High' : input.urgency === 'Medium' ? 'Medium' : 'Low',
			sentiment,
			tags: [],
			isPublic: input.makePublic && canBePublic(input),
			upvotes: [],
			comments: [],
			responses: [],
			notes: [],
			history: [{ at, actorRole: 'submitter', actorName: input.anonymous ? 'Anonymous' : (author?.name ?? 'Employee'), to: 'New', note: 'Feedback submitted' }],
			readBy: []
		};
		this.db.feedback = [item, ...this.db.feedback];
		// Notify the managers who can see it (department managers, or Admin for confidential).
		const recipients = this.db.accounts.filter((a) =>
			a.active && (a.role === 'admin' || (a.role === 'manager' && a.department === item.department && item.category !== CONFIDENTIAL_CATEGORY))
		);
		for (const r of recipients) this.notify(r.id, 'status', `New ${item.type.toLowerCase()} in ${item.department}: ${item.title}`, `/manager/inbox?item=${item.id}`);
		this.commit();
		return item;
	}

	// ----- triage -----------------------------------------------------------

	private logHistory(item: Feedback, note: string, from?: Status, to?: Status): void {
		const actor = this.account;
		item.history = [...item.history, { at: Date.now(), actorRole: actor?.role ?? 'system', actorName: actor?.name ?? 'System', from, to, note }];
		item.updatedAt = Date.now();
	}

	setStatus(itemId: string, to: Status, reason = ''): { ok: boolean; error?: string } {
		const item = this.byId(itemId);
		if (!item) return { ok: false, error: 'Item not found.' };
		const check = checkTransition(item.status, to, reason);
		if (!check.ok) return check;
		const from = item.status;
		item.status = to;
		if (to === 'Resolved') item.resolvedAt = Date.now();
		if (to === 'Declined') item.declineReason = reason.trim();
		if (from === 'Resolved' && to !== 'Resolved') item.resolvedAt = undefined;
		this.logHistory(item, to === 'Declined' ? `Declined: ${reason.trim()}` : `Status changed to ${to}`, from, to);
		if (item.authorId) this.notify(item.authorId, 'status', `Your feedback "${item.title}" is now ${to}`, `/app/my-feedback?item=${item.id}`);
		this.commit();
		return { ok: true };
	}

	setPriority(itemId: string, priority: Priority): void {
		const item = this.byId(itemId);
		if (!item || item.priority === priority) return;
		const was = item.priority;
		item.priority = priority;
		this.logHistory(item, `Priority changed from ${was} to ${priority}`);
		this.commit();
	}

	setSentiment(itemId: string, sentiment: Sentiment): void {
		const item = this.byId(itemId);
		if (!item || item.sentiment === sentiment) return;
		const was = item.sentiment;
		item.sentiment = sentiment;
		item.sentimentOverridden = true;
		this.logHistory(item, `Sentiment overridden from ${was} to ${sentiment}`);
		this.commit();
	}

	setOwner(itemId: string, ownerId: string): void {
		const item = this.byId(itemId);
		if (!item) return;
		const owner = this.accountById(ownerId);
		item.ownerId = owner?.id;
		item.ownerName = owner?.name;
		this.logHistory(item, owner ? `Owner set to ${owner.name}` : 'Owner cleared');
		if (owner && owner.id !== this.account?.id) this.notify(owner.id, 'assigned', `You were assigned: ${item.title}`, `/manager/inbox?item=${item.id}`);
		this.commit();
	}

	setDueDate(itemId: string, due: number | undefined): void {
		const item = this.byId(itemId);
		if (!item) return;
		item.dueDate = due;
		this.logHistory(item, due ? `Due date set to ${new Date(due).toLocaleDateString()}` : 'Due date cleared');
		this.commit();
	}

	addTag(itemId: string, tag: string): void {
		const item = this.byId(itemId);
		const clean = tag.trim().toLowerCase().replace(/\s+/g, '-');
		if (!item || !clean || item.tags.includes(clean)) return;
		item.tags = [...item.tags, clean];
		this.logHistory(item, `Tag added: ${clean}`);
		this.commit();
	}

	removeTag(itemId: string, tag: string): void {
		const item = this.byId(itemId);
		if (!item) return;
		item.tags = item.tags.filter((t) => t !== tag);
		this.logHistory(item, `Tag removed: ${tag}`);
		this.commit();
	}

	addNote(itemId: string, text: string): void {
		const item = this.byId(itemId);
		const actor = this.account;
		if (!item || !actor || !text.trim()) return;
		item.notes = [...item.notes, { id: id('note'), at: Date.now(), authorId: actor.id, authorName: actor.name, text: text.trim() }];
		item.updatedAt = Date.now();
		this.commit();
	}

	addResponse(itemId: string, text: string): void {
		const item = this.byId(itemId);
		const actor = this.account;
		if (!item || !actor || !text.trim()) return;
		const at = Date.now();
		item.responses = [...item.responses, { id: id('resp'), at, authorRole: actor.role, authorName: actor.name, text: text.trim() }];
		if (!item.firstResponseAt) item.firstResponseAt = at;
		this.logHistory(item, 'Public response added');
		if (item.authorId) this.notify(item.authorId, 'response', `A response was added to "${item.title}"`, `/app/my-feedback?item=${item.id}`);
		this.commit();
	}

	markRead(itemId: string, read = true): void {
		const item = this.byId(itemId);
		const actor = this.account;
		if (!item || !actor) return;
		const has = item.readBy.includes(actor.id);
		if (read && !has) item.readBy = [...item.readBy, actor.id];
		if (!read && has) item.readBy = item.readBy.filter((x) => x !== actor.id);
		this.commit();
	}

	isUnread(item: Feedback): boolean {
		const a = this.account;
		return a ? !item.readBy.includes(a.id) : false;
	}

	/** Bulk actions from the inbox/board selection. */
	bulk(itemIds: string[], action: { kind: 'status'; value: Status; reason?: string } | { kind: 'owner'; value: string } | { kind: 'tag'; value: string }): number {
		let changed = 0;
		for (const itemId of itemIds) {
			if (action.kind === 'status') {
				if (this.setStatus(itemId, action.value, action.reason ?? 'Bulk update').ok) changed++;
			} else if (action.kind === 'owner') {
				this.setOwner(itemId, action.value);
				changed++;
			} else {
				this.addTag(itemId, action.value);
				changed++;
			}
		}
		return changed;
	}

	// ----- ideas board ------------------------------------------------------

	toggleUpvote(itemId: string): void {
		const item = this.byId(itemId);
		const actor = this.account;
		if (!item || !actor || actor.role !== 'employee') return;
		item.upvotes = item.upvotes.includes(actor.id) ? item.upvotes.filter((x) => x !== actor.id) : [...item.upvotes, actor.id];
		this.commit();
	}

	hasUpvoted(item: Feedback): boolean {
		const a = this.account;
		return a ? item.upvotes.includes(a.id) : false;
	}

	addComment(itemId: string, text: string): void {
		const item = this.byId(itemId);
		const actor = this.account;
		if (!item || !actor || !text.trim()) return;
		const comment: Comment = { id: id('cmt'), at: Date.now(), authorId: actor.id, authorName: actor.name, text: text.trim() };
		item.comments = [...item.comments, comment];
		this.commit();
	}

	// ----- pulse ------------------------------------------------------------

	currentWeek(): string {
		return weekKey(Date.now());
	}

	hasAnsweredPulse(week = this.currentWeek()): boolean {
		const a = this.account;
		if (!a) return false;
		return this.db.participation.some((p) => p.key === `${a.id}:${week}`);
	}

	submitPulse(scores: Record<string, number>, comment: string): void {
		const a = this.account;
		if (!a) return;
		const week = this.currentWeek();
		if (this.hasAnsweredPulse(week)) return;
		const response: PulseResponse = {
			id: id('pulse'),
			week,
			at: Date.now(),
			department: a.department,
			scores,
			comment: comment.trim() || undefined
		};
		// The answer carries only the department; the "already responded" marker
		// is stored separately so answers cannot be linked back to a person.
		this.db.pulse = [...this.db.pulse, response];
		this.db.participation = [...this.db.participation, { key: `${a.id}:${week}`, at: Date.now() }];
		this.commit();
	}

	// ----- notifications ----------------------------------------------------

	notify(accountId: string, kind: Notification['kind'], text: string, href: string): void {
		this.db.notifications = [
			{ id: id('ntf'), accountId, at: Date.now(), kind, text, href, read: false },
			...this.db.notifications
		].slice(0, 300);
	}

	get myNotifications(): Notification[] {
		const a = this.account;
		if (!a) return [];
		return this.db.notifications.filter((n) => n.accountId === a.id);
	}

	get unreadCount(): number {
		return this.myNotifications.filter((n) => !n.read).length;
	}

	markNotificationRead(notificationId: string): void {
		const n = this.db.notifications.find((x) => x.id === notificationId);
		if (!n) return;
		n.read = true;
		this.commit();
	}

	markAllNotificationsRead(): void {
		const a = this.account;
		if (!a) return;
		for (const n of this.db.notifications) if (n.accountId === a.id) n.read = true;
		this.commit();
	}

	/**
	 * Generates the "derived" notifications that depend on time: overdue items
	 * for owners and a new-pulse reminder. Called once per session, never from a
	 * reactive effect, so it cannot loop.
	 */
	refreshDerivedNotifications(): void {
		const a = this.account;
		if (!a) return;
		let changed = false;
		if (a.role !== 'employee') {
			for (const item of scopeForStaff(this.db.feedback, a)) {
				if (item.ownerId !== a.id || !isOverdue(item, Date.now(), this.sla)) continue;
				const marker = `overdue:${item.id}`;
				if (this.db.notifications.some((n) => n.accountId === a.id && n.href.includes(marker))) continue;
				this.notify(a.id, 'overdue', `Overdue: ${item.title}`, `/manager/inbox?item=${item.id}#${marker}`);
				changed = true;
			}
		} else if (!this.hasAnsweredPulse()) {
			const marker = `pulse:${this.currentWeek()}`;
			if (!this.db.notifications.some((n) => n.accountId === a.id && n.href.includes(marker))) {
				this.notify(a.id, 'pulse', 'This week\u2019s pulse survey is available', `/app/pulse#${marker}`);
				changed = true;
			}
		}
		if (changed) this.commit();
	}

	// ----- data tools -------------------------------------------------------

	/** JSON backup. Credentials are stripped: a backup never carries passwords or hashes. */
	exportBackup(): string {
		const snapshot = $state.snapshot(this.db) as Database;
		const payload = {
			app: 'VoiceBox',
			version: snapshot.version,
			exportedAt: new Date().toISOString(),
			note: 'Account credentials are not included in backups. Imported accounts get a temporary password.',
			data: {
				...snapshot,
				accounts: snapshot.accounts.map(({ cred: _cred, ...rest }) => ({ ...rest, credRemoved: true })),
				lockouts: {}
			}
		};
		return JSON.stringify(payload, null, 2);
	}

	/** Imports a backup. Accounts without credentials get a known temporary password. */
	async importBackup(text: string): Promise<{ ok: boolean; error?: string; tempPassword?: string }> {
		let parsed: { data?: Partial<Database> } | Partial<Database>;
		try {
			parsed = JSON.parse(text);
		} catch {
			return { ok: false, error: 'That file is not valid JSON.' };
		}
		const raw = ('data' in parsed && parsed.data ? parsed.data : parsed) as Partial<Database>;
		if (!Array.isArray(raw.feedback) || !Array.isArray(raw.accounts)) return { ok: false, error: 'That backup does not look like a VoiceBox export.' };
		const temp = 'Voicebox@123';
		const cred = await hashPassword(temp, 10_000);
		const accounts: Account[] = raw.accounts.map((a) => ({ ...(a as Account), cred: (a as Account).cred ?? cred }));
		const { migrate } = await import('./core/store.ts');
		this.db = migrate({ ...raw, accounts }, emptyDatabase());
		this.db.seeded = true;
		this.commit();
		this.applyTheme();
		return { ok: true, tempPassword: temp };
	}

	async loadSampleData(): Promise<void> {
		this.db = await buildSampleDatabase();
		this.commit();
		this.applyTheme();
	}

	/** Start fresh: clears everything in this browser and signs out. */
	startFresh(): void {
		this.store.clearAll();
		this.db = emptyDatabase();
		this.db.seeded = true;
		this.session = null;
		this.store.setSession(null);
		this.commit();
	}

	// ----- helpers used by views -------------------------------------------

	overdue(item: Feedback): boolean {
		return isOverdue(item, Date.now(), this.sla);
	}

	due(item: Feedback): number {
		return slaDueDate(item, this.sla);
	}

	/** People who can own an item (managers + admins), for the owner picker. */
	get owners(): Account[] {
		return this.db.accounts.filter((a) => a.active && a.role !== 'employee').sort((x, y) => x.name.localeCompare(y.name));
	}
}

export const app = new AppState();
