// Server-side validation of the report payload. The browser is untrusted even
// in demo mode: clamp sizes, coerce types, and never render unexpected shapes.
import type { ReportItem, ReportRequest } from './build.ts';

const MAX_ITEMS = 200;
const MAX_TEXT = 4000;

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown) => v === true;

function cleanItem(raw: unknown): ReportItem {
	const r = (raw ?? {}) as Record<string, unknown>;
	return {
		title: str(r.title, '(untitled)'),
		category: str(r.category),
		type: str(r.type),
		status: str(r.status),
		priority: str(r.priority),
		sentiment: str(r.sentiment),
		department: str(r.department),
		// Anonymity guard: anything that is not a plain string becomes "Anonymous".
		submitter: str(r.submitter, 'Anonymous') || 'Anonymous',
		submittedAt: str(r.submittedAt),
		dueAt: str(r.dueAt),
		overdue: bool(r.overdue),
		response: r.response === undefined ? undefined : str(r.response),
		resolvedAt: r.resolvedAt === undefined ? undefined : str(r.resolvedAt),
		upvotes: num(r.upvotes)
	};
}

const cleanPoints = (raw: unknown) =>
	(Array.isArray(raw) ? raw : []).slice(0, 40).map((p) => {
		const r = (p ?? {}) as Record<string, unknown>;
		return { label: str(r.label), value: num(r.value) };
	});

/** Returns a safe request, or an error string. */
export function cleanReportRequest(raw: unknown): ReportRequest | string {
	if (!raw || typeof raw !== 'object') return 'Request body must be a JSON object.';
	const r = raw as Record<string, unknown>;
	if (r.format !== undefined && r.format !== 'pdf') return 'Only the "pdf" format is supported.';

	const k = (r.kpis ?? {}) as Record<string, unknown>;
	const p = (r.pulse ?? {}) as Record<string, unknown>;

	return {
		format: 'pdf',
		companyName: str(r.companyName, 'Company'),
		periodLabel: str(r.periodLabel, 'All time'),
		generatedAt: str(r.generatedAt, new Date().toISOString()),
		generatedLabel: str(r.generatedLabel),
		scopeLabel: str(r.scopeLabel, 'All departments'),
		preparedBy: str(r.preparedBy, 'VoiceBox'),
		includesConfidential: bool(r.includesConfidential),
		kpis: {
			total: num(k.total),
			open: num(k.open),
			resolvedThisMonth: num(k.resolvedThisMonth),
			avgFirstResponseHours: numOrNull(k.avgFirstResponseHours),
			avgResolutionHours: numOrNull(k.avgResolutionHours),
			overdue: num(k.overdue),
			enps: numOrNull(k.enps),
			enpsResponses: num(k.enpsResponses)
		},
		categories: cleanPoints(r.categories),
		statuses: cleanPoints(r.statuses),
		topIssues: (Array.isArray(r.topIssues) ? r.topIssues : []).slice(0, MAX_ITEMS).map(cleanItem),
		resolved: (Array.isArray(r.resolved) ? r.resolved : []).slice(0, MAX_ITEMS).map(cleanItem),
		pulse: {
			responses: num(p.responses),
			thresholdMet: bool(p.thresholdMet),
			thresholdMessage: str(p.thresholdMessage, 'Not enough responses to protect anonymity'),
			enps: num(p.enps),
			scores: (Array.isArray(p.scores) ? p.scores : []).slice(0, 20).map((s) => {
				const row = (s ?? {}) as Record<string, unknown>;
				return { text: str(row.text), average: numOrNull(row.average) };
			}),
			departments: (Array.isArray(p.departments) ? p.departments : []).slice(0, 40).map((d) => {
				const row = (d ?? {}) as Record<string, unknown>;
				return {
					department: str(row.department),
					responses: num(row.responses),
					shown: bool(row.shown),
					average: numOrNull(row.average),
					enps: numOrNull(row.enps)
				};
			})
		},
		themes: (Array.isArray(r.themes) ? r.themes : []).slice(0, 20).map((t) => {
			const row = (t ?? {}) as Record<string, unknown>;
			return { label: str(row.label), count: num(row.count) };
		})
	};
}
