// POST /api/csv -> CSV export of feedback or pulse results.
// The anonymity and confidential rules are applied in the browser AND here:
// an anonymous row can never carry a submitter name in the output file.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { feedbackCsv, pulseCsv, type CsvFeedbackRow, type CsvPulseRow } from '$lib/report/csv.ts';

const MAX_BODY = 4_000_000;

interface Body {
	kind?: 'feedback' | 'pulse';
	fileName?: string;
	rows?: unknown;
}

export const POST: RequestHandler = async ({ request }) => {
	const text = await request.text();
	if (text.length > MAX_BODY) return json({ error: 'Request is too large (max 4 MB).' }, { status: 413 });
	let body: Body;
	try {
		body = JSON.parse(text) as Body;
	} catch {
		return json({ error: 'Request body must be valid JSON.' }, { status: 400 });
	}
	const kind = body.kind === 'pulse' ? 'pulse' : 'feedback';
	const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
	const fileName = (body.fileName ?? `VoiceBox_${kind}.csv`).replace(/[^A-Za-z0-9._-]/g, '_');

	try {
		const csv = kind === 'pulse' ? pulseCsv(rows as CsvPulseRow[]) : feedbackCsv(rows as CsvFeedbackRow[]);
		return new Response(csv, {
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': `attachment; filename="${fileName}"`,
				'cache-control': 'no-store'
			}
		});
	} catch (e) {
		console.error('VoiceBox: CSV export failed', e);
		return json({ error: 'Could not generate the CSV.' }, { status: 500 });
	}
};
