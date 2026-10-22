// Local-time helpers. Every "day"/"week" boundary in VoiceBox is the user's own
// local time zone, so a Monday in Chennai is the same bucket as a Monday shown
// in the UI. All stored timestamps are epoch milliseconds (UTC instants).

export const DAY_MS = 86_400_000;

export const now = () => Date.now();

/** Start of the local calendar day containing `t`. */
export function startOfDay(t: number): number {
	const d = new Date(t);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/** Start of the local ISO week (Monday 00:00) containing `t`. */
export function startOfWeek(t: number): number {
	const d = new Date(startOfDay(t));
	const dow = (d.getDay() + 6) % 7; // Monday = 0
	d.setDate(d.getDate() - dow);
	return d.getTime();
}

/** ISO-8601 week key in local time, e.g. "2026-W43". */
export function weekKey(t: number): string {
	// ISO week-numbering: the week containing the Thursday decides the year.
	const monday = new Date(startOfWeek(t));
	const thursday = new Date(monday.getTime() + 3 * DAY_MS);
	const year = thursday.getFullYear();
	const jan1 = new Date(year, 0, 1);
	const week = Math.floor((startOfWeek(thursday.getTime()) - startOfWeek(jan1.getTime())) / (7 * DAY_MS)) + 1;
	return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Sortable list of the N most recent week keys, oldest first. */
export function recentWeeks(count: number, from = Date.now()): string[] {
	const out: string[] = [];
	let t = startOfWeek(from);
	for (let i = 0; i < count; i++) {
		out.unshift(weekKey(t));
		t -= 7 * DAY_MS;
	}
	return out;
}

/** Local YYYY-MM-DD (used for date inputs and file names). */
export function isoDate(t: number): string {
	const d = new Date(t);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isoMonth(t: number): string {
	const d = new Date(t);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Parses a YYYY-MM-DD date input as local noon (avoids off-by-one from DST). */
export function parseDateInput(s: string): number | undefined {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
	if (!m) return undefined;
	const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0).getTime();
	return Number.isFinite(t) ? t : undefined;
}

export function formatDate(t: number | undefined): string {
	if (!t) return '-';
	return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function formatDateTime(t: number | undefined): string {
	if (!t) return '-';
	return new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** "3 days ago" / "in 2 days" style label. */
export function relative(t: number, ref = Date.now()): string {
	const diff = t - ref;
	const abs = Math.abs(diff);
	const mins = Math.round(abs / 60_000);
	if (mins < 1) return 'just now';
	const pick = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
	let label: string;
	if (mins < 60) label = pick(mins, 'minute');
	else if (abs < DAY_MS) label = pick(Math.round(abs / 3_600_000), 'hour');
	else if (abs < 30 * DAY_MS) label = pick(Math.round(abs / DAY_MS), 'day');
	else label = pick(Math.round(abs / (30 * DAY_MS)), 'month');
	return diff < 0 ? `${label} ago` : `in ${label}`;
}

/** Whole days between two instants, by local calendar day. */
export function daysBetween(a: number, b: number): number {
	return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

/** Hours, one decimal. */
export const hoursBetween = (a: number, b: number) => Math.round(((b - a) / 3_600_000) * 10) / 10;
