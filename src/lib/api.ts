// ApiFeedbackStore - the live FeedbackStore implementation.
//
// Every call goes to a SvelteKit server route backed by shared storage, so what
// one device writes, every other device reads. Cookies carry the signed session
// automatically (`credentials: 'same-origin'`).
import type { Account, Feedback, Notification, PulseQuestion, Settings } from './core/types.ts';

export interface ApiError {
	ok: false;
	error: string;
	errors?: Record<string, string>;
	reason?: string;
	locked?: boolean;
	minutes?: number;
}

export type ApiResult<T> = ({ ok: true } & T) | ApiError;

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
	try {
		const res = await fetch(path, {
			credentials: 'same-origin',
			headers: init?.body ? { 'content-type': 'application/json' } : undefined,
			...init
		});
		const text = await res.text();
		if (!text) return res.ok ? ({ ok: true } as ApiResult<T>) : { ok: false, error: `Request failed (${res.status}).` };
		const data = JSON.parse(text) as ApiResult<T>;
		if (!res.ok && data.ok !== false) return { ok: false, error: `Request failed (${res.status}).` };
		return data;
	} catch {
		// Network failure, offline, or a server that is still cold-starting.
		return { ok: false, error: 'Could not reach VoiceBox. Check your connection and try again.' };
	}
}

const post = <T>(path: string, body?: unknown) => call<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => call<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export interface SafeAccount extends Omit<Account, 'cred'> {}

export interface OwnerOption {
	id: string;
	name: string;
	department: string;
	role: string;
}

export const api = {
	// ----- auth -----
	me: () => call<{ account: SafeAccount | null; reason: string | null; status: string; settings: Settings }>('/api/auth/me'),
	login: (email: string, password: string, portal: 'employee' | 'manager') => post<{ account: SafeAccount }>('/api/auth/login', { email, password, portal }),
	logout: () => post('/api/auth/logout'),
	changePassword: (current: string, next: string) => post('/api/auth/password', { current, next }),

	// ----- feedback -----
	feed: () =>
		call<{
			scope: string;
			items?: Feedback[];
			owners?: OwnerOption[];
			mine?: Feedback[];
			ideas?: Feedback[];
			wall?: Feedback[];
		}>('/api/feedback'),
	submit: (input: {
		title: string;
		description: string;
		type: string;
		category: string;
		department: string;
		urgency: string;
		anonymous: boolean;
		makePublic: boolean;
		confidentialAck?: boolean;
	}) => post<{ item: Feedback }>('/api/feedback/submit', input),
	track: (code: string) => post<{ item: Feedback & { upvotes: number } }>('/api/feedback/track', { code }),

	// Triage actions (staff only; the server re-checks access per item).
	setStatus: (id: string, status: string, reason?: string) => patch<{ item: Feedback }>(`/api/feedback/${id}`, { action: 'status', status, reason }),
	setPriority: (id: string, priority: string) => patch<{ item: Feedback }>(`/api/feedback/${id}`, { action: 'priority', priority }),
	setSentiment: (id: string, sentiment: string) => patch<{ item: Feedback }>(`/api/feedback/${id}`, { action: 'sentiment', sentiment }),
	setOwner: (id: string, ownerId: string) => patch<{ item: Feedback }>(`/api/feedback/${id}`, { action: 'owner', ownerId }),
	setDue: (id: string, dueDate: number | null) => patch<{ item: Feedback }>(`/api/feedback/${id}`, { action: 'due', dueDate }),
	addTag: (id: string, tag: string) => patch<{ item: Feedback }>(`/api/feedback/${id}`, { action: 'tag-add', tag }),
	removeTag: (id: string, tag: string) => patch<{ item: Feedback }>(`/api/feedback/${id}`, { action: 'tag-remove', tag }),
	addNote: (id: string, text: string) => patch<{ item: Feedback }>(`/api/feedback/${id}`, { action: 'note', text }),
	addResponse: (id: string, text: string) => patch<{ item: Feedback }>(`/api/feedback/${id}`, { action: 'response', text }),
	markRead: (id: string, read: boolean) => patch<{ item: Feedback }>(`/api/feedback/${id}`, { action: 'read', read }),

	// ----- ideas -----
	upvote: (itemId: string) => post<{ upvotes: number; voted: boolean }>('/api/ideas', { itemId, action: 'upvote' }),
	comment: (itemId: string, text: string) => post<{ comments: Feedback['comments'] }>('/api/ideas', { itemId, action: 'comment', text }),

	// ----- pulse -----
	pulse: () =>
		call<{
			week: string;
			answered?: boolean;
			questions?: PulseQuestion[];
			overall?: unknown;
			byDepartment?: unknown;
			threshold?: number;
		}>('/api/pulse'),
	submitPulse: (scores: Record<string, number>, comment: string) => post<{ week: string }>('/api/pulse', { scores, comment }),

	// ----- notifications -----
	notifications: () => call<{ items: Notification[]; unread: number }>('/api/notifications'),
	markNotification: (id: string) => post<{ items: Notification[]; unread: number }>('/api/notifications', { action: 'read', id }),
	markAllNotifications: () => post<{ items: Notification[]; unread: number }>('/api/notifications', { action: 'read-all' }),
	refreshNotifications: () => post<{ items: Notification[]; unread: number }>('/api/notifications', { action: 'refresh' }),

	// ----- admin -----
	accounts: () => call<{ accounts: SafeAccount[] }>('/api/admin/accounts'),
	createAccount: (input: { name: string; email: string; password: string; role: string; department: string; title?: string }) =>
		post<{ account: SafeAccount }>('/api/admin/accounts', input),
	setAccountActive: (accountId: string, active: boolean) => patch<{ account: SafeAccount }>('/api/admin/accounts', { accountId, action: 'active', active }),
	resetPassword: (accountId: string, password: string) => patch<{ account: SafeAccount }>('/api/admin/accounts', { accountId, action: 'reset', password }),
	saveSettings: (patchBody: Partial<Settings>) => patch<{ settings: Settings }>('/api/admin/settings', patchBody),
	loadSample: () => post<{ message: string }>('/api/admin/data', { action: 'sample' }),
	startFresh: () => post<{ message: string }>('/api/admin/data', { action: 'fresh' }),
	importBackup: (backup: unknown) => post<{ message: string; tempPassword?: string }>('/api/admin/data', { action: 'import', backup })
};
