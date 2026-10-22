// Builds the format-neutral ReportDoc from a report request. The browser sends
// the already department-scoped, anonymity-safe payload; this module never sees
// author data for anonymous items (the client strips it before posting).
import type { Block, ReportDoc, Run } from './doc.ts';

export type ReportFormat = 'pdf';

export interface ReportKpis {
	total: number;
	open: number;
	resolvedThisMonth: number;
	avgFirstResponseHours: number | null;
	avgResolutionHours: number | null;
	overdue: number;
	enps: number | null;
	enpsResponses: number;
}

export interface ReportItem {
	title: string;
	category: string;
	type: string;
	status: string;
	priority: string;
	sentiment: string;
	department: string;
	/** Already "Anonymous" for anonymous items - no author data is ever sent. */
	submitter: string;
	submittedAt: string;
	dueAt: string;
	overdue: boolean;
	response?: string;
	resolvedAt?: string;
	upvotes: number;
}

export interface ReportPulse {
	responses: number;
	thresholdMet: boolean;
	thresholdMessage: string;
	enps: number;
	scores: Array<{ text: string; average: number | null }>;
	departments: Array<{ department: string; responses: number; shown: boolean; average: number | null; enps: number | null }>;
}

export interface ReportRequest {
	format: ReportFormat;
	companyName: string;
	periodLabel: string;
	/** ISO instant; drives the file name. */
	generatedAt: string;
	/** Human-readable local date/time for the header. */
	generatedLabel?: string;
	scopeLabel: string;
	preparedBy: string;
	includesConfidential: boolean;
	kpis: ReportKpis;
	categories: Array<{ label: string; value: number }>;
	statuses: Array<{ label: string; value: number }>;
	topIssues: ReportItem[];
	resolved: ReportItem[];
	pulse: ReportPulse;
	themes: Array<{ label: string; count: number }>;
}

/** VoiceBox_Report_2026-10.pdf */
export function reportFileName(generatedAt: string): string {
	const month = /^(\d{4}-\d{2})/.exec(generatedAt)?.[1] ?? new Date().toISOString().slice(0, 7);
	return `VoiceBox_Report_${month}`;
}

const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '-' : String(v));
const hours = (n: number | null) => (n === null ? '-' : n >= 48 ? `${Math.round(n / 24)} days` : `${n} hours`);

export function buildReport(req: ReportRequest): ReportDoc {
	const blocks: Block[] = [];

	blocks.push({ t: 'title', text: 'VoiceBox feedback report', subtitle: `${req.companyName} - ${req.periodLabel}` });

	const meta: Array<{ label: string; value: Run[] }> = [
		{ label: 'Period', value: [{ text: req.periodLabel }] },
		{ label: 'Scope', value: [{ text: req.scopeLabel }] },
		{ label: 'Prepared by', value: [{ text: req.preparedBy }] },
		{ label: 'Generated', value: [{ text: req.generatedLabel || req.generatedAt }] },
		{
			label: 'Confidential',
			value: [
				{
					text: req.includesConfidential ? 'Confidential reports are INCLUDED in this report.' : 'Confidential reports are excluded.',
					bold: req.includesConfidential,
					tone: req.includesConfidential ? 'high' : 'muted'
				}
			]
		}
	];
	blocks.push({ t: 'meta', rows: meta });
	blocks.push({
		t: 'note',
		text: 'Anonymous submissions are shown as "Anonymous". No author name, email or account id is stored for them, so none can appear in this report.'
	});

	// --- KPIs -----------------------------------------------------------
	blocks.push({ t: 'heading', text: 'Key figures' });
	blocks.push({
		t: 'table',
		headers: ['Measure', 'Value'],
		widths: [62, 38],
		rows: [
			['Total feedback in period', String(req.kpis.total)],
			['Open items', String(req.kpis.open)],
			['Resolved this month', String(req.kpis.resolvedThisMonth)],
			['Average time to first response', hours(req.kpis.avgFirstResponseHours)],
			['Average time to resolution', hours(req.kpis.avgResolutionHours)],
			['Overdue items', [{ text: String(req.kpis.overdue), tone: req.kpis.overdue > 0 ? 'high' : 'muted' }]],
			[
				'Employee Net Promoter Score (eNPS)',
				req.kpis.enps === null ? [{ text: req.pulse.thresholdMessage, tone: 'muted' }] : [{ text: `${req.kpis.enps} (${req.kpis.enpsResponses} responses)` }]
			]
		]
	});

	// --- Categories / statuses -------------------------------------------
	blocks.push({ t: 'heading', text: 'Top categories' });
	if (req.categories.length) {
		blocks.push({
			t: 'table',
			headers: ['Category', 'Items', 'Share'],
			widths: [58, 20, 22],
			rows: req.categories.map((c) => [c.label, String(c.value), `${Math.round((c.value / Math.max(req.kpis.total, 1)) * 100)}%`])
		});
	} else {
		blocks.push({ t: 'para', runs: [{ text: 'No feedback was submitted in this period.', tone: 'muted' }] });
	}

	if (req.statuses.length) {
		blocks.push({ t: 'heading', text: 'Status breakdown' });
		blocks.push({
			t: 'table',
			headers: ['Status', 'Items'],
			widths: [70, 30],
			rows: req.statuses.map((s) => [s.label, String(s.value)])
		});
	}

	// --- Top issues -------------------------------------------------------
	blocks.push({ t: 'heading', text: 'Top issues needing attention' });
	if (req.topIssues.length) {
		blocks.push({
			t: 'table',
			headers: ['Title', 'Category', 'Priority', 'Status', 'Submitter', 'Due'],
			widths: [32, 16, 12, 14, 14, 12],
			rows: req.topIssues.map((i) => [
				i.title,
				i.category,
				[{ text: i.priority, tone: i.priority === 'Critical' ? 'high' : i.priority === 'High' ? 'medium' : 'muted' }],
				i.status,
				i.submitter,
				[{ text: i.dueAt, tone: i.overdue ? 'high' : 'muted' }]
			])
		});
		if (req.topIssues.some((i) => i.overdue)) blocks.push({ t: 'note', text: 'Dates shown in red are past the SLA target for that priority.' });
	} else {
		blocks.push({ t: 'para', runs: [{ text: 'Nothing is open and overdue in this period.', tone: 'low' }] });
	}

	// --- Resolved ---------------------------------------------------------
	blocks.push({ t: 'heading', text: 'Resolved in this period' });
	if (req.resolved.length) {
		for (const item of req.resolved) {
			blocks.push({ t: 'item', runs: [{ text: item.title, bold: true }], keep: 70 });
			blocks.push({
				t: 'para',
				runs: [{ text: `${item.category} - ${item.department} - submitted by ${item.submitter} - resolved ${dash(item.resolvedAt)}`, tone: 'muted' }]
			});
			if (item.response) blocks.push({ t: 'para', runs: [{ text: 'Response: ', bold: true }, { text: item.response }], indent: true });
		}
	} else {
		blocks.push({ t: 'para', runs: [{ text: 'No feedback was resolved in this period.', tone: 'muted' }] });
	}

	// --- Pulse ------------------------------------------------------------
	blocks.push({ t: 'heading', text: 'Pulse survey results' });
	if (!req.pulse.thresholdMet) {
		blocks.push({ t: 'para', runs: [{ text: req.pulse.thresholdMessage, bold: true, tone: 'medium' }] });
		blocks.push({ t: 'para', runs: [{ text: `This group has ${req.pulse.responses} response(s).`, tone: 'muted' }] });
	} else {
		blocks.push({
			t: 'table',
			headers: ['Question', 'Average (1-5)'],
			widths: [74, 26],
			rows: req.pulse.scores.map((s) => [s.text, s.average === null ? '-' : s.average.toFixed(1)])
		});
		blocks.push({ t: 'para', runs: [{ text: 'eNPS: ', bold: true }, { text: `${req.pulse.enps} from ${req.pulse.responses} responses` }] });
		if (req.pulse.departments.length) {
			blocks.push({
				t: 'table',
				headers: ['Department', 'Responses', 'Average', 'eNPS'],
				widths: [40, 20, 20, 20],
				rows: req.pulse.departments.map((d) =>
					d.shown
						? [d.department, String(d.responses), d.average === null ? '-' : d.average.toFixed(1), String(d.enps ?? '-')]
						: [d.department, [{ text: req.pulse.thresholdMessage, tone: 'muted' }], '', '']
				)
			});
		}
		blocks.push({
			t: 'note',
			text: 'Pulse answers store the department only, never a name or account id. Groups below the anonymity threshold are reported as "not enough responses".'
		});
	}

	// --- Themes -----------------------------------------------------------
	if (req.themes.length) {
		blocks.push({ t: 'heading', text: 'Top themes' });
		blocks.push({
			t: 'table',
			headers: ['Theme', 'Mentions'],
			widths: [74, 26],
			rows: req.themes.map((t) => [t.label, String(t.count)])
		});
	}

	return {
		title: `VoiceBox feedback report - ${req.companyName} - ${req.periodLabel}`,
		author: req.preparedBy,
		fileBase: reportFileName(req.generatedAt),
		footer: `VoiceBox - ${req.companyName} - ${req.periodLabel} - demo data stored in the browser`,
		blocks
	};
}
