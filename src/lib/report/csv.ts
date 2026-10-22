// CSV generation for feedback and pulse exports.
//
// Anonymity rules are enforced here, not only in the UI: an anonymous row can
// never carry a submitter name, and confidential rows are only included when
// the caller explicitly asked for them.

export type CsvRow = Array<string | number | boolean | null | undefined>;

/** RFC 4180 escaping, with a BOM so Excel opens UTF-8 correctly. */
export function toCsv(headers: string[], rows: CsvRow[]): string {
	const cell = (v: CsvRow[number]) => {
		const s = v === null || v === undefined ? '' : String(v);
		return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	return '\ufeff' + [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n';
}

export const FEEDBACK_HEADERS = [
	'ID',
	'Title',
	'Description',
	'Type',
	'Category',
	'Department',
	'Submitter',
	'Anonymous',
	'Self-rated urgency',
	'Sentiment (auto-estimated)',
	'Sentiment overridden',
	'Status',
	'Priority',
	'Owner',
	'Tags',
	'Public',
	'Upvotes',
	'Submitted',
	'Due date',
	'Overdue',
	'First response',
	'Resolved',
	'Public responses',
	'Decline reason'
];

export interface CsvFeedbackRow {
	id: string;
	title: string;
	description: string;
	type: string;
	category: string;
	department: string;
	/** "Anonymous" for anonymous items; a name only for named ones. */
	submitter: string;
	anonymous: boolean;
	urgency: string;
	sentiment: string;
	sentimentOverridden: boolean;
	status: string;
	priority: string;
	owner: string;
	tags: string;
	isPublic: boolean;
	upvotes: number;
	submittedAt: string;
	dueAt: string;
	overdue: boolean;
	firstResponseAt: string;
	resolvedAt: string;
	responses: string;
	declineReason: string;
}

/** Final anonymity guard before a row reaches the file. */
export function feedbackCsv(rows: CsvFeedbackRow[]): string {
	return toCsv(
		FEEDBACK_HEADERS,
		rows.map((r) => [
			r.id,
			r.title,
			r.description,
			r.type,
			r.category,
			r.department,
			r.anonymous ? 'Anonymous' : r.submitter,
			r.anonymous ? 'Yes' : 'No',
			r.urgency,
			r.sentiment,
			r.sentimentOverridden ? 'Yes' : 'No',
			r.status,
			r.priority,
			r.owner,
			r.tags,
			r.isPublic ? 'Yes' : 'No',
			r.upvotes,
			r.submittedAt,
			r.dueAt,
			r.overdue ? 'Yes' : 'No',
			r.firstResponseAt,
			r.resolvedAt,
			r.responses,
			r.declineReason
		])
	);
}

export const PULSE_HEADERS = ['Week', 'Department', 'Responses', 'Average (1-5)', 'eNPS', 'Note'];

export interface CsvPulseRow {
	week: string;
	department: string;
	responses: number;
	average: number | null;
	enps: number | null;
	/** Set when the group is below the anonymity threshold. */
	note: string;
}

export function pulseCsv(rows: CsvPulseRow[]): string {
	return toCsv(
		PULSE_HEADERS,
		rows.map((r) => [r.week, r.department, r.responses, r.average === null ? '' : r.average.toFixed(1), r.enps === null ? '' : r.enps, r.note])
	);
}
