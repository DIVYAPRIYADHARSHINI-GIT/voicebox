// Dashboard aggregation. Pure functions over an already department-scoped list,
// so a manager's dashboard is simply the same maths over fewer items.
import type { Feedback, Priority, PulseResponse, Sentiment, Settings, Status } from './types.ts';
import { DAY_MS, isoDate, isoMonth, startOfDay, weekKey } from './time.ts';
import { DEFAULT_SLA, enps, isOpen, isOverdue, meetsThreshold, tokenize } from './rules.ts';

export type RangeKey = '7d' | '30d' | '90d' | 'all';

export const RANGES: Array<{ key: RangeKey; label: string; days: number }> = [
	{ key: '7d', label: '7 days', days: 7 },
	{ key: '30d', label: '30 days', days: 30 },
	{ key: '90d', label: '90 days', days: 90 },
	{ key: 'all', label: 'All time', days: 0 }
];

export function rangeStart(key: RangeKey, at = Date.now()): number {
	const days = RANGES.find((r) => r.key === key)?.days ?? 0;
	return days ? startOfDay(at) - (days - 1) * DAY_MS : 0;
}

export const inRange = (t: number, key: RangeKey, at = Date.now()) => t >= rangeStart(key, at);

export interface Kpis {
	total: number;
	open: number;
	resolvedThisMonth: number;
	avgFirstResponseHours: number | null;
	avgResolutionHours: number | null;
	overdue: number;
	enps: number;
	enpsResponses: number;
}

export function computeKpis(items: Feedback[], pulse: PulseResponse[], settings: Pick<Settings, 'sla' | 'pulseQuestions'>, at = Date.now()): Kpis {
	const sla = settings?.sla ?? DEFAULT_SLA;
	const month = isoMonth(at);
	const firstResponse = items.map((f) => (f.firstResponseAt ? (f.firstResponseAt - f.createdAt) / 3_600_000 : null)).filter((n): n is number => n !== null);
	const resolution = items.map((f) => (f.resolvedAt ? (f.resolvedAt - f.createdAt) / 3_600_000 : null)).filter((n): n is number => n !== null);
	const npsQ = settings?.pulseQuestions?.find((q) => q.kind === 'nps');
	const npsScores = npsQ ? pulse.map((p) => p.scores[npsQ.id]).filter((n) => Number.isFinite(n)) : [];
	const e = enps(npsScores);
	return {
		total: items.length,
		open: items.filter((f) => isOpen(f.status)).length,
		resolvedThisMonth: items.filter((f) => f.resolvedAt && isoMonth(f.resolvedAt) === month).length,
		avgFirstResponseHours: firstResponse.length ? round1(avg(firstResponse)) : null,
		avgResolutionHours: resolution.length ? round1(avg(resolution)) : null,
		overdue: items.filter((f) => isOverdue(f, at, sla)).length,
		enps: e.score,
		enpsResponses: e.responses
	};
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface Point {
	label: string;
	value: number;
	key?: string;
}

/** Feedback volume per day (or per week when the range is long). */
export function volumeSeries(items: Feedback[], range: RangeKey, at = Date.now()): Point[] {
	const days = RANGES.find((r) => r.key === range)?.days ?? 0;
	if (range === '7d' || range === '30d') {
		const buckets = new Map<string, number>();
		const span = days || 30;
		for (let i = span - 1; i >= 0; i--) buckets.set(isoDate(startOfDay(at) - i * DAY_MS), 0);
		for (const f of items) {
			const k = isoDate(f.createdAt);
			if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
		}
		return [...buckets].map(([key, value]) => ({ key, label: key.slice(5), value }));
	}
	const buckets = new Map<string, number>();
	for (const f of items) {
		const k = weekKey(f.createdAt);
		buckets.set(k, (buckets.get(k) ?? 0) + 1);
	}
	return [...buckets]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.slice(-16)
		.map(([key, value]) => ({ key, label: key.replace(/^\d{4}-/, ''), value }));
}

export function countBy<T extends string>(items: Feedback[], pick: (f: Feedback) => T, order?: T[]): Point[] {
	const map = new Map<string, number>();
	for (const f of items) {
		const k = pick(f);
		map.set(k, (map.get(k) ?? 0) + 1);
	}
	const keys = order ? order.filter((k) => map.has(k)) : [...map.keys()].sort((a, b) => (map.get(b) ?? 0) - (map.get(a) ?? 0));
	return keys.map((k) => ({ key: k, label: k, value: map.get(k) ?? 0 }));
}

export const byCategory = (items: Feedback[]) => countBy(items, (f) => f.category);
export const byStatus = (items: Feedback[], order: Status[]) => countBy(items, (f) => f.status, order);
export const byDepartment = (items: Feedback[]) => countBy(items, (f) => f.department || 'Unspecified');
export const byPriority = (items: Feedback[], order: Priority[]) => countBy(items, (f) => f.priority, order);

export interface SentimentPoint {
	label: string;
	key: string;
	Positive: number;
	Neutral: number;
	Negative: number;
}

/** Weekly sentiment mix (last 10 weeks within the range). */
export function sentimentTrend(items: Feedback[]): SentimentPoint[] {
	const map = new Map<string, SentimentPoint>();
	for (const f of items) {
		const key = weekKey(f.createdAt);
		const row = map.get(key) ?? { key, label: key.replace(/^\d{4}-/, ''), Positive: 0, Neutral: 0, Negative: 0 };
		row[f.sentiment as Sentiment] += 1;
		map.set(key, row);
	}
	return [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-10);
}

/** Average resolution time (hours) per week the item was resolved. */
export function resolutionTrend(items: Feedback[]): Point[] {
	const map = new Map<string, number[]>();
	for (const f of items) {
		if (!f.resolvedAt) continue;
		const key = weekKey(f.resolvedAt);
		const arr = map.get(key) ?? [];
		arr.push((f.resolvedAt - f.createdAt) / 3_600_000);
		map.set(key, arr);
	}
	return [...map.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.slice(-10)
		.map(([key, xs]) => ({ key, label: key.replace(/^\d{4}-/, ''), value: round1(avg(xs)) }));
}

export function topIdeas(items: Feedback[], limit = 5): Array<{ item: Feedback; votes: number }> {
	return items
		.filter((f) => f.isPublic)
		.map((item) => ({ item, votes: item.upvotes.length }))
		.filter((x) => x.votes > 0)
		.sort((a, b) => b.votes - a.votes || b.item.createdAt - a.item.createdAt)
		.slice(0, limit);
}

/** Department comparison respecting the anonymity threshold for small groups. */
export function departmentComparison(
	items: Feedback[],
	threshold: number
): Array<{ department: string; count: number; open: number; shown: boolean }> {
	const map = new Map<string, Feedback[]>();
	for (const f of items) {
		const k = f.department || 'Unspecified';
		map.set(k, [...(map.get(k) ?? []), f]);
	}
	return [...map.entries()]
		.map(([department, list]) => ({
			department,
			count: list.length,
			open: list.filter((f) => isOpen(f.status)).length,
			shown: meetsThreshold(list.length, threshold)
		}))
		.sort((a, b) => b.count - a.count);
}

const THEME_STOP = new Set([
	'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'are', 'was', 'were', 'our', 'can', 'not', 'but',
	'you', 'all', 'would', 'could', 'should', 'when', 'what', 'they', 'them', 'there', 'their', 'more', 'some', 'very',
	'into', 'than', 'then', 'been', 'about', 'after', 'also', 'just', 'like', 'make', 'need', 'needs', 'get', 'got', 'out',
	'one', 'two', 'per', 'any', 'how', 'who', 'its', 'it\'s', 'we\'re', 'don\'t', 'doesn\'t', 'team', 'work', 'please'
]);

/** Top themes from the most frequent tags and content keywords. */
export function topThemes(items: Feedback[], limit = 8): Array<{ label: string; count: number; kind: 'tag' | 'keyword' }> {
	const tags = new Map<string, number>();
	const words = new Map<string, number>();
	for (const f of items) {
		for (const t of f.tags) tags.set(t.toLowerCase(), (tags.get(t.toLowerCase()) ?? 0) + 1);
		for (const w of new Set(tokenize(`${f.title} ${f.description}`))) {
			if (w.length < 4 || THEME_STOP.has(w)) continue;
			words.set(w, (words.get(w) ?? 0) + 1);
		}
	}
	// Tags are explicit triage signal, so they always rank above inferred
	// keywords; each group is then ordered by frequency.
	const byCount = <T extends { label: string; count: number }>(a: T, b: T) => b.count - a.count || a.label.localeCompare(b.label);
	const tagRows = [...tags.entries()].map(([label, count]) => ({ label, count, kind: 'tag' as const })).sort(byCount);
	const wordRows = [...words.entries()]
		.filter(([label]) => !tags.has(label))
		.map(([label, count]) => ({ label, count, kind: 'keyword' as const }))
		.sort(byCount);
	return [...tagRows, ...wordRows].slice(0, limit);
}

// ---------------------------------------------------------------------------
// Pulse results
// ---------------------------------------------------------------------------

export interface PulseScore {
	questionId: string;
	text: string;
	average: number | null;
	responses: number;
}

export interface PulseSummary {
	responses: number;
	shown: boolean;
	scores: PulseScore[];
	enps: ReturnType<typeof enps>;
	trend: Array<{ key: string; label: string; value: number; responses: number; shown: boolean }>;
	themes: Array<{ label: string; count: number }>;
	comments: string[];
}

export function summarizePulse(responses: PulseResponse[], settings: Pick<Settings, 'pulseQuestions' | 'anonymityThreshold'>): PulseSummary {
	const threshold = settings.anonymityThreshold;
	const questions = settings.pulseQuestions ?? [];
	const scaleQs = questions.filter((q) => q.kind === 'scale5');
	const npsQ = questions.find((q) => q.kind === 'nps');
	const shown = meetsThreshold(responses.length, threshold);

	const scores: PulseScore[] = scaleQs.map((q) => {
		const xs = responses.map((r) => r.scores[q.id]).filter((n) => Number.isFinite(n));
		return { questionId: q.id, text: q.text, average: xs.length ? round1(avg(xs)) : null, responses: xs.length };
	});

	const npsScores = npsQ ? responses.map((r) => r.scores[npsQ.id]).filter((n) => Number.isFinite(n)) : [];

	// Weekly trend of the average of all 1-5 questions.
	const weekly = new Map<string, number[]>();
	for (const r of responses) {
		const xs = scaleQs.map((q) => r.scores[q.id]).filter((n) => Number.isFinite(n));
		weekly.set(r.week, [...(weekly.get(r.week) ?? []), ...xs]);
	}
	const weekCounts = new Map<string, number>();
	for (const r of responses) weekCounts.set(r.week, (weekCounts.get(r.week) ?? 0) + 1);
	const trend = [...weekly.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([key, xs]) => ({
			key,
			label: key.replace(/^\d{4}-/, ''),
			value: round1(avg(xs)),
			responses: weekCounts.get(key) ?? 0,
			shown: meetsThreshold(weekCounts.get(key) ?? 0, threshold)
		}));

	const comments = responses.map((r) => r.comment?.trim()).filter((c): c is string => Boolean(c));
	const words = new Map<string, number>();
	for (const c of comments) {
		for (const w of new Set(tokenize(c))) {
			if (w.length < 4 || THEME_STOP.has(w)) continue;
			words.set(w, (words.get(w) ?? 0) + 1);
		}
	}
	const themes = [...words.entries()]
		.map(([label, count]) => ({ label, count }))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
		.slice(0, 8);

	return { responses: responses.length, shown, scores, enps: enps(npsScores), trend, themes, comments: shown ? comments : [] };
}

/** Per-department pulse summaries, each gated by the anonymity threshold. */
export function pulseByDepartment(
	responses: PulseResponse[],
	settings: Pick<Settings, 'pulseQuestions' | 'anonymityThreshold'>,
	departments: string[]
): Array<{ department: string; summary: PulseSummary }> {
	return departments
		.map((department) => ({ department, summary: summarizePulse(responses.filter((r) => r.department === department), settings) }))
		.filter((row) => row.summary.responses > 0);
}
