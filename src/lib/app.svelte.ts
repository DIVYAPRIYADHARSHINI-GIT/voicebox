// Central app state (Svelte 5 runes) on top of the shared API.
//
// WHAT CHANGED AND WHY
// This used to hold the entire database in the browser and write it to
// localStorage. That made every device an island: an employee's ticket never
// reached the manager portal. Now this is a thin client over the server:
// - `account` and `settings` come from /api/auth/me (the server decides the role)
// - feedback, ideas, pulse and notifications are fetched per portal
// - every mutation posts to the API, then refreshes from the response
//
// Only two things remain browser-local, and both are genuinely per-device:
// the theme (mirrored to the server for signed-in users) and the anonymous
// tracking codes the user has been issued on this device.
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { api, type OwnerOption, type SafeAccount } from './api.ts';
import { defaultSettings } from './core/defaults.ts';
import type { Feedback, Notification, Priority, PulseQuestion, Role, Sentiment, Settings, Status } from './core/types.ts';
import { effectiveSla, isOverdue, scopeForStaff, slaDueDate, type Enps } from './core/rules.ts';
import type { PulseScore, PulseSummary } from './core/stats.ts';

/** Server-computed pulse aggregates (the threshold is applied server-side). */
export interface PulseResultsPayload {
	overall: PulseSummary;
	byDepartment: Array<{ department: string; responses: number; shown: boolean; scores: PulseScore[]; enps: Enps | null }>;
	threshold: number;
}

export interface Toast {
	id: string;
	text: string;
	tone: 'info' | 'success' | 'warn' | 'error';
}

const THEME_KEY = 'voicebox.theme';
const CODES_KEY = 'voicebox.codes';

let toastSeq = 0;

class AppState {
	// ----- identity (server-owned) -----
	account = $state<SafeAccount | null>(null);
	settings = $state<Settings>(defaultSettings());
	ready = $state(false);
	/** True while a portal fetch is in flight, for skeleton loaders. */
	loading = $state(false);

	// ----- data (server-owned) -----
	items = $state<Feedback[]>([]); // staff: scoped triage feed
	mine = $state<Feedback[]>([]); // employee: my named feedback
	ideas = $state<Feedback[]>([]); // employee: public ideas board
	wall = $state<Feedback[]>([]); // employee: you said, we did
	owners = $state<OwnerOption[]>([]);
	notifications = $state<Notification[]>([]);
	unreadCount = $state(0);
	pulseAnswered = $state(false);
	pulseQuestions = $state<PulseQuestion[]>([]);
	/** Staff only: server-computed pulse aggregates, threshold already applied. */
	pulseResults = $state<PulseResultsPayload | null>(null);

	// ----- ui -----
	toasts = $state<Toast[]>([]);
	idleWarning = $state(false);
	redirectMessage = $state('');
	/** Set when shared storage is unreachable, shown as a banner. */
	connectionError = $state('');
	/** Tracking codes issued on this device (local convenience only). */
	myCodes = $state<Array<{ code: string; title: string; at: number }>>([]);

	// ----- lifecycle --------------------------------------------------------

	async init(): Promise<void> {
		if (!browser || this.ready) return;
		this.applyStoredTheme();
		this.myCodes = this.readCodes();
		await this.refreshIdentity();
		this.ready = true;
	}

	/** Re-reads who we are from the server. The server is authoritative. */
	async refreshIdentity(): Promise<void> {
		const res = await api.me();
		if (!res.ok) {
			this.connectionError = res.error;
			return;
		}
		this.connectionError = '';
		this.account = res.account;
		if (res.settings) this.settings = { ...defaultSettings(), ...res.settings };
		if (res.reason) this.redirectMessage = res.reason;
		this.applyTheme();
	}

	/** Loads the data the current portal needs. Safe to call repeatedly. */
	async loadPortal(): Promise<void> {
		if (!this.account) return;
		this.loading = true;
		try {
			const feed = await api.feed();
			if (!feed.ok) {
				// A 401 here means the session ended server-side (expiry/idle).
				if (feed.reason) await this.handleSessionEnd(feed.error);
				else this.connectionError = feed.error;
				return;
			}
			this.connectionError = '';
			if (this.isStaff) {
				this.items = feed.items ?? [];
				this.owners = feed.owners ?? [];
			} else {
				this.mine = feed.mine ?? [];
				this.ideas = feed.ideas ?? [];
				this.wall = feed.wall ?? [];
			}

			const [notes, pulse] = await Promise.all([api.notifications(), api.pulse()]);
			if (notes.ok) {
				this.notifications = notes.items;
				this.unreadCount = notes.unread;
			}
			if (pulse.ok) {
				this.pulseAnswered = Boolean(pulse.answered);
				if (pulse.questions) this.pulseQuestions = pulse.questions;
				if (pulse.overall) {
					this.pulseResults = {
						overall: pulse.overall as PulseResultsPayload['overall'],
						byDepartment: (pulse.byDepartment ?? []) as PulseResultsPayload['byDepartment'],
						threshold: pulse.threshold ?? this.settings.anonymityThreshold
					};
				}
			}
		} finally {
			this.loading = false;
		}
	}

	/** Generates time-derived notifications once per portal load. */
	async refreshDerivedNotifications(): Promise<void> {
		if (!this.account) return;
		const res = await api.refreshNotifications();
		if (res.ok) {
			this.notifications = res.items;
			this.unreadCount = res.unread;
		}
	}

	private async handleSessionEnd(message: string): Promise<void> {
		const to = this.account?.role === 'employee' ? '/login' : '/manager/login';
		this.account = null;
		this.redirectMessage = message;
		this.idleWarning = false;
		await goto(to);
	}

	toast(text: string, tone: Toast['tone'] = 'info'): void {
		const t: Toast = { id: `toast-${++toastSeq}`, text, tone };
		this.toasts = [...this.toasts, t];
		setTimeout(() => this.dismiss(t.id), 4200);
	}

	dismiss(toastId: string): void {
		this.toasts = this.toasts.filter((t) => t.id !== toastId);
	}

	/** Surfaces an API error as a toast and returns false, for terse callers. */
	private problem(message: string): false {
		this.toast(message, 'error');
		return false;
	}

	// ----- roles ------------------------------------------------------------

	get role(): Role | undefined {
		return this.account?.role;
	}
	get isAdmin(): boolean {
		return this.role === 'admin';
	}
	get isStaff(): boolean {
		return this.role === 'manager' || this.role === 'admin';
	}
	get sla() {
		return effectiveSla(this.settings);
	}

	/** Items in scope, already server-filtered; re-applied locally for safety. */
	get scopedFeedback(): Feedback[] {
		if (!this.account || !this.isStaff) return [];
		return scopeForStaff(this.items, this.account);
	}

	byId(itemId: string): Feedback | undefined {
		return this.items.find((f) => f.id === itemId) ?? this.mine.find((f) => f.id === itemId) ?? this.ideas.find((f) => f.id === itemId);
	}

	myFeedback(): Feedback[] {
		return [...this.mine].sort((a, b) => b.createdAt - a.createdAt);
	}

	// ----- auth -------------------------------------------------------------

	async signIn(email: string, password: string, portal: 'employee' | 'manager'): Promise<{ ok: boolean; error?: string }> {
		const res = await api.login(email, password, portal);
		if (!res.ok) return { ok: false, error: res.error };
		this.account = res.account;
		this.redirectMessage = '';
		this.idleWarning = false;
		await this.refreshIdentity();
		await this.loadPortal();
		await this.refreshDerivedNotifications();
		return { ok: true };
	}

	async signOut(message = ''): Promise<void> {
		await api.logout();
		this.account = null;
		this.items = [];
		this.mine = [];
		this.ideas = [];
		this.wall = [];
		this.notifications = [];
		this.unreadCount = 0;
		this.idleWarning = false;
		this.redirectMessage = message;
	}

	async changePassword(current: string, next: string): Promise<{ ok: boolean; error?: string }> {
		const res = await api.changePassword(current, next);
		return res.ok ? { ok: true } : { ok: false, error: res.error };
	}

	/**
	 * Session heartbeat. The server enforces the 8-hour and 15-minute limits;
	 * this just asks it whether we are still signed in, and shows the warning
	 * shortly before the inactivity cut-off.
	 */
	async checkSession(): Promise<void> {
		if (!this.account) return;
		const res = await api.me();
		if (!res.ok) {
			this.connectionError = res.error;
			return;
		}
		if (!res.account) {
			await this.handleSessionEnd(res.reason ?? 'You were signed out.');
			return;
		}
		this.account = res.account;
	}

	/** Any interaction refreshes the server-side inactivity window. */
	touch(): void {
		this.idleWarning = false;
	}

	// ----- feedback ---------------------------------------------------------

	async submitFeedback(input: {
		title: string;
		description: string;
		type: string;
		category: string;
		department: string;
		urgency: string;
		anonymous: boolean;
		makePublic: boolean;
		confidentialAck?: boolean;
	}): Promise<{ ok: boolean; item?: Feedback; errors?: Record<string, string>; error?: string }> {
		const res = await api.submit(input);
		if (!res.ok) return { ok: false, errors: res.errors, error: res.error };
		// Remember an anonymous code locally so the submitter can find it again
		// on this device; it is never sent anywhere.
		if (res.item.trackingCode) this.rememberCode(res.item.trackingCode, res.item.title);
		await this.loadPortal();
		return { ok: true, item: res.item };
	}

	// ----- triage (staff) ---------------------------------------------------

	/** Applies the server's updated item back into the local list. */
	private apply(item: Feedback): void {
		this.items = this.items.map((f) => (f.id === item.id ? item : f));
	}

	async setStatus(itemId: string, to: Status, reason = ''): Promise<{ ok: boolean; error?: string }> {
		const res = await api.setStatus(itemId, to, reason);
		if (!res.ok) return { ok: false, error: res.error };
		this.apply(res.item);
		return { ok: true };
	}

	async setPriority(itemId: string, priority: Priority): Promise<void> {
		const res = await api.setPriority(itemId, priority);
		res.ok ? this.apply(res.item) : this.problem(res.error);
	}

	async setSentiment(itemId: string, sentiment: Sentiment): Promise<void> {
		const res = await api.setSentiment(itemId, sentiment);
		res.ok ? this.apply(res.item) : this.problem(res.error);
	}

	async setOwner(itemId: string, ownerId: string): Promise<void> {
		const res = await api.setOwner(itemId, ownerId);
		res.ok ? this.apply(res.item) : this.problem(res.error);
	}

	async setDueDate(itemId: string, due: number | undefined): Promise<void> {
		const res = await api.setDue(itemId, due ?? null);
		res.ok ? this.apply(res.item) : this.problem(res.error);
	}

	async addTag(itemId: string, tag: string): Promise<void> {
		const res = await api.addTag(itemId, tag);
		res.ok ? this.apply(res.item) : this.problem(res.error);
	}

	async removeTag(itemId: string, tag: string): Promise<void> {
		const res = await api.removeTag(itemId, tag);
		res.ok ? this.apply(res.item) : this.problem(res.error);
	}

	async addNote(itemId: string, text: string): Promise<void> {
		const res = await api.addNote(itemId, text);
		res.ok ? this.apply(res.item) : this.problem(res.error);
	}

	async addResponse(itemId: string, text: string): Promise<void> {
		const res = await api.addResponse(itemId, text);
		res.ok ? this.apply(res.item) : this.problem(res.error);
	}

	async markRead(itemId: string, read = true): Promise<void> {
		const item = this.items.find((f) => f.id === itemId);
		if (!item || !this.account) return;
		// Skip a pointless round trip when the state already matches.
		if (read === item.readBy.includes(this.account.id)) return;
		const res = await api.markRead(itemId, read);
		if (res.ok) this.apply(res.item);
	}

	isUnread(item: Feedback): boolean {
		return this.account ? !item.readBy.includes(this.account.id) : false;
	}

	/** Bulk actions, applied sequentially so the shared store stays consistent. */
	async bulk(itemIds: string[], action: { kind: 'status'; value: Status; reason?: string } | { kind: 'owner'; value: string } | { kind: 'tag'; value: string }): Promise<number> {
		let changed = 0;
		for (const itemId of itemIds) {
			if (action.kind === 'status') {
				if ((await this.setStatus(itemId, action.value, action.reason ?? 'Bulk update')).ok) changed++;
			} else if (action.kind === 'owner') {
				await this.setOwner(itemId, action.value);
				changed++;
			} else {
				await this.addTag(itemId, action.value);
				changed++;
			}
		}
		return changed;
	}

	// ----- ideas ------------------------------------------------------------

	async toggleUpvote(itemId: string): Promise<void> {
		const res = await api.upvote(itemId);
		if (!res.ok) {
			this.problem(res.error);
			return;
		}
		// Reflect the authoritative count from the server.
		this.ideas = this.ideas.map((f) =>
			f.id === itemId
				? { ...f, upvotes: res.voted ? [...f.upvotes.filter((x) => x !== this.account?.id), this.account!.id] : f.upvotes.filter((x) => x !== this.account?.id) }
				: f
		);
	}

	hasUpvoted(item: Feedback): boolean {
		return this.account ? item.upvotes.includes(this.account.id) : false;
	}

	async addComment(itemId: string, text: string): Promise<void> {
		const res = await api.comment(itemId, text);
		if (!res.ok) {
			this.problem(res.error);
			return;
		}
		this.ideas = this.ideas.map((f) => (f.id === itemId ? { ...f, comments: res.comments } : f));
	}

	// ----- pulse ------------------------------------------------------------

	hasAnsweredPulse(): boolean {
		return this.pulseAnswered;
	}

	async submitPulse(scores: Record<string, number>, comment: string): Promise<{ ok: boolean; error?: string }> {
		const res = await api.submitPulse(scores, comment);
		if (!res.ok) return { ok: false, error: res.error };
		this.pulseAnswered = true;
		return { ok: true };
	}

	// ----- notifications ----------------------------------------------------

	get myNotifications(): Notification[] {
		return this.notifications;
	}

	async markNotificationRead(notificationId: string): Promise<void> {
		const res = await api.markNotification(notificationId);
		if (res.ok) {
			this.notifications = res.items;
			this.unreadCount = res.unread;
		}
	}

	async markAllNotificationsRead(): Promise<void> {
		const res = await api.markAllNotifications();
		if (res.ok) {
			this.notifications = res.items;
			this.unreadCount = res.unread;
		}
	}

	// ----- settings / theme -------------------------------------------------

	async saveSettings(patch: Partial<Settings>): Promise<{ ok: boolean; error?: string }> {
		const res = await api.saveSettings(patch);
		if (!res.ok) return { ok: false, error: res.error };
		this.settings = { ...defaultSettings(), ...res.settings };
		this.applyTheme();
		return { ok: true };
	}

	/**
	 * Theme is a per-device preference: applied and stored locally immediately,
	 * and mirrored to the account when signed in so a new device inherits it.
	 */
	toggleTheme(): void {
		const theme = this.settings.theme === 'dark' ? 'light' : 'dark';
		this.settings = { ...this.settings, theme };
		this.storeTheme(theme);
		this.applyTheme();
		if (this.account) void api.saveSettings({ theme });
	}

	setTheme(theme: 'light' | 'dark'): void {
		this.settings = { ...this.settings, theme };
		this.storeTheme(theme);
		this.applyTheme();
		if (this.account) void api.saveSettings({ theme });
	}

	applyTheme(): void {
		if (!browser) return;
		document.documentElement.dataset.theme = this.settings.theme;
	}

	private applyStoredTheme(): void {
		try {
			const stored = localStorage.getItem(THEME_KEY);
			if (stored === 'dark' || stored === 'light') this.settings = { ...this.settings, theme: stored };
		} catch {
			// Storage blocked: fall back to the server/default theme.
		}
		this.applyTheme();
	}

	private storeTheme(theme: string): void {
		try {
			localStorage.setItem(THEME_KEY, theme);
		} catch {
			// Non-fatal: the theme simply will not persist on this device.
		}
	}

	// ----- local tracking-code memory ---------------------------------------

	private readCodes(): Array<{ code: string; title: string; at: number }> {
		try {
			const raw = localStorage.getItem(CODES_KEY);
			const parsed = raw ? (JSON.parse(raw) as Array<{ code: string; title: string; at: number }>) : [];
			return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
		} catch {
			return [];
		}
	}

	private rememberCode(code: string, title: string): void {
		this.myCodes = [{ code, title, at: Date.now() }, ...this.myCodes.filter((c) => c.code !== code)].slice(0, 20);
		try {
			localStorage.setItem(CODES_KEY, JSON.stringify(this.myCodes));
		} catch {
			// Non-fatal: the user still has the code on screen to copy.
		}
	}

	// ----- admin data tools -------------------------------------------------

	async loadSampleData(): Promise<{ ok: boolean; error?: string }> {
		const res = await api.loadSample();
		if (!res.ok) return { ok: false, error: res.error };
		await this.refreshIdentity();
		await this.loadPortal();
		return { ok: true };
	}

	async importBackup(text: string): Promise<{ ok: boolean; error?: string; tempPassword?: string }> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			return { ok: false, error: 'That file is not valid JSON.' };
		}
		const res = await api.importBackup(parsed);
		if (!res.ok) return { ok: false, error: res.error };
		await this.refreshIdentity();
		await this.loadPortal();
		return { ok: true, tempPassword: res.tempPassword };
	}

	async startFresh(): Promise<{ ok: boolean; error?: string }> {
		const res = await api.startFresh();
		return res.ok ? { ok: true } : { ok: false, error: res.error };
	}

	// ----- view helpers -----------------------------------------------------

	overdue(item: Feedback): boolean {
		return isOverdue(item, Date.now(), this.sla);
	}

	due(item: Feedback): number {
		return slaDueDate(item, this.sla);
	}

	accountById(accountId: string | undefined): OwnerOption | undefined {
		return accountId ? this.owners.find((a) => a.id === accountId) : undefined;
	}
}

export const app = new AppState();
