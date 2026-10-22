import { buildReport, type ReportRequest } from './build.ts';
import { renderPdf } from './pdf.ts';

export { buildReport, reportFileName } from './build.ts';
export type { ReportFormat, ReportItem, ReportKpis, ReportPulse, ReportRequest } from './build.ts';

export const MIME = { pdf: 'application/pdf' } as const;

/** Builds the report and renders it as PDF bytes. */
export function generateReport(req: ReportRequest): { bytes: Uint8Array; fileName: string; mime: string } {
	const doc = buildReport(req);
	return { bytes: renderPdf(doc), fileName: `${doc.fileBase}.pdf`, mime: MIME.pdf };
}
