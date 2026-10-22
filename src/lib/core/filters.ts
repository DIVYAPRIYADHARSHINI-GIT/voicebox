// Inbox/board filtering, searching and sorting. Pure and cheap so it stays fast
// with 500+ items (single pass filter, then one sort).
import type { Feedback, Priority, Sentiment, Status } from './types.ts';
import { isConfidential, isOverdue, tokenize } from './rules.ts';

export interface FilterState {
	q: string;
	status: Status | 'all';
	category: string;
	department: string;
	priority: Priority | 'all';
	sentiment: Sentiment | 'all';
	overdue: boolean;
	anonymous: boolean;
	unread: boolean;
	mine: boolean;
	confidential: 'include' | 'exclude' | 'only';
}

export const emptyFilters = (): FilterState => ({
	q: '',
	status: 'all',
	category: 'all',
	department: 'all',
	priority: 'all',
	sentiment: 'all',
	overdue: false,
	anonymous: false,
	unread: false,
	mine: false,
	confidential: 'include'
});

export type SortKey = 'newest' | 'oldest' | 'due' | 'priority' | 'status' | 'votes';

const PRIORITY_RANK: Record<Priority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const STATUS_RANK: Record<Status, number> = { New: 0, 'Under review': 1, 'In progress': 2, Resolved: 3, Declined: 4 };

export interface FilterContext {
	viewerId?: string;
	at?: number;
	sla?: Record<Priority, { respond: number; resolve: number }>;
}

export function applyFilters(items: Feedback[], f: FilterState, ctx: FilterContext = {}): Feedback[] {
	const at = ctx.at ?? Date.now();
	const terms = tokenize(f.q);
	return items.filter((item) => {
		if (f.status !== 'all' && item.status !== f.status) return false;
		if (f.category !== 'all' && item.category !== f.category) return false;
		if (f.department !== 'all' && item.department !== f.department) return false;
		if (f.priority !== 'all' && item.priority !== f.priority) return false;
		if (f.sentiment !== 'all' && item.sentiment !== f.sentiment) return false;
		if (f.overdue && !isOverdue(item, at, ctx.sla)) return false;
		if (f.anonymous && !item.anonymous) return false;
		if (f.unread && ctx.viewerId && item.readBy.includes(ctx.viewerId)) return false;
		if (f.mine && ctx.viewerId && item.ownerId !== ctx.viewerId) return false;
		if (f.confidential === 'exclude' && isConfidential(item)) return false;
		if (f.confidential === 'only' && !isConfidential(item)) return false;
		if (terms.length) {
			const haystack = `${item.title} ${item.description} ${item.tags.join(' ')} ${item.category} ${item.department} ${item.anonymous ? 'anonymous' : (item.authorName ?? '')}`.toLowerCase();
			if (!terms.every((t) => haystack.includes(t))) return false;
		}
		return true;
	});
}

export function sortItems(items: Feedback[], key: SortKey, dueOf: (f: Feedback) => number): Feedback[] {
	const copy = [...items];
	switch (key) {
		case 'oldest':
			return copy.sort((a, b) => a.createdAt - b.createdAt);
		case 'due':
			return copy.sort((a, b) => dueOf(a) - dueOf(b));
		case 'priority':
			return copy.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.createdAt - a.createdAt);
		case 'status':
			return copy.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.createdAt - a.createdAt);
		case 'votes':
			return copy.sort((a, b) => b.upvotes.length - a.upvotes.length || b.createdAt - a.createdAt);
		case 'newest':
		default:
			return copy.sort((a, b) => b.createdAt - a.createdAt);
	}
}

export const activeFilterCount = (f: FilterState): number =>
	[
		f.q.trim() !== '',
		f.status !== 'all',
		f.category !== 'all',
		f.department !== 'all',
		f.priority !== 'all',
		f.sentiment !== 'all',
		f.overdue,
		f.anonymous,
		f.unread,
		f.mine,
		f.confidential !== 'include'
	].filter(Boolean).length;
