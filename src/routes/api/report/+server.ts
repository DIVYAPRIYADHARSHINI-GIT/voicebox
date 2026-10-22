// POST /api/report -> the PDF summary report as a download.
// The browser holds all the data, so it posts the already scoped and
// anonymity-safe payload; this route only lays it out.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateReport } from '$lib/report/index.ts';
import { cleanReportRequest } from '$lib/report/validate.ts';

const MAX_BODY = 2_000_000;

export const POST: RequestHandler = async ({ request }) => {
	const text = await request.text();
	if (text.length > MAX_BODY) return json({ error: 'Request is too large (max 2 MB).' }, { status: 413 });
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return json({ error: 'Request body must be valid JSON.' }, { status: 400 });
	}
	const req = cleanReportRequest(body);
	if (typeof req === 'string') return json({ error: req }, { status: 400 });
	try {
		const out = generateReport(req);
		return new Response(out.bytes as BodyInit, {
			headers: {
				'content-type': out.mime,
				'content-disposition': `attachment; filename="${out.fileName}"; filename*=UTF-8''${encodeURIComponent(out.fileName)}`,
				'content-length': String(out.bytes.length),
				'cache-control': 'no-store'
			}
		});
	} catch (e) {
		console.error('VoiceBox: report generation failed', e);
		return json({ error: 'Could not generate the report.' }, { status: 500 });
	}
};
