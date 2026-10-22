// Dependency-free A4 PDF writer: Helvetica core fonts with real AFM widths
// (accurate word wrap), wrapped tables with repeated headers, page breaks, page
// numbers and clickable /URI link annotations. No PDF library, so it runs on a
// free Vercel serverless function with no extra dependencies.
// Clean, professional layout with no decorative styling.
import type { Block, ReportDoc, Run, Tone } from './doc.ts';
import { cellRuns } from './doc.ts';

const W = 595.28;
const H = 841.89;
const ML = 56;
const MR = 56;
const MT = 58;
const MB = 66;
const CW = W - ML - MR;

type RGB = readonly [number, number, number];
const INK: RGB = [0.1, 0.11, 0.14];
const MUTED: RGB = [0.4, 0.43, 0.48];
const ACCENT: RGB = [0.11, 0.22, 0.38];
const LINK: RGB = [0.06, 0.33, 0.78];
const RULE: RGB = [0.8, 0.82, 0.86];
const FILL: RGB = [0.94, 0.95, 0.97];
const TONES: Record<Tone, RGB> = {
	muted: MUTED,
	accent: ACCENT,
	high: [0.76, 0.12, 0.14],
	medium: [0.7, 0.42, 0.0],
	low: [0.12, 0.48, 0.25]
};

type FontKey = 'R' | 'B' | 'I';
const FONT_ID: Record<FontKey, string> = { R: 'F1', B: 'F2', I: 'F3' };

// Helvetica / Helvetica-Bold advance widths for ASCII 32..126 (Adobe AFM).
const n556 = (n: number) => Array<number>(n).fill(556);
const WR = [
	278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, ...n556(10), 278, 278, 584, 584, 584, 556, 1015,
	667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
	278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278,
	556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];
const WB = [
	278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, ...n556(10), 333, 333, 584, 584, 584, 611, 975,
	722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
	333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333,
	611, 556, 778, 556, 556, 500, 389, 280, 389, 584
];
// WinAnsi extras: [code, regular width, bold width]
const SPECIAL: Record<string, [number, number, number]> = {
	'\u2022': [0x95, 350, 350],
	'\u2013': [0x96, 556, 556],
	'\u2014': [0x97, 1000, 1000],
	'\u2018': [0x91, 222, 278],
	'\u2019': [0x92, 222, 278],
	'\u201C': [0x93, 333, 500],
	'\u201D': [0x94, 333, 500],
	'\u2026': [0x85, 1000, 1000],
	'\u20AC': [0x80, 556, 556],
	'\u2122': [0x99, 1000, 1000]
};
const REPLACE: Record<string, string> = {
	'\u20B9': 'Rs ',
	'\u2192': '->',
	'\u2190': '<-',
	'\u2194': '<->',
	'\u21D2': '=>',
	'\u2713': '(ok)',
	'\u2714': '(ok)',
	'\u2705': '(ok)',
	'\u2717': 'x',
	'\u274C': 'x',
	'\u2264': '<=',
	'\u2265': '>=',
	'\u2260': '!=',
	'\u2248': '~',
	'\u00A0': ' ',
	'\u2009': ' ',
	'\u200B': '',
	'\u00AD': '',
	'\u2212': '-',
	'\u2011': '-',
	'\u2010': '-',
	'\u2032': "'",
	'\u2033': '"'
};

/** Keeps text the core fonts can draw; maps or drops the rest (emoji, CJK...). */
export function cleanText(s: string): string {
	let out = '';
	for (const ch of (s ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ')) {
		const c = ch.codePointAt(0)!;
		const rep = REPLACE[ch];
		if (rep !== undefined) out += rep;
		else if (ch === '\n' || (c >= 32 && c < 127) || SPECIAL[ch] || (c > 0xa0 && c <= 0xff)) out += ch;
		else {
			const base = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
			if (base !== ch && /^[\x20-\x7e]+$/.test(base)) out += base;
		}
	}
	return out;
}

function charW(ch: string, font: FontKey): number {
	const c = ch.charCodeAt(0);
	if (c >= 32 && c < 127) return (font === 'B' ? WB : WR)[c - 32];
	const sp = SPECIAL[ch];
	if (sp) return font === 'B' ? sp[2] : sp[1];
	return 556;
}

export function textWidth(s: string, font: FontKey, size: number): number {
	let w = 0;
	for (const ch of s) w += charW(ch, font);
	return (w / 1000) * size;
}

function esc(s: string): string {
	let out = '';
	for (const ch of s) {
		const c = ch.charCodeAt(0);
		if (ch === '\\' || ch === '(' || ch === ')') out += '\\' + ch;
		else if (c >= 32 && c < 127) out += ch;
		else {
			const code = SPECIAL[ch]?.[0] ?? (c <= 0xff ? c : 63);
			out += '\\' + code.toString(8).padStart(3, '0');
		}
	}
	return out;
}

function escUri(uri: string): string {
	let u = uri.trim();
	try {
		u = encodeURI(decodeURI(u));
	} catch {
		u = encodeURI(u);
	}
	return u.replace(/[^\x21-\x7e]/g, '').replace(/[\\()]/g, (m) => '\\' + m);
}

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();
const rgb = (c: RGB) => c.map((x) => f2(x)).join(' ');

interface Frag {
	text: string;
	font: FontKey;
	color: RGB;
	link?: string;
	w: number;
	x: number;
}
interface Line {
	frags: Frag[];
	w: number;
}

function style(run: Run, base: FontKey): { font: FontKey; color: RGB } {
	const font: FontKey = run.bold ? 'B' : run.italic ? 'I' : base;
	const color = run.link ? LINK : run.tone ? TONES[run.tone] : INK;
	return { font, color };
}

/** Greedy word wrap of styled runs; very long words (URLs) are split by character. */
export function layoutRuns(runs: Run[], size: number, maxW: number, base: FontKey = 'R'): Line[] {
	const lines: Line[] = [];
	let cur: Line = { frags: [], w: 0 };
	const push = () => {
		const last = cur.frags[cur.frags.length - 1];
		if (last && last.text.endsWith(' ')) {
			const t = last.text.replace(/ +$/, '');
			cur.w -= last.w - textWidth(t, last.font, size);
			last.w = textWidth(t, last.font, size);
			last.text = t;
		}
		lines.push(cur);
		cur = { frags: [], w: 0 };
	};
	const add = (text: string, font: FontKey, color: RGB, link?: string) => {
		const w = textWidth(text, font, size);
		const last = cur.frags[cur.frags.length - 1];
		if (last && last.font === font && last.color === color && last.link === link) {
			last.text += text;
			last.w += w;
		} else cur.frags.push({ text, font, color, link, w, x: cur.w });
		cur.w += w;
	};
	for (const run of runs) {
		const { font, color } = style(run, base);
		const parts = cleanText(run.text).split('\n');
		parts.forEach((part, pi) => {
			if (pi > 0) push();
			for (const tok of part.split(/( +)/)) {
				if (!tok) continue;
				if (tok[0] === ' ') {
					if (cur.frags.length) add(' ', font, color, run.link);
					continue;
				}
				const w = textWidth(tok, font, size);
				if (cur.w + w <= maxW) {
					add(tok, font, color, run.link);
					continue;
				}
				if (cur.frags.length && w <= maxW) {
					push();
					add(tok, font, color, run.link);
					continue;
				}
				let rest = tok;
				while (rest) {
					const room = maxW - cur.w;
					let n = rest.length;
					while (n > 1 && textWidth(rest.slice(0, n), font, size) > room) n--;
					// Prefer breaking a long URL after a separator (/ - . ? & = _) instead of mid-word.
					if (n < rest.length) {
						let sep = -1;
						for (let k = n - 1; k > n * 0.35; k--) {
							if ('/-.?&=_'.includes(rest[k])) {
								sep = k;
								break;
							}
						}
						if (sep > 0) n = sep + 1;
					}
					if (textWidth(rest.slice(0, n), font, size) > room && cur.frags.length) {
						push();
						continue;
					}
					add(rest.slice(0, n), font, color, run.link);
					rest = rest.slice(n);
					if (rest) push();
				}
			}
		});
	}
	if (cur.frags.length || !lines.length) push();
	return lines;
}

class Pg {
	ops: string[] = [];
	annots: Array<{ x: number; y: number; w: number; h: number; uri: string }> = [];
}

class Writer {
	pages: Pg[] = [];
	pg!: Pg;
	y = MT;
	constructor() {
		this.newPage();
	}
	newPage() {
		this.pg = new Pg();
		this.pages.push(this.pg);
		this.y = MT;
	}
	room(h: number) {
		if (this.y + h > H - MB) this.newPage();
	}
	text(s: string, x: number, baseline: number, size: number, font: FontKey, color: RGB) {
		if (!s) return;
		this.pg.ops.push(`BT /${FONT_ID[font]} ${f2(size)} Tf ${rgb(color)} rg ${f2(x)} ${f2(H - baseline)} Td (${esc(s)}) Tj ET`);
	}
	fill(x: number, y: number, w: number, h: number, color: RGB) {
		this.pg.ops.push(`${rgb(color)} rg ${f2(x)} ${f2(H - y - h)} ${f2(w)} ${f2(h)} re f`);
	}
	stroke(x: number, y: number, w: number, h: number, color: RGB, lw = 0.6) {
		this.pg.ops.push(`${rgb(color)} RG ${f2(lw)} w ${f2(x)} ${f2(H - y - h)} ${f2(w)} ${f2(h)} re S`);
	}
	hline(x1: number, x2: number, y: number, color: RGB, lw = 0.6) {
		this.pg.ops.push(`${rgb(color)} RG ${f2(lw)} w ${f2(x1)} ${f2(H - y)} m ${f2(x2)} ${f2(H - y)} l S`);
	}
	drawLine(line: Line, x: number, baseline: number, size: number) {
		for (const f of line.frags) {
			this.text(f.text, x + f.x, baseline, size, f.font, f.color);
			if (f.link && f.text.trim()) {
				this.hline(x + f.x, x + f.x + f.w, baseline + 1.6, LINK, 0.5);
				this.pg.annots.push({ x: x + f.x, y: baseline - size * 0.82, w: f.w, h: size * 1.15, uri: f.link });
			}
		}
	}
	/** Flowing paragraph with automatic page breaks. */
	para(runs: Run[], size: number, lh: number, x = ML, w = CW, base: FontKey = 'R') {
		for (const line of layoutRuns(runs, size, w, base)) {
			this.room(lh);
			this.drawLine(line, x, this.y + (lh + size * 0.7) / 2, size);
			this.y += lh;
		}
	}
}

function renderBlock(wr: Writer, b: Block) {
	switch (b.t) {
		case 'title': {
			wr.room(80);
			wr.para([{ text: b.text, bold: true }], 22, 28);
			if (b.subtitle) {
				wr.y += 2;
				wr.para([{ text: b.subtitle, tone: 'muted' }], 10, 14);
			}
			wr.y += 8;
			wr.fill(ML, wr.y, CW, 2, ACCENT);
			wr.y += 16;
			break;
		}
		case 'meta': {
			const LW = 104;
			for (const r of b.rows) {
				const lines = layoutRuns(r.value.length ? r.value : [{ text: '-', tone: 'muted' }], 10.5, CW - LW);
				wr.room(Math.min(lines.length, 3) * 15);
				const top = wr.y;
				wr.text(cleanText(r.label), ML, top + (15 + 10.5 * 0.7) / 2, 10.5, 'B', INK);
				for (const line of lines) {
					wr.room(15);
					wr.drawLine(line, ML + LW, wr.y + (15 + 10.5 * 0.7) / 2, 10.5);
					wr.y += 15;
				}
				wr.y += 2;
			}
			wr.y += 6;
			break;
		}
		case 'heading': {
			// Heading + table header + one typical row must fit, else start a new page.
			wr.room(140);
			wr.y += 12;
			wr.para([{ text: b.text, bold: true, tone: 'accent' }], 14, 20);
			wr.hline(ML, ML + CW, wr.y + 1, RULE, 0.8);
			wr.y += 10;
			break;
		}
		case 'item': {
			wr.room(b.keep ?? 56);
			wr.y += 6;
			wr.para(b.runs, 11.5, 16, ML, CW, 'B');
			wr.y += 1;
			break;
		}
		case 'para': {
			const ind = b.indent ? 14 : 0;
			wr.para(b.runs, 10, 14, ML + ind, CW - ind);
			wr.y += 3;
			break;
		}
		case 'note': {
			wr.para([{ text: b.text, italic: true, tone: 'muted' }], 9.5, 13);
			wr.y += 4;
			break;
		}
		case 'gap':
			wr.y += 8;
			break;
		case 'pagebreak':
			if (wr.y > MT) wr.newPage();
			break;
		case 'table':
			renderTable(wr, b);
			break;
	}
}

function renderTable(wr: Writer, b: Extract<Block, { t: 'table' }>) {
	const total = b.widths.reduce((s, x) => s + x, 0) || 1;
	const cols = b.widths.map((x) => (x / total) * CW);
	const PAD = 5;
	const SIZE = 9.5;
	const LH = 13;
	const headLines = b.headers.map((h, i) => layoutRuns([{ text: h, bold: true }], 9, cols[i] - 2 * PAD));
	const headH = Math.max(...headLines.map((l) => l.length)) * 12 + 2 * PAD;
	const maxRowLines = Math.floor((H - MB - MT - headH - 2 * PAD) / LH);
	const drawHeader = () => {
		let x = ML;
		wr.fill(ML, wr.y, CW, headH, FILL);
		headLines.forEach((lines, i) => {
			wr.stroke(x, wr.y, cols[i], headH, RULE);
			lines.forEach((ln, j) => wr.drawLine(ln, x + PAD, wr.y + PAD + j * 12 + 9, 9));
			x += cols[i];
		});
		wr.y += headH;
	};
	const laid = b.rows.map((row) => {
		const cells = cols.map((w, i) => {
			const lines = layoutRuns(cellRuns(row[i] ?? ''), SIZE, w - 2 * PAD);
			if (lines.length > maxRowLines) {
				const cut = lines.slice(0, maxRowLines);
				cut[cut.length - 1].frags.push({ text: ' ...', font: 'R', color: MUTED, w: 0, x: cut[cut.length - 1].w });
				return cut;
			}
			return lines;
		});
		return { cells, rowH: Math.max(...cells.map((l) => l.length)) * LH + 2 * PAD };
	});
	// Keep the header with at least the first row (no orphaned header at a page bottom).
	wr.room(headH + (laid[0]?.rowH ?? LH + 2 * PAD));
	drawHeader();
	for (const { cells, rowH } of laid) {
		if (wr.y + rowH > H - MB) {
			wr.newPage();
			drawHeader();
		}
		let x = ML;
		cells.forEach((lines, i) => {
			wr.stroke(x, wr.y, cols[i], rowH, RULE);
			lines.forEach((ln, j) => wr.drawLine(ln, x + PAD, wr.y + PAD + j * LH + (LH + SIZE * 0.7) / 2, SIZE));
			x += cols[i];
		});
		wr.y += rowH;
	}
	wr.y += 10;
}

function pdfDate(d: Date) {
	const p = (n: number) => String(n).padStart(2, '0');
	return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

export function renderPdf(doc: ReportDoc, now = new Date()): Uint8Array {
	const wr = new Writer();
	for (const b of doc.blocks) renderBlock(wr, b);

	const n = wr.pages.length;
	wr.pages.forEach((pg, i) => {
		wr.pg = pg;
		wr.hline(ML, ML + CW, H - 46, RULE, 0.6);
		wr.text(cleanText(doc.footer), ML, H - 32, 8, 'R', MUTED);
		const label = `Page ${i + 1} of ${n}`;
		wr.text(label, ML + CW - textWidth(label, 'R', 8), H - 32, 8, 'R', MUTED);
	});

	const objs: string[] = ['', ''];
	const add = (s: string) => objs.push(s);
	add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
	add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
	add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
	const info = add(
		`<< /Title (${esc(cleanText(doc.title))}) /Author (${esc(cleanText(doc.author))}) /Subject (Office feedback report) /Creator (VoiceBox) /Producer (VoiceBox) /CreationDate (${pdfDate(now)}) >>`
	);
	const pageIds: number[] = [];
	for (const pg of wr.pages) {
		const content = pg.ops.join('\n');
		const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
		const annotIds = pg.annots.map((a) =>
			add(
				`<< /Type /Annot /Subtype /Link /Rect [${f2(a.x)} ${f2(H - a.y - a.h)} ${f2(a.x + a.w)} ${f2(H - a.y)}] /Border [0 0 0] /F 4 /A << /Type /Action /S /URI /URI (${escUri(a.uri)}) >> >>`
			)
		);
		pageIds.push(
			add(
				`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R${annotIds.length ? ` /Annots [${annotIds.map((id) => `${id} 0 R`).join(' ')}]` : ''} >>`
			)
		);
	}
	objs[0] = '<< /Type /Catalog /Pages 2 0 R /Lang (en) /ViewerPreferences << /DisplayDocTitle true >> >>';
	objs[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

	let out = '%PDF-1.4\n';
	const offsets: number[] = [];
	objs.forEach((o, i) => {
		offsets.push(out.length);
		out += `${i + 1} 0 obj\n${o}\nendobj\n`;
	});
	const xref = out.length;
	out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
	out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return new TextEncoder().encode(out); // ASCII only (octal escapes), so length == bytes
}
