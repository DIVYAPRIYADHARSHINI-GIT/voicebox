// Format-neutral report model. build.ts turns app data into a ReportDoc;
// pdf.ts and docx.ts render the same blocks, so PDF and DOCX always match.

export type Tone = 'muted' | 'accent' | 'high' | 'medium' | 'low';

export interface Run {
	text: string;
	bold?: boolean;
	italic?: boolean;
	/** Makes the run a clickable hyperlink. */
	link?: string;
	tone?: Tone;
}

export type Cell = string | Run[];

export type Block =
	| { t: 'title'; text: string; subtitle?: string }
	| { t: 'meta'; rows: Array<{ label: string; value: Run[] }> }
	| { t: 'heading'; text: string }
	/** Bold item heading; `keep` = points of room to keep with it (avoids orphaned headings). */
	| { t: 'item'; runs: Run[]; keep?: number }
	| { t: 'para'; runs: Run[]; indent?: boolean }
	| { t: 'table'; headers: string[]; widths: number[]; rows: Cell[][] }
	| { t: 'note'; text: string }
	| { t: 'gap' }
	| { t: 'pagebreak' };

export interface ReportDoc {
	title: string;
	author: string;
	/** File name without extension, e.g. "Designer_Feedback_PowerWise_DIVYA". */
	fileBase: string;
	/** Small footer text on every page. */
	footer: string;
	blocks: Block[];
}

export const cellRuns = (c: Cell): Run[] => (typeof c === 'string' ? [{ text: c }] : c);
