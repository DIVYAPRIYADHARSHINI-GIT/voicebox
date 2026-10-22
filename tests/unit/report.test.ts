// PDF report building + rendering and CSV generation, including the anonymity
// guarantees that must hold in generated files, not only in the interface.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReport, reportFileName, type ReportItem, type ReportRequest } from '../../src/lib/report/build.ts';
import { renderPdf, cleanText, layoutRuns, textWidth } from '../../src/lib/report/pdf.ts';
import { cleanReportRequest } from '../../src/lib/report/validate.ts';
import { FEEDBACK_HEADERS, PULSE_HEADERS, feedbackCsv, pulseCsv, toCsv, type CsvFeedbackRow } from '../../src/lib/report/csv.ts';
import { generateReport } from '../../src/lib/report/index.ts';

function makeItem(over: Partial<ReportItem> = {}): ReportItem {
	return {
		title: 'Standing desks for the studio floor',
		category: 'Facilities',
		type: 'Suggestion',
		status: 'In progress',
		priority: 'Medium',
		sentiment: 'Neutral',
		department: 'Design',
		submitter: 'Asha Ramanathan',
		submittedAt: '2026-10-01',
		dueAt: '2026-10-20',
		overdue: false,
		upvotes: 14,
		...over
	};
}

function makeRequest(over: Partial<ReportRequest> = {}): ReportRequest {
	return {
		format: 'pdf',
		companyName: 'Northwind Studio',
		periodLabel: '30 days',
		generatedAt: '2026-10-22T09:00:00.000Z',
		scopeLabel: 'All departments (Admin/HR)',
		preparedBy: 'Priya Varghese (Admin/HR)',
		includesConfidential: false,
		kpis: { total: 44, open: 20, resolvedThisMonth: 6, avgFirstResponseHours: 18.4, avgResolutionHours: 96, overdue: 5, enps: 22, enpsResponses: 280 },
		categories: [
			{ label: 'Facilities', value: 11 },
			{ label: 'Tools & Process', value: 9 }
		],
		statuses: [
			{ label: 'New', value: 8 },
			{ label: 'Resolved', value: 12 }
		],
		topIssues: [makeItem({ overdue: true, priority: 'Critical', dueAt: '2026-10-10' })],
		resolved: [makeItem({ status: 'Resolved', resolvedAt: '2026-10-15', response: 'Two adjustable desks are on order.' })],
		pulse: {
			responses: 280,
			thresholdMet: true,
			thresholdMessage: 'Not enough responses to protect anonymity',
			enps: 22,
			scores: [
				{ text: 'My workload this week was manageable.', average: 3.8 },
				{ text: 'I felt recognised for my work this week.', average: 3.5 }
			],
			departments: [
				{ department: 'Design', responses: 56, shown: true, average: 3.7, enps: 25 },
				{ department: 'Operations', responses: 3, shown: false, average: null, enps: null }
			]
		},
		themes: [{ label: 'facilities', count: 11 }],
		...over
	};
}

// ---------------------------------------------------------------------------
// File naming
// ---------------------------------------------------------------------------

test('file name: VoiceBox_Report_YYYY-MM', () => {
	assert.equal(reportFileName('2026-10-22T09:00:00.000Z'), 'VoiceBox_Report_2026-10');
	assert.equal(generateReport(makeRequest()).fileName, 'VoiceBox_Report_2026-10.pdf');
	assert.match(reportFileName('nonsense'), /^VoiceBox_Report_\d{4}-\d{2}$/, 'a bad date falls back to the current month');
});

// ---------------------------------------------------------------------------
// Report document structure
// ---------------------------------------------------------------------------

test('report: contains every required section', () => {
	const doc = buildReport(makeRequest());
	const headings = doc.blocks.filter((b) => b.t === 'heading').map((b) => (b as { text: string }).text);
	for (const expected of ['Key figures', 'Top categories', 'Status breakdown', 'Top issues needing attention', 'Resolved in this period', 'Pulse survey results', 'Top themes']) {
		assert.ok(headings.includes(expected), `missing section: ${expected}`);
	}
	assert.equal(doc.blocks[0].t, 'title');
});

test('report: KPI table lists the required measures', () => {
	const doc = buildReport(makeRequest());
	const table = doc.blocks.find((b) => b.t === 'table' && (b as { headers: string[] }).headers[0] === 'Measure') as { rows: unknown[][] };
	const labels = table.rows.map((r) => String(r[0]));
	for (const m of ['Total feedback in period', 'Open items', 'Resolved this month', 'Average time to first response', 'Average time to resolution', 'Overdue items']) {
		assert.ok(labels.some((l) => l === m), `missing KPI: ${m}`);
	}
	assert.ok(labels.some((l) => l.includes('eNPS')));
});

test('report: pulse below the threshold reports the protective message instead of numbers', () => {
	const doc = buildReport(makeRequest({ pulse: { ...makeRequest().pulse, thresholdMet: false, responses: 3 } }));
	const text = JSON.stringify(doc.blocks);
	assert.ok(text.includes('Not enough responses to protect anonymity'));
	assert.equal(text.includes('"text":"eNPS: "'), false, 'no eNPS figure is printed below the threshold');
});

test('report: a department below the threshold is masked in the department table', () => {
	const doc = buildReport(makeRequest());
	const text = JSON.stringify(doc.blocks);
	assert.ok(text.includes('Operations'));
	assert.ok(text.includes('Not enough responses to protect anonymity'));
});

test('report: the confidential state is stated explicitly', () => {
	const excluded = JSON.stringify(buildReport(makeRequest({ includesConfidential: false })).blocks);
	assert.ok(excluded.includes('Confidential reports are excluded.'));
	const included = JSON.stringify(buildReport(makeRequest({ includesConfidential: true })).blocks);
	assert.ok(included.includes('INCLUDED'));
});

test('report: anonymous submitters appear as Anonymous and nothing else', () => {
	const doc = buildReport(
		makeRequest({
			topIssues: [makeItem({ submitter: 'Anonymous', title: 'Meeting load leaves no deep work time' })],
			resolved: [makeItem({ submitter: 'Anonymous', status: 'Resolved', resolvedAt: '2026-10-12', response: 'We added a no-meeting block.' })]
		})
	);
	const text = JSON.stringify(doc.blocks);
	assert.ok(text.includes('Anonymous'));
	assert.equal(text.includes('Asha Ramanathan'), false, 'no author name leaks into an anonymous row');
	assert.ok(text.includes('No author name, email or account id is stored for them'), 'the anonymity note is present');
});

test('report: empty data produces a valid document with honest wording', () => {
	const doc = buildReport(
		makeRequest({
			kpis: { total: 0, open: 0, resolvedThisMonth: 0, avgFirstResponseHours: null, avgResolutionHours: null, overdue: 0, enps: null, enpsResponses: 0 },
			categories: [],
			statuses: [],
			topIssues: [],
			resolved: [],
			themes: []
		})
	);
	const text = JSON.stringify(doc.blocks);
	assert.ok(text.includes('No feedback was submitted in this period.'));
	assert.ok(text.includes('No feedback was resolved in this period.'));
});

// ---------------------------------------------------------------------------
// PDF rendering
// ---------------------------------------------------------------------------

test('pdf: renders a structurally valid PDF', () => {
	const { bytes } = generateReport(makeRequest());
	const s = Buffer.from(bytes).toString('latin1');
	assert.ok(s.startsWith('%PDF-1.4'), 'has a PDF header');
	assert.ok(s.trimEnd().endsWith('%%EOF'), 'has an EOF marker');
	const xref = Number(/startxref\n(\d+)/.exec(s)?.[1] ?? -1);
	assert.ok(xref > 0);
	assert.equal(s.slice(xref, xref + 4), 'xref', 'the xref offset points at the xref table');
	assert.ok(s.includes('/Type /Catalog'));
	assert.ok(s.includes('/BaseFont /Helvetica'));
	assert.ok(bytes.length > 3000, `expected a real document, got ${bytes.length} bytes`);
});

test('pdf: metadata names VoiceBox, not another app', () => {
	const s = Buffer.from(generateReport(makeRequest()).bytes).toString('latin1');
	assert.ok(s.includes('/Creator (VoiceBox)'));
	assert.ok(s.includes('/Producer (VoiceBox)'));
	assert.equal(s.includes('Designer Testing Hub'), false);
});

test('pdf: long content paginates and every page is numbered', () => {
	const many = Array.from({ length: 60 }, (_, i) =>
		makeItem({ title: `Issue ${i}: a fairly long title that will wrap across the available column width in the table`, submitter: i % 2 ? 'Anonymous' : 'Lena Fischer' })
	);
	const s = Buffer.from(generateReport(makeRequest({ topIssues: many, resolved: many })).bytes).toString('latin1');
	const pageCount = (s.match(/\/Type \/Page[^s]/g) ?? []).length;
	assert.ok(pageCount > 1, `expected multiple pages, got ${pageCount}`);
	assert.ok(s.includes('Page 1 of'));
});

test('pdf: anonymous rows never contain an author name in the bytes', () => {
	const s = Buffer.from(
		generateReport(
			makeRequest({
				topIssues: [makeItem({ submitter: 'Anonymous' })],
				resolved: [makeItem({ submitter: 'Anonymous', status: 'Resolved', resolvedAt: '2026-10-12' })]
			})
		).bytes
	).toString('latin1');
	assert.equal(s.includes('Asha Ramanathan'), false);
	assert.ok(s.includes('Anonymous'));
});

test('pdf: text cleaning maps unsupported characters instead of corrupting them', () => {
	assert.equal(cleanText('caf\u00e9 \u2013 ok'), 'caf\u00e9 \u2013 ok');
	assert.equal(cleanText('arrow \u2192 here'), 'arrow -> here');
	assert.equal(cleanText('emoji \u{1F600} gone'), 'emoji  gone');
	assert.equal(cleanText('tab\there'), 'tab    here');
});

test('pdf: word wrap respects the width and never loses words', () => {
	const text = 'The quick brown fox jumps over the lazy dog again and again until the line must wrap at least twice.';
	const lines = layoutRuns([{ text }], 10, 200);
	assert.ok(lines.length > 1);
	for (const line of lines) assert.ok(line.w <= 200.5, `line too wide: ${line.w}`);
	const joined = lines.map((l) => l.frags.map((f) => f.text).join('')).join(' ');
	for (const word of ['quick', 'brown', 'twice.']) assert.ok(joined.includes(word), `lost word: ${word}`);
});

test('pdf: text width uses real font metrics', () => {
	assert.ok(textWidth('iiii', 'R', 10) < textWidth('WWWW', 'R', 10), 'proportional metrics');
	assert.ok(textWidth('Hello', 'B', 10) > textWidth('Hello', 'R', 10), 'bold is wider');
});

// ---------------------------------------------------------------------------
// Request validation (the server does not trust the browser)
// ---------------------------------------------------------------------------

test('validate: rejects non-objects and unknown formats', () => {
	assert.equal(typeof cleanReportRequest(null), 'string');
	assert.equal(typeof cleanReportRequest('nope'), 'string');
	assert.equal(typeof cleanReportRequest({ format: 'docx' }), 'string');
});

test('validate: coerces missing fields to safe defaults', () => {
	const req = cleanReportRequest({});
	assert.notEqual(typeof req, 'string');
	const r = req as ReportRequest;
	assert.equal(r.format, 'pdf');
	assert.equal(r.kpis.total, 0);
	assert.equal(r.kpis.avgResolutionHours, null);
	assert.deepEqual(r.topIssues, []);
	assert.equal(r.includesConfidential, false);
	// It must still render.
	assert.ok(generateReport(r).bytes.length > 1000);
});

test('validate: a missing submitter becomes Anonymous, never a leak', () => {
	const r = cleanReportRequest({ topIssues: [{ title: 'x' }, { title: 'y', submitter: 123 }] }) as ReportRequest;
	assert.equal(r.topIssues[0].submitter, 'Anonymous');
	assert.equal(r.topIssues[1].submitter, 'Anonymous');
});

test('validate: oversized arrays are clamped', () => {
	const r = cleanReportRequest({ topIssues: Array.from({ length: 1000 }, () => ({ title: 't' })) }) as ReportRequest;
	assert.equal(r.topIssues.length, 200);
});

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvRow(over: Partial<CsvFeedbackRow> = {}): CsvFeedbackRow {
	return {
		id: 'fb-1',
		title: 'Standing desks',
		description: 'A description',
		type: 'Suggestion',
		category: 'Facilities',
		department: 'Design',
		submitter: 'Asha Ramanathan',
		anonymous: false,
		urgency: 'Medium',
		sentiment: 'Neutral',
		sentimentOverridden: false,
		status: 'New',
		priority: 'Medium',
		owner: 'Marcus Webb',
		tags: 'workspace; ergonomics',
		isPublic: true,
		upvotes: 14,
		submittedAt: '2026-10-01 09:00',
		dueAt: '2026-10-20',
		overdue: false,
		firstResponseAt: '',
		resolvedAt: '',
		responses: '',
		declineReason: '',
		...over
	};
}

test('csv: escaping follows RFC 4180 and starts with a BOM', () => {
	const csv = toCsv(['A', 'B'], [['plain', 'has, comma'], ['has "quotes"', 'line\nbreak']]);
	assert.ok(csv.startsWith('\ufeff'), 'BOM so Excel reads UTF-8');
	assert.ok(csv.includes('"has, comma"'));
	assert.ok(csv.includes('"has ""quotes"""'));
	assert.ok(csv.includes('"line\nbreak"'));
	assert.ok(csv.includes('\r\n'), 'CRLF line endings');
});

test('csv: feedback export has the documented headers', () => {
	const csv = feedbackCsv([csvRow()]);
	const header = csv.replace('\ufeff', '').split('\r\n')[0];
	assert.equal(header, FEEDBACK_HEADERS.join(','));
	assert.ok(csv.includes('Asha Ramanathan'));
});

test('csv: an anonymous row never carries a submitter name, even if one is passed', () => {
	// Defence in depth: the UI strips it, and feedbackCsv strips it again.
	const csv = feedbackCsv([csvRow({ anonymous: true, submitter: 'Leaked Name' })]);
	assert.equal(csv.includes('Leaked Name'), false, 'the author name must never reach the file');
	assert.ok(csv.includes('Anonymous'));
	const row = csv.replace('\ufeff', '').split('\r\n')[1].split(',');
	assert.equal(row[6], 'Anonymous');
	assert.equal(row[7], 'Yes', 'the Anonymous column says Yes');
});

test('csv: pulse export masks groups below the anonymity threshold', () => {
	const csv = pulseCsv([
		{ week: '2026-W42', department: 'Design', responses: 8, average: 3.8, enps: 25, note: '' },
		{ week: '2026-W42', department: 'Operations', responses: 3, average: null, enps: null, note: 'Not enough responses to protect anonymity' }
	]);
	const header = csv.replace('\ufeff', '').split('\r\n')[0];
	assert.equal(header, PULSE_HEADERS.join(','));
	assert.ok(csv.includes('Not enough responses to protect anonymity'));
	const opsLine = csv.split('\r\n').find((l) => l.includes('Operations'))!;
	assert.match(opsLine, /,,/, 'the average and eNPS cells are empty for a protected group');
});

test('csv: an empty export still produces a header row', () => {
	const csv = feedbackCsv([]);
	assert.equal(csv.replace('\ufeff', '').trim(), FEEDBACK_HEADERS.join(','));
});
