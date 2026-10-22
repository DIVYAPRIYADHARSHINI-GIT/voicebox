// Dashboard aggregation, pulse summaries (including the anonymity threshold)
// and the inbox filter/sort engine.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	byCategory,
	byStatus,
	computeKpis,
	departmentComparison,
	inRange,
	pulseByDepartment,
	rangeStart,
	resolutionTrend,
	sentimentTrend,
	summarizePulse,
	topIdeas,
	topThemes,
	volumeSeries
} from '../../src/lib/core/stats.ts';
import { applyFilters, activeFilterCount, emptyFilters, sortItems } from '../../src/lib/core/filters.ts';
import { defaultSettings } from '../../src/lib/core/defaults.ts';
import { THRESHOLD_MESSAGE } from '../../src/lib/core/rules.ts';
import { DAY_MS, startOfWeek, weekKey } from '../../src/lib/core/time.ts';
import { STATUSES, type Feedback, type PulseResponse, type Status } from '../../src/lib/core/types.ts';

const T0 = new Date(2026, 9, 22, 12, 0, 0).getTime();
const settings = defaultSettings();
const NPS_Q = settings.pulseQuestions.find((q) => q.kind === 'nps')!.id;
const SCALE_QS = settings.pulseQuestions.filter((q) => q.kind === 'scale5').map((q) => q.id);

function item(over: Partial<Feedback> = {}): Feedback {
	return {
		id: `fb-${Math.random().toString(36).slice(2)}`,
		title: 'Item',
		description: 'Description text',
		type: 'Suggestion',
		category: 'Culture',
		department: 'Design',
		urgency: 'Medium',
		anonymous: false,
		authorId: 'acct-1',
		authorName: 'Asha Ramanathan',
		createdAt: T0,
		updatedAt: T0,
		status: 'New',
		priority: 'Medium',
		sentiment: 'Neutral',
		tags: [],
		isPublic: false,
		upvotes: [],
		comments: [],
		responses: [],
		notes: [],
		history: [],
		readBy: [],
		...over
	};
}

function pulse(over: Partial<PulseResponse> = {}): PulseResponse {
	return {
		id: `p-${Math.random().toString(36).slice(2)}`,
		week: weekKey(T0),
		at: T0,
		department: 'Design',
		scores: { [SCALE_QS[0]]: 4, [SCALE_QS[1]]: 4, [SCALE_QS[2]]: 4, [NPS_Q]: 9 },
		...over
	};
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

test('kpis: counts, averages and overdue', () => {
	const items = [
		item({ status: 'New', createdAt: T0 - 60 * DAY_MS, priority: 'Critical' }), // overdue
		item({ status: 'In progress', createdAt: T0 - DAY_MS, firstResponseAt: T0 - DAY_MS + 3_600_000 }),
		item({ status: 'Resolved', createdAt: T0 - 5 * DAY_MS, resolvedAt: T0 - 3 * DAY_MS, firstResponseAt: T0 - 4 * DAY_MS }),
		item({ status: 'Declined', createdAt: T0 - 10 * DAY_MS })
	];
	const k = computeKpis(items, [], settings, T0);
	assert.equal(k.total, 4);
	assert.equal(k.open, 2, 'New + In progress are open');
	assert.equal(k.overdue, 1);
	assert.ok(k.avgFirstResponseHours !== null && k.avgFirstResponseHours > 0);
	assert.ok(k.avgResolutionHours !== null && k.avgResolutionHours > 0);
});

test('kpis: resolved-this-month counts only the current month', () => {
	const items = [item({ status: 'Resolved', resolvedAt: T0 }), item({ status: 'Resolved', resolvedAt: T0 - 60 * DAY_MS })];
	assert.equal(computeKpis(items, [], settings, T0).resolvedThisMonth, 1);
});

test('kpis: with no data the averages are null, not zero', () => {
	const k = computeKpis([], [], settings, T0);
	assert.equal(k.avgFirstResponseHours, null);
	assert.equal(k.avgResolutionHours, null);
	assert.equal(k.total, 0);
});

test('kpis: eNPS comes from the pulse responses', () => {
	const responses = [pulse({ scores: { [NPS_Q]: 10 } }), pulse({ scores: { [NPS_Q]: 10 } }), pulse({ scores: { [NPS_Q]: 0 } })];
	const k = computeKpis([], responses, settings, T0);
	assert.equal(k.enpsResponses, 3);
	assert.equal(k.enps, 33, '2 promoters, 1 detractor over 3 = 67 - 33 = 34 -> rounded 33');
});

// ---------------------------------------------------------------------------
// Series and groupings
// ---------------------------------------------------------------------------

test('ranges: date ranges clamp correctly', () => {
	assert.equal(rangeStart('all', T0), 0);
	assert.ok(rangeStart('7d', T0) < T0);
	assert.equal(inRange(T0, '7d', T0), true);
	assert.equal(inRange(T0 - 30 * DAY_MS, '7d', T0), false);
	assert.equal(inRange(T0 - 30 * DAY_MS, 'all', T0), true);
});

test('volume: one bucket per day over 7 days', () => {
	const items = [item({ createdAt: T0 }), item({ createdAt: T0 }), item({ createdAt: T0 - 2 * DAY_MS })];
	const series = volumeSeries(items, '7d', T0);
	assert.equal(series.length, 7);
	assert.equal(series.reduce((s, p) => s + p.value, 0), 3);
	assert.equal(series[series.length - 1].value, 2, 'today has two items');
});

test('volume: long ranges bucket by week', () => {
	const items = [item({ createdAt: T0 }), item({ createdAt: T0 - 14 * DAY_MS })];
	const series = volumeSeries(items, '90d', T0);
	assert.ok(series.length <= 16);
	assert.equal(series.reduce((s, p) => s + p.value, 0), 2);
});

test('groupings: by category and status', () => {
	const items = [item({ category: 'Culture' }), item({ category: 'Culture' }), item({ category: 'Facilities', status: 'Resolved' })];
	const cats = byCategory(items);
	assert.equal(cats[0].label, 'Culture');
	assert.equal(cats[0].value, 2);
	const statuses = byStatus(items, STATUSES);
	assert.deepEqual(statuses.map((s) => s.label), ['New', 'Resolved'], 'only statuses present are returned, in canonical order');
});

test('sentiment trend: weekly mix of the three labels', () => {
	const week = startOfWeek(T0);
	const items = [
		item({ createdAt: week + DAY_MS, sentiment: 'Positive' }),
		item({ createdAt: week + 2 * DAY_MS, sentiment: 'Negative' }),
		item({ createdAt: week - 6 * DAY_MS, sentiment: 'Neutral' })
	];
	const trend = sentimentTrend(items);
	assert.ok(trend.length >= 1);
	const last = trend[trend.length - 1];
	assert.equal(last.Positive, 1);
	assert.equal(last.Negative, 1);
});

test('resolution trend: average hours per resolved week', () => {
	const items = [item({ status: 'Resolved', createdAt: T0 - 2 * DAY_MS, resolvedAt: T0 }), item({ status: 'New' })];
	const trend = resolutionTrend(items);
	assert.equal(trend.length, 1);
	assert.ok(trend[0].value > 40 && trend[0].value < 56, `expected ~48h, got ${trend[0].value}`);
});

test('top ideas: public items sorted by upvotes', () => {
	const items = [
		item({ id: 'a', isPublic: true, upvotes: ['1', '2', '3'] }),
		item({ id: 'b', isPublic: true, upvotes: ['1'] }),
		item({ id: 'c', isPublic: false, upvotes: ['1', '2', '3', '4', '5'] }),
		item({ id: 'd', isPublic: true, upvotes: [] })
	];
	const top = topIdeas(items, 5);
	assert.deepEqual(top.map((t) => t.item.id), ['a', 'b'], 'private items and zero-vote items are excluded');
	assert.equal(top[0].votes, 3);
});

test('top themes: tags rank above keywords', () => {
	const items = [item({ tags: ['facilities'], title: 'Noise problem' }), item({ tags: ['facilities'], title: 'Noise levels' }), item({ title: 'Something else entirely' })];
	const themes = topThemes(items, 5);
	assert.equal(themes[0].label, 'facilities');
	assert.equal(themes[0].kind, 'tag');
	assert.equal(themes[0].count, 2);
});

test('department comparison: small groups are protected', () => {
	const items = [
		...Array.from({ length: 6 }, () => item({ department: 'Design' })),
		...Array.from({ length: 2 }, () => item({ department: 'Operations' }))
	];
	const rows = departmentComparison(items, 5);
	const design = rows.find((r) => r.department === 'Design')!;
	const ops = rows.find((r) => r.department === 'Operations')!;
	assert.equal(design.shown, true);
	assert.equal(design.count, 6);
	assert.equal(ops.shown, false, 'fewer than 5 items stays hidden');
});

// ---------------------------------------------------------------------------
// Pulse summaries and the anonymity threshold
// ---------------------------------------------------------------------------

test('pulse: fewer than 5 responses hides the results', () => {
	const few = Array.from({ length: 4 }, () => pulse());
	const summary = summarizePulse(few, settings);
	assert.equal(summary.responses, 4);
	assert.equal(summary.shown, false, THRESHOLD_MESSAGE);
	assert.deepEqual(summary.comments, [], 'comments are withheld below the threshold');
});

test('pulse: five responses unlock the results', () => {
	const enough = Array.from({ length: 5 }, () => pulse({ comment: 'Good week' }));
	const summary = summarizePulse(enough, settings);
	assert.equal(summary.shown, true);
	assert.equal(summary.responses, 5);
	assert.equal(summary.scores.length, 3, 'three 1-5 questions');
	assert.equal(summary.scores[0].average, 4);
	assert.equal(summary.enps.score, 100, 'all nines are promoters');
	assert.equal(summary.comments.length, 5);
});

test('pulse: a custom threshold from Settings is honoured', () => {
	const three = Array.from({ length: 3 }, () => pulse());
	assert.equal(summarizePulse(three, { ...settings, anonymityThreshold: 3 }).shown, true);
	assert.equal(summarizePulse(three, { ...settings, anonymityThreshold: 10 }).shown, false);
});

test('pulse: weekly trend marks small weeks as protected', () => {
	const thisWeek = Array.from({ length: 6 }, () => pulse());
	const lastWeek = Array.from({ length: 2 }, () => pulse({ week: weekKey(T0 - 7 * DAY_MS), at: T0 - 7 * DAY_MS }));
	const summary = summarizePulse([...thisWeek, ...lastWeek], settings);
	const small = summary.trend.find((t) => t.responses === 2)!;
	const big = summary.trend.find((t) => t.responses === 6)!;
	assert.equal(small.shown, false);
	assert.equal(big.shown, true);
});

test('pulse: per-department summaries apply the threshold independently', () => {
	const rows = [
		...Array.from({ length: 6 }, () => pulse({ department: 'Design' })),
		...Array.from({ length: 2 }, () => pulse({ department: 'Operations' }))
	];
	const byDept = pulseByDepartment(rows, settings, ['Design', 'Operations', 'Engineering']);
	assert.equal(byDept.length, 2, 'departments with no responses are omitted');
	assert.equal(byDept.find((d) => d.department === 'Design')!.summary.shown, true);
	assert.equal(byDept.find((d) => d.department === 'Operations')!.summary.shown, false);
});

test('pulse: comment themes are extracted from the comments', () => {
	const rows = Array.from({ length: 6 }, () => pulse({ comment: 'workload heavy this week, workload again' }));
	const summary = summarizePulse(rows, settings);
	assert.ok(summary.themes.some((t) => t.label === 'workload'));
});

// ---------------------------------------------------------------------------
// Filters and sorting
// ---------------------------------------------------------------------------

test('filters: empty filters return everything', () => {
	const items = [item(), item({ status: 'Resolved' })];
	assert.equal(applyFilters(items, emptyFilters()).length, 2);
	assert.equal(activeFilterCount(emptyFilters()), 0);
});

test('filters: each dimension narrows the list', () => {
	const items = [
		item({ id: 'a', status: 'New', category: 'Culture', priority: 'Low', sentiment: 'Positive', department: 'Design' }),
		item({ id: 'b', status: 'Resolved', category: 'Facilities', priority: 'Critical', sentiment: 'Negative', department: 'Operations' })
	];
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), status: 'New' }).map((f) => f.id), ['a']);
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), category: 'Facilities' }).map((f) => f.id), ['b']);
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), priority: 'Critical' }).map((f) => f.id), ['b']);
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), sentiment: 'Positive' }).map((f) => f.id), ['a']);
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), department: 'Design' }).map((f) => f.id), ['a']);
});

test('filters: search matches title, description, tags and submitter', () => {
	const items = [
		item({ id: 'a', title: 'Standing desks', tags: ['ergonomics'] }),
		item({ id: 'b', title: 'Coffee machine', description: 'The filter coffee is better', authorName: 'Tomas Lindgren' }),
		item({ id: 'c', title: 'Something else', anonymous: true, authorId: undefined, authorName: undefined })
	];
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), q: 'desks' }).map((f) => f.id), ['a']);
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), q: 'ergonomics' }).map((f) => f.id), ['a']);
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), q: 'tomas' }).map((f) => f.id), ['b']);
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), q: 'anonymous' }).map((f) => f.id), ['c']);
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), q: 'coffee filter' }).map((f) => f.id), ['b'], 'all terms must match');
});

test('filters: overdue, anonymous, unread and mine toggles', () => {
	const items = [
		item({ id: 'overdue', createdAt: T0 - 90 * DAY_MS, priority: 'Critical' }),
		item({ id: 'anon', anonymous: true, authorId: undefined, authorName: undefined }),
		item({ id: 'read', readBy: ['viewer'] }),
		item({ id: 'mine', ownerId: 'viewer' })
	];
	const ctx = { viewerId: 'viewer', at: T0 };
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), overdue: true }, ctx).map((f) => f.id), ['overdue']);
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), anonymous: true }, ctx).map((f) => f.id), ['anon']);
	assert.equal(applyFilters(items, { ...emptyFilters(), unread: true }, ctx).some((f) => f.id === 'read'), false);
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), mine: true }, ctx).map((f) => f.id), ['mine']);
});

test('filters: confidential include/exclude/only', () => {
	const items = [item({ id: 'normal' }), item({ id: 'conf', category: 'Confidential report' })];
	assert.equal(applyFilters(items, { ...emptyFilters(), confidential: 'include' }).length, 2);
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), confidential: 'exclude' }).map((f) => f.id), ['normal']);
	assert.deepEqual(applyFilters(items, { ...emptyFilters(), confidential: 'only' }).map((f) => f.id), ['conf']);
});

test('filters: the active count reflects what the user set', () => {
	assert.equal(activeFilterCount({ ...emptyFilters(), q: 'desk', overdue: true, status: 'New' }), 3);
});

test('sorting: every key orders as documented', () => {
	const a = item({ id: 'a', createdAt: T0 - 2 * DAY_MS, priority: 'Low', status: 'Resolved', upvotes: ['1'], dueDate: T0 + 10 * DAY_MS });
	const b = item({ id: 'b', createdAt: T0, priority: 'Critical', status: 'New', upvotes: ['1', '2'], dueDate: T0 + DAY_MS });
	const due = (f: Feedback) => f.dueDate ?? Number.MAX_SAFE_INTEGER;
	assert.deepEqual(sortItems([a, b], 'newest', due).map((f) => f.id), ['b', 'a']);
	assert.deepEqual(sortItems([a, b], 'oldest', due).map((f) => f.id), ['a', 'b']);
	assert.deepEqual(sortItems([a, b], 'due', due).map((f) => f.id), ['b', 'a']);
	assert.deepEqual(sortItems([a, b], 'priority', due).map((f) => f.id), ['b', 'a']);
	assert.deepEqual(sortItems([a, b], 'status', due).map((f) => f.id), ['b', 'a']);
	assert.deepEqual(sortItems([a, b], 'votes', due).map((f) => f.id), ['b', 'a']);
});

test('performance: filtering and sorting 500 items stays fast', () => {
	const many = Array.from({ length: 500 }, (_, i) =>
		item({
			id: `fb-${i}`,
			title: `Item number ${i} about facilities and tooling`,
			createdAt: T0 - i * 3_600_000,
			status: (['New', 'Under review', 'In progress', 'Resolved', 'Declined'] as Status[])[i % 5],
			department: settings.departments[i % settings.departments.length]
		})
	);
	const start = Date.now();
	const out = sortItems(applyFilters(many, { ...emptyFilters(), q: 'facilities' }, { at: T0 }), 'priority', (f) => f.dueDate ?? 0);
	const elapsed = Date.now() - start;
	assert.equal(out.length, 500);
	assert.ok(elapsed < 300, `filter+sort of 500 items took ${elapsed}ms`);
});
