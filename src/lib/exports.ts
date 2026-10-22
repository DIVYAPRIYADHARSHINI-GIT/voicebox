// Builds the export payloads in the browser and downloads the generated files.
//
// Anonymity and confidential rules are applied HERE, before anything leaves the
// browser, so an anonymous item's author fields never reach a server route,
// a CSV file or a PDF.
import { app } from './app.svelte.ts';
import type { Feedback } from './core/types.ts';
import { THRESHOLD_MESSAGE, isConfidential, isOverdue, submitterLabel } from './core/rules.ts';
import { formatDate, formatDateTime, isoDate, isoMonth, weekKey } from './core/time.ts';
import { RANGES, byCategory, byStatus, computeKpis, inRange, topThemes, type RangeKey } from './core/stats.ts';
import { STATUSES } from './core/types.ts';
import type { ReportItem, ReportRequest } from './report/build.ts';
import type { CsvFeedbackRow, CsvPulseRow } from './report/csv.ts';

/** Triggers a browser download for a blob. */
export function download(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const scopeLabel = () => (app.isAdmin ? 'All departments (Admin/HR)' : `${app.account?.department ?? 'Department'} only`);
const periodLabel = (range: RangeKey) => RANGES.find((r) => r.key === range)?.label ?? 'All time';

/** Items in scope for the signed-in staff member, filtered by range + confidential rule. */
export function exportableItems(range: RangeKey, includeConfidential: boolean): Feedback[] {
	return app.scopedFeedback.filter((f) => inRange(f.createdAt, range)).filter((f) => (isConfidential(f) ? includeConfidential && app.isAdmin : true));
}

function toReportItem(f: Feedback): ReportItem {
	return {
		title: f.title,
		category: f.category,
		type: f.type,
		status: f.status,
		priority: f.priority,
		sentiment: f.sentiment,
		department: f.department,
		// Anonymous items are reduced to the literal string "Anonymous".
		submitter: submitterLabel(f),
		submittedAt: formatDate(f.createdAt),
		dueAt: formatDate(app.due(f)),
		overdue: app.overdue(f),
		response: f.responses.length ? f.responses[f.responses.length - 1].text : undefined,
		resolvedAt: f.resolvedAt ? formatDate(f.resolvedAt) : undefined,
		upvotes: f.upvotes.length
	};
}

export function buildReportRequest(range: RangeKey, includeConfidential: boolean): ReportRequest {
	const items = exportableItems(range, includeConfidential);
	// Pulse figures are computed server-side (the client never receives raw
	// responses), so the report reuses that aggregate.
	const agg = app.pulseResults;
	const summary = agg?.overall ?? null;
	const kpis = computeKpis(items, [], app.settings);

	const topIssues = items
		.filter((f) => f.status !== 'Resolved' && f.status !== 'Declined')
		.sort((a, b) => Number(app.overdue(b)) - Number(app.overdue(a)) || b.upvotes.length - a.upvotes.length)
		.slice(0, 15)
		.map(toReportItem);

	const resolved = items
		.filter((f) => f.status === 'Resolved')
		.sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
		.slice(0, 15)
		.map(toReportItem);

	return {
		format: 'pdf',
		companyName: app.settings.companyName,
		periodLabel: periodLabel(range),
		generatedAt: new Date().toISOString(),
		generatedLabel: formatDateTime(Date.now()),
		scopeLabel: scopeLabel(),
		preparedBy: `${app.account?.name ?? 'VoiceBox'} (${app.isAdmin ? 'Admin/HR' : 'Manager'})`,
		includesConfidential: includeConfidential && app.isAdmin,
		kpis: {
			...kpis,
			enps: summary?.shown ? summary.enps.score : null,
			enpsResponses: summary?.responses ?? 0
		},
		categories: byCategory(items).map((c) => ({ label: c.label, value: c.value })),
		statuses: byStatus(items, STATUSES).map((s) => ({ label: s.label, value: s.value })),
		topIssues,
		resolved,
		pulse: {
			responses: summary?.responses ?? 0,
			thresholdMet: Boolean(summary?.shown),
			thresholdMessage: THRESHOLD_MESSAGE,
			enps: summary?.enps.score ?? 0,
			scores: (summary?.scores ?? []).map((s) => ({ text: s.text, average: s.average })),
			departments: (agg?.byDepartment ?? []).map((d) => ({
				department: d.department,
				responses: d.responses,
				shown: d.shown,
				average: d.shown ? Math.round((d.scores.reduce((sum, x) => sum + (x.average ?? 0), 0) / Math.max(d.scores.length, 1)) * 10) / 10 : null,
				enps: d.shown ? (d.enps?.score ?? null) : null
			}))
		},
		themes: topThemes(items, 10)
	};
}

export async function downloadPdfReport(range: RangeKey, includeConfidential: boolean): Promise<void> {
	const payload = buildReportRequest(range, includeConfidential);
	const res = await fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
	if (!res.ok) {
		const err = (await res.json().catch(() => ({ error: 'Report failed.' }))) as { error?: string };
		throw new Error(err.error ?? 'Could not generate the report.');
	}
	download(await res.blob(), `VoiceBox_Report_${isoMonth(Date.now())}.pdf`);
}

export function feedbackCsvRows(range: RangeKey, includeConfidential: boolean): CsvFeedbackRow[] {
	return exportableItems(range, includeConfidential).map((f) => ({
		id: f.id,
		title: f.title,
		description: f.description,
		type: f.type,
		category: f.category,
		department: f.department,
		// Never send an author name for an anonymous item.
		submitter: f.anonymous ? 'Anonymous' : (f.authorName ?? ''),
		anonymous: f.anonymous,
		urgency: f.urgency,
		sentiment: f.sentiment,
		sentimentOverridden: Boolean(f.sentimentOverridden),
		status: f.status,
		priority: f.priority,
		owner: f.ownerName ?? '',
		tags: f.tags.join('; '),
		isPublic: f.isPublic,
		upvotes: f.upvotes.length,
		submittedAt: formatDateTime(f.createdAt),
		dueAt: formatDate(app.due(f)),
		overdue: isOverdue(f, Date.now(), app.sla),
		firstResponseAt: f.firstResponseAt ? formatDateTime(f.firstResponseAt) : '',
		resolvedAt: f.resolvedAt ? formatDateTime(f.resolvedAt) : '',
		responses: f.responses.map((r) => `${r.authorName}: ${r.text}`).join(' | '),
		declineReason: f.declineReason ?? ''
	}));
}

/**
 * Pulse CSV from the server aggregate. Groups below the anonymity threshold are
 * exported as the protective message, never as numbers.
 */
export function pulseCsvRows(): CsvPulseRow[] {
	const agg = app.pulseResults;
	if (!agg) return [];
	const week = agg.overall.trend.at(-1)?.key ?? currentWeek();
	return agg.byDepartment.map((d) => ({
		week,
		department: d.department,
		responses: d.responses,
		average: d.shown ? Math.round((d.scores.reduce((sum, x) => sum + (x.average ?? 0), 0) / Math.max(d.scores.length, 1)) * 10) / 10 : null,
		enps: d.shown ? (d.enps?.score ?? null) : null,
		note: d.shown ? '' : THRESHOLD_MESSAGE
	}));
}

export async function downloadCsv(kind: 'feedback' | 'pulse', range: RangeKey, includeConfidential: boolean): Promise<void> {
	const rows = kind === 'pulse' ? pulseCsvRows() : feedbackCsvRows(range, includeConfidential);
	const fileName = `VoiceBox_${kind === 'pulse' ? 'Pulse' : 'Feedback'}_${isoDate(Date.now())}.csv`;
	const res = await fetch('/api/csv', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, fileName, rows }) });
	if (!res.ok) {
		const err = (await res.json().catch(() => ({ error: 'Export failed.' }))) as { error?: string };
		throw new Error(err.error ?? 'Could not generate the CSV.');
	}
	download(await res.blob(), fileName);
}

/** Backup is generated server-side so it covers the whole shared dataset. */
export async function downloadBackup(): Promise<void> {
	const res = await fetch('/api/admin/data', { credentials: 'same-origin' });
	if (!res.ok) {
		const err = (await res.json().catch(() => ({ error: 'Backup failed.' }))) as { error?: string };
		throw new Error(err.error ?? 'Could not export the backup.');
	}
	download(await res.blob(), `VoiceBox_Backup_${isoDate(Date.now())}.json`);
}

/** Current week key, exposed for the UI. */
export const currentWeek = () => weekKey(Date.now());
