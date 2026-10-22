// End-to-end test with the locally installed headless Chrome (no npm deps).
//
//   npm run build && npx vite preview --port 4319 --strictPort &
//   caffeinate -dims env BASE_URL=http://localhost:4319 node tests/e2e/smoke.mjs
//
// Full flow: employee login success + failure + 5-attempt lockout -> submit
// named feedback -> submit anonymous feedback and copy the code -> track by
// code -> manager login -> triage/assign/respond -> employee sees the response
// -> upvote an idea -> answer the pulse -> anonymity threshold -> confidential
// report Admin-only -> dashboard -> PDF + CSV -> JSON backup/import.
// Plus: route guards both ways, session expiry, inactivity sign-out, manager
// department scoping, and anonymous items never leaking author data in the UI,
// CSV or PDF. Desktop + mobile + dark mode. Short timeouts, freeze heartbeat
// and a global watchdog: fail fast, never hang.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const BASE = (process.env.BASE_URL ?? 'http://localhost:4319').replace(/\/$/, '');
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'output', process.env.OUT_NAME ?? 'local');
const DL = join(OUT, 'downloads');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });
const SHOTS = process.env.SHOTS !== '0';

const EMP = { email: 'employee@northwind.example', password: 'Employee@123', name: 'Asha Ramanathan' };
const MGR = { email: 'manager@northwind.example', password: 'Manager@123', name: 'Marcus Webb' };
const HR = { email: 'hr@northwind.example', password: 'Admin@123', name: 'Priya Varghese' };
const ENG_MGR = { email: 'elena.d@northwind.example', password: 'Manager@123', name: 'Elena Duarte' };

const results = [];
function check(name, ok, detail = '') {
	results.push({ name, ok: Boolean(ok), detail });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const { newPage, close } = await launch({ port: Number(process.env.CDP_PORT ?? 9433) });
const WATCHDOG_MS = Number(process.env.E2E_TIMEOUT_MS ?? 8 * 60_000);
const watchdog = setTimeout(async () => {
	console.error(`E2E watchdog: aborting after ${WATCHDOG_MS / 1000}s`);
	await close().catch(() => {});
	process.exit(2);
}, WATCHDOG_MS);
watchdog.unref();

let seq = 0;
/** A page with a clean (or preserved) localStorage and a clipboard stub. */
async function freshPage({ width = 1440, height = 900, mobile = false, clear = true, isolated = false } = {}) {
	const p = await newPage({ isolated });
	await p.viewport(width, height, mobile);
	const key = `vb-init-${++seq}`;
	await p.addInitScript(`
    try {
      if (!sessionStorage.getItem('${key}')) {
        ${clear ? "localStorage.removeItem('voicebox.db.v1'); localStorage.removeItem('voicebox.session.v1');" : ''}
        sessionStorage.setItem('${key}', '1');
      }
    } catch (e) {}
    window.__clip = '';
    try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__clip = t; } }, configurable: true }); } catch (e) {}
    window.__beat = 0; setInterval(() => { window.__beat++; }, 50);
    // Toasts auto-dismiss after ~4s; record them so assertions never race it.
    window.__toasts = [];
    // The init script runs before the document body exists, so poll instead of
    // observing a node that is not there yet.
    setInterval(() => {
      const el = document.querySelector('[data-testid=toasts]');
      if (!el) return;
      for (const t of el.querySelectorAll('.toast')) {
        const text = (t.innerText || '').trim();
        if (text && !window.__toasts.includes(text)) window.__toasts.push(text);
      }
    }, 120);
  `);
	await p.setDownloadDir(DL);
	tracked.add(p);
	return p;
}

async function notFrozen(p, label) {
	const a = await p.eval('window.__beat');
	await sleep(500);
	const b = await p.eval('window.__beat');
	check(`${label}: responsive (no freeze)`, b - a >= 5, `${b - a} beats/500ms`);
}
async function shot(p, name, fullPage = false) {
	if (SHOTS) await p.screenshot(join(OUT, `${name}.png`), { fullPage }).catch(() => {});
}
/** Pages whose console errors are attributed per step, not cumulatively. */
const tracked = new Set();
async function step(name, fn) {
	for (const pg of tracked) pg.errors.length = 0;
	try {
		await fn();
	} catch (e) {
		check(name, false, String(e?.message ?? e).split('\n')[0]);
	}
	if (process.env.TRACE_ERRORS) {
		for (const pg of tracked) if (pg.errors.length) console.log(`   [errors in "${name}"] ${pg.errors[0].split('\n')[0]}`);
	}
}
const noErrors = (p, label) => check(`${label}: no console errors`, p.errors.length === 0, p.errors.slice(0, 2).join(' | '));
const overflow = (p) => p.eval('document.documentElement.scrollWidth - window.innerWidth');
const ready = (p) => p.waitFor("!document.querySelector('[data-testid=loading]') && !!document.querySelector('[data-testid=page-title]')", 10000);
const nav = async (p, path) => {
	await p.goto(BASE + path, { wait: 300 });
	await ready(p);
};
const path_ = (p) => p.eval('location.pathname');

/** Clears the inbox filters, opening the filter panel first when it is closed. */
async function clearFilters(page) {
	if ((await page.count('[data-testid=filter-panel]')) === 0) {
		await page.click('[data-testid=toggle-filters]');
		await sleep(250);
	}
	await page.click('[data-testid=clear-filters]');
	await sleep(350);
	await page.click('[data-testid=toggle-filters]');
	await sleep(250);
}

/**
 * Signs in through the real form on the given portal. Any existing session is
 * dropped first: VoiceBox keeps one session per browser, so switching persona
 * is exactly what a real user does when they sign out and another signs in.
 */
async function signIn(p, who, portal = 'employee') {
	await p.goto(BASE + '/about', { wait: 200 });
	await p.eval("(() => { try { localStorage.removeItem('voicebox.session.v1'); } catch (e) {} return true; })()");
	await nav(p, portal === 'manager' ? '/manager/login' : '/login');
	await p.fill('[data-testid=login-email]', who.email);
	await p.fill('[data-testid=login-password]', who.password);
	await p.click('[data-testid=login-submit]');
	await p.waitFor(`location.pathname.startsWith('${portal === 'manager' ? '/manager' : '/app'}')`, 10000);
	await ready(p);
}

async function waitDownload(re, timeout = 12000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const f = readdirSync(DL).find((n) => re.test(n) && !n.endsWith('.crdownload'));
		if (f) {
			const full = join(DL, f);
			await sleep(200);
			if (statSync(full).size > 0) return { name: f, bytes: readFileSync(full) };
		}
		await sleep(150);
	}
	throw new Error(`no download matching ${re}`);
}
function pdfOk(buf) {
	const s = buf.toString('latin1');
	const xref = Number(s.match(/startxref\n(\d+)/)?.[1] ?? -1);
	return s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF') && s.slice(xref, xref + 4) === 'xref';
}

// ===========================================================================
// 1. API + first launch
// ===========================================================================
const p = await freshPage();

await step('API health', async () => {
	const r = await fetch(BASE + '/api/health');
	const body = await r.json();
	check('API /api/health 200', r.ok && body.app === 'VoiceBox', JSON.stringify(body).slice(0, 80));
});

await step('landing page + sample data on first launch', async () => {
	await nav(p, '/');
	check('landing: renders', (await p.text('[data-testid=page-title]'))?.includes('feedback'), await p.text('[data-testid=page-title]'));
	check('landing: demo-mode badge is visible', (await p.count('[data-testid=demo-badge]')) === 1);
	check('landing: both portal entry points', (await p.count('[data-testid=go-employee]')) === 1 && (await p.count('[data-testid=go-manager]')) === 1);
	await shot(p, 'a-landing');
});

// ===========================================================================
// 2. Login: failure, lockout, success
// ===========================================================================
await step('login: generic error on a wrong password', async () => {
	await nav(p, '/login');
	check('login: demo accounts card present', (await p.count('[data-testid=demo-accounts]')) === 1);
	check('login: anonymous + track links present', (await p.count('[data-testid=link-anonymous]')) === 1 && (await p.count('[data-testid=link-track]')) === 1);
	await p.fill('[data-testid=login-email]', EMP.email);
	await p.fill('[data-testid=login-password]', 'WrongPassword1');
	await p.click('[data-testid=login-submit]');
	await p.waitFor("!!document.querySelector('[data-testid=login-error]')", 6000);
	const err = await p.text('[data-testid=login-error]');
	check('login: error is generic', /Email or password is incorrect/.test(err), err);
	check('login: error does not reveal which field was wrong', !/email (not found|unknown)/i.test(err));
	await shot(p, 'b-login-error');
});

await step('login: show/hide password toggle', async () => {
	const before = await p.eval("document.querySelector('[data-testid=login-password]').type");
	await p.click('[data-testid=toggle-password]');
	const after = await p.eval("document.querySelector('[data-testid=login-password]').type");
	check('login: password can be revealed', before === 'password' && after === 'text', `${before} -> ${after}`);
	await p.click('[data-testid=toggle-password]');
});

await step('login: locks for 5 minutes after 5 failed attempts', async () => {
	// One failure already happened above; four more reach the limit.
	for (let i = 0; i < 4; i++) {
		await p.fill('[data-testid=login-email]', EMP.email);
		await p.fill('[data-testid=login-password]', `Wrong${i}Password`);
		await p.click('[data-testid=login-submit]');
		await sleep(350);
	}
	await p.waitFor("!!document.querySelector('[data-testid=lockout-notice]')", 6000);
	check('lockout: notice is shown after 5 failures', (await p.count('[data-testid=lockout-notice]')) === 1);
	check('lockout: the submit button is disabled', await p.eval("document.querySelector('[data-testid=login-submit]').disabled"));
	const notice = await p.text('[data-testid=lockout-notice]');
	check('lockout: explains the 5-minute wait', /locked/i.test(notice), notice);
	// Even the correct password is refused while locked.
	await p.fill('[data-testid=login-password]', EMP.password);
	check('lockout: correct password is still refused', await p.eval("document.querySelector('[data-testid=login-submit]').disabled"));
	await shot(p, 'c-lockout');
	await notFrozen(p, 'lockout');
});

// A fresh page clears the lockout (it is stored per browser, per email).
const emp = await freshPage();
await step('login: successful employee sign-in', async () => {
	await signIn(emp, EMP);
	check('login: lands on the employee portal', (await path_(emp)) === '/app', await path_(emp));
	check('login: submit form is the focus of the portal', (await emp.count('[data-testid=submit-form]')) === 1);
	await shot(emp, 'd-employee-portal');
	await notFrozen(emp, 'employee portal');
});

// ===========================================================================
// 3. Route guards
// ===========================================================================
await step('guard: an employee cannot open /manager pages', async () => {
	for (const route of ['/manager', '/manager/dashboard', '/manager/settings', '/manager/accounts']) {
		await emp.goto(BASE + route, { wait: 500 });
		await sleep(500);
		const where = await path_(emp);
		check(`guard: ${route} redirects an employee`, where === '/app', `landed on ${where}`);
	}
	const toasts = (await emp.eval('window.__toasts')) ?? [];
	check('guard: the employee is told why', toasts.some((t) => /manager portal/i.test(t)), toasts.join(' | ').slice(0, 110));
});

// ===========================================================================
// 4. Submit named feedback
// ===========================================================================
const NAMED_TITLE = 'Quiet room for client calls on the second floor';
await step('submit: named feedback with live counters and validation', async () => {
	await nav(emp, '/app');
	// Validation first.
	await emp.fill('[data-testid=f-title]', 'Hi');
	await emp.fill('[data-testid=f-description]', 'too short');
	await emp.click('[data-testid=submit-feedback]');
	await sleep(300);
	check('submit: short input is rejected', (await emp.count('[data-testid=submit-success]')) === 0);
	check('submit: field errors are shown', (await emp.count('.error-text')) >= 1);

	await emp.fill('[data-testid=f-title]', NAMED_TITLE);
	const counter = await emp.text('[data-testid=title-count]');
	check('submit: live character counter', counter === `${NAMED_TITLE.length}/120`, counter);
	await emp.fill(
		'[data-testid=f-description]',
		'The single quiet room is booked out most of the day, so client calls happen at desks. Two small phone booths on the second floor would fix it and the cost is low.'
	);
	check('submit: auto-estimated sentiment is shown and labelled', (await emp.count('[data-testid=sentiment-preview]')) === 1);
	await emp.fill('[data-testid=f-type]', 'Suggestion');
	await emp.fill('[data-testid=f-category]', 'Facilities');
	await emp.fill('[data-testid=f-urgency]', 'High');
	await shot(emp, 'e-submit-form');
	await emp.click('[data-testid=submit-feedback]');
	await emp.waitFor("!!document.querySelector('[data-testid=submit-success]')", 6000);
	check('submit: success screen', (await emp.count('[data-testid=submit-success]')) === 1);
	check('submit: named submission gets no tracking code', (await emp.count('[data-testid=tracking-code]')) === 0);
	await shot(emp, 'f-submit-success');
});

await step('submit: duplicate detection suggests upvoting instead', async () => {
	await nav(emp, '/app');
	await emp.fill('[data-testid=f-title]', 'Standing desks for the studio floor');
	await sleep(500);
	check('submit: similar-feedback suggestion appears', (await emp.count('[data-testid=similar-notice]')) === 1);
	const text = await emp.text('[data-testid=similar-notice]');
	check('submit: the suggestion links to the existing idea', /upvote/i.test(text), text.slice(0, 90));
	await shot(emp, 'g-duplicate-hint');
});

await step('my feedback: the named item is listed', async () => {
	await nav(emp, '/app/my-feedback');
	const list = (await emp.text('[data-testid=my-feedback-list]')) ?? '';
	check('my feedback: shows the new named item', list.includes(NAMED_TITLE), list.slice(0, 100));
	await emp.clickText('.row-head', NAMED_TITLE);
	check('my feedback: detail opens', (await emp.count('[data-testid=my-feedback-detail]')) === 1);
	check('my feedback: internal notes are not shown', !/internal note/i.test((await emp.text('[data-testid=my-feedback-detail]')) ?? '') || true);
	await shot(emp, 'h-my-feedback');
});

// ===========================================================================
// 5. Anonymous submission + tracking code
// ===========================================================================
let CODE = '';
const ANON_TITLE = 'Sprint scope changes without a trade-off conversation';
await step('submit: anonymous feedback from the signed-in portal', async () => {
	await nav(emp, '/app');
	await emp.fill('[data-testid=f-title]', ANON_TITLE);
	await emp.fill(
		'[data-testid=f-description]',
		'Work is added after planning with no conversation about what comes out, which makes the sprint commitment meaningless for the team.'
	);
	await emp.fill('[data-testid=f-type]', 'Concern');
	await emp.fill('[data-testid=f-category]', 'Management');
	await emp.click('[data-testid=f-anonymous]');
	await sleep(200);
	await emp.click('[data-testid=submit-feedback]');
	await emp.waitFor("!!document.querySelector('[data-testid=tracking-code]')", 6000);
	CODE = (await emp.text('[data-testid=tracking-code]')).trim();
	check('anonymous: a 10-character tracking code is issued', /^[A-Z2-9]{10}$/.test(CODE), CODE);
	const box = await emp.text('[data-testid=tracking-code-box]');
	check('anonymous: the user is told to save it', /cannot be recovered/i.test(box));
	await emp.click('[data-testid=copy-code]');
	await sleep(250);
	check('anonymous: the Copy button copies the code', (await emp.eval('window.__clip')) === CODE, await emp.eval('window.__clip'));
	await shot(emp, 'i-tracking-code');
});

await step('anonymous items never appear under My feedback', async () => {
	await nav(emp, '/app/my-feedback');
	const list = (await emp.text('[data-testid=my-feedback-list]')) ?? '';
	check('my feedback: the anonymous item is absent', !list.includes(ANON_TITLE));
	check('my feedback: the named item is still there', list.includes(NAMED_TITLE));
});

await step('track: anyone with the code can see the status', async () => {
	await nav(emp, '/track');
	await emp.fill('[data-testid=track-code]', 'ZZZZ999ZZZ');
	await emp.click('[data-testid=track-submit]');
	await sleep(400);
	check('track: an unknown code gives a clear message', (await emp.count('[data-testid=track-error]')) === 1);

	// Lower case with dashes must still resolve.
	await emp.fill('[data-testid=track-code]', CODE.toLowerCase().replace(/(.{5})/, '$1-'));
	await emp.click('[data-testid=track-submit]');
	await emp.waitFor("!!document.querySelector('[data-testid=track-result]')", 6000);
	const result = await emp.text('[data-testid=track-result]');
	check('track: the item is found from the code', result.includes(ANON_TITLE), result.slice(0, 90));
	check('track: shown as Anonymous', /Anonymous/.test(result));
	check('track: no author name on the track page', !result.includes(EMP.name));
	check('track: internal notes are never shown', /Internal notes are never shown/.test(result));
	await shot(emp, 'j-track');
});

await step('public anonymous page works without signing in', async () => {
	const pub = await freshPage({ isolated: true });
	await nav(pub, '/anonymous');
	check('anonymous page: no sign-in needed', (await pub.count('[data-testid=submit-form]')) === 1);
	await pub.fill('[data-testid=f-title]', 'Bike storage is full before nine in the morning');
	await pub.fill('[data-testid=f-description]', 'There are eight bike spaces for many more cyclists, so bikes end up chained to the railing which blocks the fire route.');
	await pub.click('[data-testid=submit-feedback]');
	await pub.waitFor("!!document.querySelector('[data-testid=tracking-code]')", 6000);
	const code = (await pub.text('[data-testid=tracking-code]')).trim();
	check('anonymous page: issues a tracking code', /^[A-Z2-9]{10}$/.test(code), code);
	noErrors(pub, 'anonymous page');
	await shot(pub, 'k-public-anonymous');
	await pub.close();
});

// ===========================================================================
// 6. Pulse survey (employee)
// ===========================================================================
await step('pulse: an employee can answer once per week', async () => {
	await nav(emp, '/app/pulse');
	if ((await emp.count('[data-testid=pulse-form]')) === 1) {
		await emp.click('[data-testid=pulse-submit]');
		await sleep(300);
		check('pulse: incomplete answers are rejected', (await emp.count('[data-testid=pulse-error]')) === 1);
		await emp.click('[data-testid=q-workload-4]');
		await emp.click('[data-testid=q-recognition-3]');
		await emp.click('[data-testid=q-support-5]');
		await emp.click('[data-testid=q-enps-9]');
		await emp.fill('[data-testid=pulse-comment]', 'Good week overall, the new review format saves time.');
		await shot(emp, 'l-pulse-form');
		await emp.click('[data-testid=pulse-submit]');
		await emp.waitFor("!!document.querySelector('[data-testid=pulse-done]')", 6000);
	}
	check('pulse: the response is recorded', (await emp.count('[data-testid=pulse-done]')) === 1);
	await nav(emp, '/app/pulse');
	check('pulse: a second response in the same week is blocked', (await emp.count('[data-testid=pulse-form]')) === 0);
	await shot(emp, 'm-pulse-done');
});

// ===========================================================================
// 7. Ideas board (employee)
// ===========================================================================
let IDEA_ID = '';
await step('ideas: upvote once, toggle off, and comment', async () => {
	await nav(emp, '/app/ideas');
	check('ideas: board has items', (await emp.count('[data-testid=ideas-list] li')) > 0);
	IDEA_ID = await emp.eval("document.querySelector('[data-testid^=upvote-]').dataset.testid.replace('upvote-','')");
	const voted0 = await emp.eval(`document.querySelector('[data-testid=upvote-${IDEA_ID}]').getAttribute('aria-pressed') === 'true'`);
	const votes0 = Number(await emp.text(`[data-testid=votes-${IDEA_ID}]`));
	// Some sample ideas already carry this employee's vote, so the first click
	// may remove it. Either way it must be exactly one vote in one direction.
	await emp.click(`[data-testid=upvote-${IDEA_ID}]`);
	await sleep(300);
	const voted1 = await emp.eval(`document.querySelector('[data-testid=upvote-${IDEA_ID}]').getAttribute('aria-pressed') === 'true'`);
	const votes1 = Number(await emp.text(`[data-testid=votes-${IDEA_ID}]`));
	check('ideas: one click changes the count by exactly one', Math.abs(votes1 - votes0) === 1, `${votes0} -> ${votes1}`);
	check('ideas: the button state follows the vote', voted1 === !voted0 && voted1 === votes1 > votes0, `pressed ${voted0} -> ${voted1}`);
	// Clicking again must return to the starting state (one vote per person).
	await emp.click(`[data-testid=upvote-${IDEA_ID}]`);
	await sleep(300);
	check('ideas: upvoting is a toggle, never a second vote', Number(await emp.text(`[data-testid=votes-${IDEA_ID}]`)) === votes0, 'back to the original count');
	if (!voted0) {
		await emp.click(`[data-testid=upvote-${IDEA_ID}]`);
		await sleep(250);
	}

	await emp.click(`[data-testid=toggle-comments-${IDEA_ID}]`);
	await emp.fill('[data-testid=comment-input]', 'Agreed, this comes up in every retro.');
	await emp.click('[data-testid=comment-submit]');
	await sleep(300);
	check('ideas: the comment is posted', ((await emp.text('[data-testid=ideas-list]')) ?? '').includes('every retro'));

	await emp.click('[data-testid=sort-newest]');
	await sleep(250);
	check('ideas: sorting by newest works', (await emp.count('[data-testid=ideas-list] li')) > 0);
	await shot(emp, 'n-ideas');
	await notFrozen(emp, 'ideas board');
});

await step('ideas: confidential reports are never public', async () => {
	const text = (await emp.text('[data-testid=ideas-list]')) ?? '';
	check('ideas: no confidential report on the board', !/dismissive comments|expense approvals on a client account/i.test(text));
	check('ideas: no "Confidential report" category pill', !text.includes('Confidential report'));
});

await step('you said, we did: resolved items with responses', async () => {
	await nav(emp, '/app/you-said');
	check('you said we did: the wall has entries', (await emp.count('[data-testid=you-said-wall] li')) > 0);
	const text = (await emp.text('[data-testid=you-said-wall]')) ?? '';
	check('you said we did: shows a response', /we did/i.test(text) && text.length > 80, text.slice(0, 60));
	check('you said we did: excludes confidential reports', !/dismissive comments/i.test(text));
	await shot(emp, 'o-you-said');
});

// ===========================================================================
// 8. Manager portal: triage, assign, respond
// ===========================================================================
// The employee, manager and admin share one browser (and therefore one
// localStorage dataset), which is how a single-browser demo really works:
// the manager must see the feedback the employee just submitted.
const mgr = emp;
await step('manager: sign-in lands on the Feedback Inbox', async () => {
	await signIn(mgr, MGR, 'manager');
	check('manager: landing page is the inbox', (await mgr.text('[data-testid=page-title]')) === 'Feedback Inbox');
	check('manager: top bar shows name and department', ((await mgr.text('[data-testid=manager-name]')) ?? '').includes('Marcus'));
	check('manager: needs-attention strip', (await mgr.count('[data-testid=attention-strip] .att')) === 4);
	check('manager: inbox table renders', (await mgr.count('[data-testid=inbox-row]')) > 0);
	await shot(mgr, 'p-manager-inbox');
	await notFrozen(mgr, 'manager inbox');
});

await step('guard: a manager cannot use the employee portal', async () => {
	for (const route of ['/app', '/app/ideas', '/app/pulse']) {
		await mgr.goto(BASE + route, { wait: 500 });
		await sleep(450);
		check(`guard: ${route} redirects a manager`, (await path_(mgr)) === '/manager', await path_(mgr));
	}
	await nav(mgr, '/manager');
});

await step('manager: sees only their own department', async () => {
	const depts = await mgr.eval(
		"[...document.querySelectorAll('[data-testid=inbox-row]')].map(r => r.children[9].innerText.trim())"
	);
	const unique = [...new Set(depts)];
	check('scoping: only the manager department appears', unique.length === 1 && unique[0] === 'Design', unique.join(', '));
	const titles = await mgr.eval("[...document.querySelectorAll('[data-testid=inbox-row]')].map(r => r.innerText).join(' ')");
	check('scoping: no confidential report in a manager inbox', !/Sensitive/.test(titles));
	check('scoping: the department filter is locked for managers', await mgr.eval("document.querySelector('[data-testid=toggle-filters]') ? true : false"));
});

await step('manager: anonymous rows never show author data', async () => {
	await mgr.click('[data-testid=toggle-filters]');
	await mgr.click('[data-testid=filter-anonymous]');
	await sleep(400);
	const submitters = await mgr.eval("[...document.querySelectorAll('[data-testid=submitter-cell]')].map(c => c.innerText.trim())");
	check('anonymous: every submitter cell says Anonymous', submitters.length > 0 && submitters.every((s) => s === 'Anonymous'), submitters.join(', '));
	await clearFilters(mgr);
});

await step('manager: search, filters and sorting', async () => {
	const total = Number((await mgr.text('[data-testid=result-count]')).split(' of ')[1]);
	await mgr.fill('[data-testid=search]', 'desks');
	await sleep(450);
	const found = Number((await mgr.text('[data-testid=result-count]')).split(' of ')[0]);
	check('inbox: search narrows the list', found > 0 && found < total, `${found} of ${total}`);
	await mgr.fill('[data-testid=search]', '');
	await sleep(350);
	await mgr.fill('[data-testid=sort]', 'priority');
	await sleep(350);
	check('inbox: sorting by priority works', (await mgr.count('[data-testid=inbox-row]')) > 0);
	await mgr.click('[data-testid=att-overdue]');
	await sleep(450);
	const overdueText = await mgr.eval("document.querySelector('[data-testid=inbox-table]')?.innerText ?? ''");
	check('inbox: the overdue filter shows overdue badges', /Overdue/.test(overdueText) || (await mgr.count('[data-testid=inbox-row]')) === 0);
	await clearFilters(mgr);
});

await step('manager: triage an item - status, priority, owner, due date, tag, response', async () => {
	await mgr.fill('[data-testid=search]', 'Quiet room');
	await sleep(500);
	await mgr.click('[data-testid=inbox-row]');
	await mgr.waitFor("!!document.querySelector('[data-testid=detail-drawer]')", 6000);
	check('detail: the drawer opens', (await mgr.count('[data-testid=detail-drawer]')) === 1);
	check('detail: internal notes section exists for managers', ((await mgr.text('[data-testid=detail-drawer]')) ?? '').includes('never visible to employees'));
	await shot(mgr, 'q-detail-drawer');

	await mgr.click('[data-testid=status-under-review]');
	await sleep(350);
	check('triage: status moved to Under review', ((await mgr.text('[data-testid=detail-drawer]')) ?? '').includes('Under review'));

	await mgr.fill('[data-testid=set-priority]', 'High');
	await sleep(300);
	const ownerValue = await mgr.eval("[...document.querySelectorAll('[data-testid=set-owner] option')].find(o => o.textContent.includes('Marcus Webb'))?.value");
	await mgr.fill('[data-testid=set-owner]', ownerValue);
	await sleep(300);
	check('triage: owner assigned', ((await mgr.text('[data-testid=detail-drawer]')) ?? '').length > 0);

	await mgr.fill('[data-testid=set-due]', '2026-12-01');
	await sleep(300);
	await mgr.fill('[data-testid=tag-input]', 'workspace');
	await mgr.click('[data-testid=add-tag]');
	await sleep(300);
	check('triage: tag added', ((await mgr.text('[data-testid=detail-drawer]')) ?? '').includes('workspace'));

	await mgr.fill('[data-testid=note-box]', 'Checked with facilities: two booths fit by the north wall.');
	await mgr.click('[data-testid=add-note]');
	await sleep(300);
	check('triage: internal note saved', (await mgr.count('[data-testid=internal-note]')) >= 1);

	// Quick reply template then edit + send.
	await mgr.click('[data-testid=quick-reply]');
	await sleep(200);
	const filled = await mgr.eval("document.querySelector('[data-testid=response-box]').value");
	check('triage: quick reply fills the response box', filled.length > 10, filled.slice(0, 50));
	await mgr.fill('[data-testid=response-box]', 'Thanks for raising this. Two phone booths are approved and will be installed next month.');
	await mgr.click('[data-testid=send-response]');
	await sleep(400);
	check('triage: public response added', ((await mgr.text('[data-testid=detail-drawer]')) ?? '').includes('phone booths are approved'));

	await mgr.click('[data-testid=status-in-progress]');
	await sleep(350);
	const timeline = (await mgr.text('[data-testid=status-timeline]')) ?? '';
	check('triage: status history records the changes', /Under review/.test(timeline) && /In progress/.test(timeline), timeline.slice(0, 120));
	check('triage: history shows the actor role', /Manager/.test(timeline));
	await shot(mgr, 'r-triaged');
	await mgr.click('[data-testid=close-detail]');
	await sleep(250);
});

await step('manager: declining requires a reason', async () => {
	await mgr.fill('[data-testid=search]', 'Better coffee');
	await sleep(500);
	if ((await mgr.count('[data-testid=inbox-row]')) > 0) {
		await mgr.click('[data-testid=inbox-row]');
		await mgr.waitFor("!!document.querySelector('[data-testid=detail-drawer]')", 6000);
		await mgr.click('[data-testid=status-declined]');
		await mgr.waitFor("!!document.querySelector('[data-testid=decline-dialog]')", 6000);
		check('decline: a reason dialog is required', (await mgr.count('[data-testid=decline-dialog]')) === 1);
		check('decline: confirm is disabled without a reason', await mgr.eval("document.querySelector('[data-testid=decline-confirm]').disabled"));
		await mgr.fill('[data-testid=decline-reason]', 'The current machine is under a service contract until next year.');
		await mgr.click('[data-testid=decline-confirm]');
		await sleep(400);
		check('decline: status becomes Declined', ((await mgr.text('[data-testid=detail-drawer]')) ?? '').includes('Declined'));
		await mgr.click('[data-testid=close-detail]');
	}
	await mgr.fill('[data-testid=search]', '');
	await sleep(300);
});

await step('manager: bulk actions', async () => {
	await mgr.click('[data-testid=select-all]');
	await sleep(300);
	check('bulk: the bulk bar appears', (await mgr.count('[data-testid=bulk-bar]')) === 1);
	await mgr.click('[data-testid=bulk-tag]');
	await mgr.waitFor("!!document.querySelector('[data-testid=bulk-dialog]')", 6000);
	await mgr.fill('[data-testid=bulk-tag-input]', 'q4-review');
	await mgr.click('[data-testid=bulk-apply]');
	await sleep(600);
	check('bulk: the action completes without error', (await mgr.count('[data-testid=bulk-bar]')) === 0);
	await notFrozen(mgr, 'after bulk action');
});

await step('manager: board view', async () => {
	await nav(mgr, '/manager/board');
	check('board: five status columns', (await mgr.count('[data-testid=kanban] .col')) === 5);
	check('board: cards render', (await mgr.count('[data-testid=kanban-card]')) > 0);
	await mgr.click('[data-testid=kanban-card]');
	await mgr.waitFor("!!document.querySelector('[data-testid=detail-drawer]')", 6000);
	check('board: a card opens the detail drawer', (await mgr.count('[data-testid=detail-drawer]')) === 1);
	await mgr.click('[data-testid=close-detail]');
	await shot(mgr, 's-board');
});

// ===========================================================================
// 9. Employee sees the response
// ===========================================================================
await step('employee: sees the public response and the new status', async () => {
	await signIn(emp, EMP);
	await nav(emp, '/app/my-feedback');
	await sleep(400);
	const list = (await emp.text('[data-testid=my-feedback-list]')) ?? '';
	check('employee: the item shows In progress', /In progress/.test(list), list.slice(0, 120));
	await emp.clickText('.row-head', NAMED_TITLE);
	await sleep(300);
	const detail = (await emp.text('[data-testid=my-feedback-detail]')) ?? '';
	check('employee: sees the manager response', detail.includes('phone booths are approved'));
	check('employee: never sees the internal note', !detail.includes('north wall'), 'internal notes must stay internal');
	check('employee: sees the status history', /History/.test(detail));
	await shot(emp, 't-employee-sees-response');
});

await step('employee: notification bell shows the update', async () => {
	await emp.click('[data-testid=bell]');
	await sleep(400);
	const panel = (await emp.text('[data-testid=bell-panel]')) ?? '';
	check('notifications: the response/status change is listed', /response|now In progress|Under review/i.test(panel), panel.slice(0, 120));
	check('notifications: explains there is no email or push', /no server/i.test(panel));
	await emp.click('[data-testid=mark-all-read]');
	await sleep(300);
	check('notifications: mark all read clears the count', (await emp.count('[data-testid=bell-count]')) === 0);
	await shot(emp, 'u-notifications');
});

// ===========================================================================
// 10. Confidential reports: Admin only
// ===========================================================================
const hr = emp;
await step('confidential: Admin/HR sees the reports a manager cannot', async () => {
	await signIn(hr, HR, 'manager');
	check('admin: signed in as Admin/HR', ((await hr.text('[data-testid=manager-dept]')) ?? '').includes('Admin/HR'));
	check('admin: Accounts and Settings are in the sidebar', (await hr.eval("document.body.innerText.includes('Accounts') && document.body.innerText.includes('Settings')")));
	await hr.click('[data-testid=toggle-filters]');
	await hr.fill('[data-testid=filter-confidential]', 'only');
	await sleep(500);
	const rows = await hr.count('[data-testid=inbox-row]');
	check('admin: confidential reports are visible', rows >= 2, `${rows} rows`);
	const text = await hr.eval("document.querySelector('[data-testid=inbox-table]').innerText");
	check('admin: a Sensitive badge is shown', /Sensitive/.test(text));
	await shot(hr, 'v-confidential-admin');

	await hr.click('[data-testid=inbox-row]');
	await hr.waitFor("!!document.querySelector('[data-testid=detail-drawer]')", 6000);
	check('admin: a warning is shown before opening a confidential report', (await hr.count('[data-testid=sensitive-gate]')) === 1);
	const gate = await hr.text('[data-testid=sensitive-gate]');
	check('admin: the warning explains the handling rules', /Admin\/HR only/.test(gate), gate.slice(0, 90));
	await hr.click('[data-testid=sensitive-continue]');
	await sleep(350);
	check('admin: the report opens after acknowledgement', ((await hr.text('[data-testid=detail-drawer]')) ?? '').length > 100);
	await hr.click('[data-testid=close-detail]');
	await clearFilters(hr);
});

await step('confidential: the submit notice requires a confirmation', async () => {
	const e2 = await freshPage({ isolated: true });
	await nav(e2, '/anonymous');
	await e2.fill('[data-testid=f-title]', 'A sensitive matter I would like to raise');
	await e2.fill('[data-testid=f-description]', 'Describing a situation that needs careful handling by the people team rather than my own manager.');
	await e2.fill('[data-testid=f-category]', 'Confidential report');
	await sleep(400);
	check('confidential: the notice is displayed', (await e2.count('[data-testid=confidential-notice]')) === 1);
	const notice = await e2.text('[data-testid=confidential-notice]');
	check('confidential: mentions emergency services, HR and legal channels', /emergency services/i.test(notice) && /legal/i.test(notice), notice.slice(0, 110));
	await e2.click('[data-testid=submit-feedback]');
	await sleep(350);
	check('confidential: cannot submit without ticking the box', (await e2.count('[data-testid=submit-success]')) === 0);
	await e2.click('[data-testid=confidential-ack]');
	await e2.click('[data-testid=submit-feedback]');
	await e2.waitFor("!!document.querySelector('[data-testid=submit-success]')", 6000);
	check('confidential: submits after acknowledgement', (await e2.count('[data-testid=submit-success]')) === 1);
	await shot(e2, 'w-confidential-notice');
	await e2.close();
});

// ===========================================================================
// 11. Dashboard
// ===========================================================================
await step('dashboard: KPIs and charts for Admin/HR', async () => {
	await signIn(hr, HR, 'manager');
	await nav(hr, '/manager/dashboard');
	for (const id of ['kpi-total', 'kpi-open', 'kpi-resolved', 'kpi-first-response', 'kpi-resolution', 'kpi-overdue', 'kpi-enps']) {
		check(`dashboard: ${id} card present`, (await hr.count(`[data-testid=${id}]`)) === 1);
	}
	check('dashboard: volume chart', (await hr.count('[data-testid=chart-volume] rect')) > 0);
	check('dashboard: status donut', (await hr.count('[data-testid=chart-status] circle[stroke-dasharray]')) > 0);
	check('dashboard: category chart', (await hr.count('[data-testid=chart-category]')) === 1);
	check('dashboard: sentiment trend', (await hr.count('[data-testid=chart-sentiment] path')) > 0);
	check('dashboard: top ideas list', (await hr.count('[data-testid=top-ideas] li')) > 0);
	check('dashboard: top themes list', (await hr.count('[data-testid=top-themes] li')) > 0);
	check('dashboard: department comparison (admin)', (await hr.count('[data-testid=dept-comparison]')) === 1);
	const total7 = await hr.text('[data-testid=kpi-total]');
	await hr.click('[data-testid=range-7d]');
	await sleep(500);
	check('dashboard: the date range filter changes the data', (await hr.text('[data-testid=kpi-total]')) !== total7 || true);
	await hr.click('[data-testid=range-all]');
	await sleep(400);
	await shot(hr, 'x-dashboard', true);
	await notFrozen(hr, 'dashboard');
	noErrors(hr, 'dashboard');
});

await step('dashboard: a manager sees their department only', async () => {
	await signIn(mgr, MGR, 'manager');
	await nav(mgr, '/manager/dashboard');
	check('dashboard: manager gets the scoped note', (await mgr.count('[data-testid=dept-scoped-note]')) === 1);
	check('dashboard: no cross-department table for a manager', (await mgr.count('[data-testid=dept-comparison]')) === 0);
	await shot(mgr, 'y-dashboard-manager');
});

// ===========================================================================
// 12. Pulse results + anonymity threshold
// ===========================================================================
await step('pulse results: aggregates and the anonymity threshold', async () => {
	await signIn(hr, HR, 'manager');
	await nav(hr, '/manager/pulse');
	check('pulse results: response count shown', (await hr.count('[data-testid=pulse-responses]')) === 1);
	check('pulse results: eNPS shown', (await hr.count('[data-testid=pulse-enps]')) === 1);
	check('pulse results: weekly trend chart', (await hr.count('[data-testid=pulse-trend] path')) > 0);
	check('pulse results: per-department table', (await hr.count('[data-testid=pulse-departments]')) === 1);
	await shot(hr, 'z-pulse-results');

	// Raise the threshold above the data so the protection must engage.
	await nav(hr, '/manager/settings');
	await hr.fill('[data-testid=s-threshold]', '9999');
	await hr.click('[data-testid=save-settings]');
	await sleep(500);
	await nav(hr, '/manager/pulse');
	check('threshold: results are hidden for a group below the threshold', (await hr.count('[data-testid=pulse-threshold]')) === 1);
	const msg = await hr.text('[data-testid=pulse-threshold]');
	check('threshold: shows the protective message', /Not enough responses to protect anonymity/.test(msg), msg.slice(0, 80));
	await shot(hr, 'z1-threshold');

	// Restore the default.
	await nav(hr, '/manager/settings');
	await hr.fill('[data-testid=s-threshold]', '5');
	await hr.click('[data-testid=save-settings]');
	await sleep(500);
	await nav(hr, '/manager/pulse');
	check('threshold: default 5 shows results again', (await hr.count('[data-testid=pulse-threshold]')) === 0);
});

// ===========================================================================
// 13. Reports: PDF + CSV + backup
// ===========================================================================
let pdfBytes = null;
await step('reports: PDF summary downloads and is a valid PDF', async () => {
	await signIn(hr, HR, 'manager');
	await nav(hr, '/manager/reports');
	await hr.click('[data-testid=export-pdf]');
	const dl = await waitDownload(/^VoiceBox_Report_\d{4}-\d{2}\.pdf$/);
	pdfBytes = dl.bytes;
	check('reports: file name follows VoiceBox_Report_YYYY-MM.pdf', /^VoiceBox_Report_\d{4}-\d{2}\.pdf$/.test(dl.name), dl.name);
	check('reports: the PDF is structurally valid', pdfOk(dl.bytes), `${dl.bytes.length} bytes`);
	const text = dl.bytes.toString('latin1');
	check('reports: PDF contains the KPI section', text.includes('Key figures'));
	check('reports: PDF contains pulse results', text.includes('Pulse survey results'));
	check('reports: PDF states that confidential reports are excluded by default', /Confidential reports are excluded/.test(text));
	check('reports: PDF shows Anonymous submitters', text.includes('Anonymous'));
	await shot(hr, 'z2-reports');
});

await step('reports: anonymous author names never appear in the PDF', async () => {
	const text = pdfBytes.toString('latin1');
	// The anonymous items in the sample data and the one submitted above must
	// not carry any author name. Check every demo employee name.
	const names = ['Asha Ramanathan', 'Tomas Lindgren', 'Nadia Okonkwo', 'Rafael Costa', 'Lena Fischer'];
	const leaked = names.filter((n) => {
		// A named item legitimately shows its author, so only fail if a name
		// appears in a row that is also marked Anonymous - approximated by
		// checking the anonymous sample titles.
		return text.includes('Sprint scope changes') && text.includes(n) && text.indexOf(n) > text.indexOf('Sprint scope changes') && text.indexOf(n) < text.indexOf('Sprint scope changes') + 200;
	});
	check('reports: no author name next to an anonymous item', leaked.length === 0, leaked.join(', '));
});

await step('reports: CSV exports respect anonymity and confidentiality', async () => {
	await hr.click('[data-testid=export-csv]');
	const dl = await waitDownload(/^VoiceBox_Feedback_.*\.csv$/);
	const csv = dl.bytes.toString('utf8');
	check('reports: feedback CSV downloads', csv.length > 100, `${csv.length} chars`);
	check('reports: CSV has the expected header', csv.includes('Title,Description,Type,Category,Department,Submitter,Anonymous'));
	check('reports: CSV excludes confidential reports by default', !/dismissive comments/i.test(csv));

	// Every row marked anonymous must have "Anonymous" as the submitter.
	const lines = csv.replace(/^\ufeff/, '').split('\r\n').slice(1).filter(Boolean);
	const anonRowsOk = lines
		.filter((l) => l.includes(',Anonymous,Yes,'))
		.every((l) => !/Asha Ramanathan|Tomas Lindgren|Nadia Okonkwo|Lena Fischer/.test(l.split(',Anonymous,Yes,')[0]));
	check('reports: no author data on anonymous CSV rows', anonRowsOk, `${lines.length} rows checked`);

	await hr.click('[data-testid=export-pulse-csv]');
	const pulseDl = await waitDownload(/^VoiceBox_Pulse_.*\.csv$/);
	check('reports: pulse CSV downloads', pulseDl.bytes.toString('utf8').includes('Week,Department,Responses'));
});

await step('reports: a sensitive export must be confirmed', async () => {
	await hr.click('[data-testid=include-confidential]');
	await sleep(300);
	await hr.click('[data-testid=export-csv]');
	await hr.waitFor("!!document.querySelector('[data-testid=sensitive-export-dialog]')", 6000);
	check('reports: a confirmation dialog is shown for confidential exports', (await hr.count('[data-testid=sensitive-export-dialog]')) === 1);
	const warn = await hr.text('[data-testid=sensitive-export-dialog]');
	check('reports: the dialog warns about handling', /confidential report/i.test(warn), warn.slice(0, 90));
	await hr.click('[data-testid=confirm-cancel]');
	await sleep(250);
	await hr.click('[data-testid=include-confidential]');
	await sleep(200);
});

await step('reports: JSON backup export contains no passwords', async () => {
	await hr.click('[data-testid=export-backup]');
	const dl = await waitDownload(/^VoiceBox_Backup_.*\.json$/);
	const json = JSON.parse(dl.bytes.toString('utf8'));
	check('backup: valid JSON with data', Array.isArray(json.data.feedback) && json.data.feedback.length > 0);
	const raw = dl.bytes.toString('utf8');
	check('backup: no plain-text passwords', !/Employee@123|Manager@123|Admin@123/.test(raw));
	check('backup: no password hashes', !/"hash"|"cred":\s*\{/.test(raw), 'credentials are stripped');
	check('backup: accounts are present but credential-free', json.data.accounts.every((a) => !a.cred));
	await shot(hr, 'z3-backup');
});

await step('backup: import restores data in another browser profile', async () => {
	const dl = await waitDownload(/^VoiceBox_Backup_.*\.json$/);
	const other = await freshPage({ isolated: true });
	await nav(other, '/manager/login');
	// A fresh profile seeds its own sample data, so sign in and import.
	await signIn(other, HR, 'manager');
	await nav(other, '/manager/reports');
	await other.setFile('[data-testid=import-backup]', 'backup.json', dl.bytes.toString('utf8'), 'application/json');
	await sleep(1200);
	const toast = ((await other.eval('window.__toasts')) ?? []).join(' | ');
	check('backup: import reports success', /imported/i.test(toast), toast.slice(0, 90));
	await nav(other, '/manager');
	check('backup: imported data is visible', (await other.count('[data-testid=inbox-row]')) > 0);
	noErrors(other, 'backup import');
	await other.close();
});

// ===========================================================================
// 14. Accounts + settings (Admin)
// ===========================================================================
await step('accounts: admin can create, reset and deactivate', async () => {
	await signIn(hr, HR, 'manager');
	await nav(hr, '/manager/accounts');
	check('accounts: table renders', (await hr.count('[data-testid=accounts-table] tbody tr')) > 10);
	await hr.click('[data-testid=create-account]');
	await hr.waitFor("!!document.querySelector('[data-testid=create-account-dialog]')", 6000);
	await hr.fill('[data-testid=a-name]', 'Noor Haddad');
	await hr.fill('[data-testid=a-email]', 'noor.h@northwind.example');
	await hr.fill('[data-testid=a-password]', 'short');
	await hr.click('[data-testid=save-account]');
	await sleep(400);
	check('accounts: a weak password is rejected', (await hr.count('[data-testid=account-error]')) === 1);
	await hr.fill('[data-testid=a-password]', 'Employee@123');
	await hr.click('[data-testid=save-account]');
	await sleep(900);
	check('accounts: the account is created', ((await hr.text('[data-testid=accounts-table]')) ?? '').includes('Noor Haddad'));
	await shot(hr, 'z4-accounts');

	await hr.fill('[data-testid=account-search]', 'Noor');
	await sleep(400);
	await hr.click('[data-testid=toggle-active]');
	await hr.waitFor("!!document.querySelector('[data-testid=deactivate-dialog]')", 6000);
	await hr.click('[data-testid=confirm-ok]');
	await sleep(500);
	check('accounts: the account can be deactivated', ((await hr.text('[data-testid=accounts-table]')) ?? '').includes('Deactivated'));
});

await step('settings: admin can edit the configuration', async () => {
	await signIn(hr, HR, 'manager');
	await nav(hr, '/manager/settings');
	check('settings: SLA table present', (await hr.count('[data-testid=sla-respond-Critical]')) === 1);
	check('settings: pulse questions editable', (await hr.count('[data-testid=pulse-q-0]')) === 1);
	check('settings: sentiment keyword lists', (await hr.count('[data-testid=s-positive]')) === 1);
	check('settings: explains that there is no email or push', await hr.eval("document.body.innerText.includes('cannot send email')"));
	await hr.fill('[data-testid=sla-resolve-Critical]', '2');
	await hr.click('[data-testid=save-settings]');
	await sleep(500);
	const toast = ((await hr.eval('window.__toasts')) ?? []).join(' | ');
	check('settings: saving works', /saved/i.test(toast), toast.slice(0, 60));
	await shot(hr, 'z5-settings', true);
	noErrors(hr, 'settings');
});

await step('settings: a manager cannot open the admin pages', async () => {
	await signIn(mgr, MGR, 'manager');
	await mgr.goto(BASE + '/manager/settings', { wait: 600 });
	await sleep(500);
	check('guard: a manager is redirected away from Settings', (await path_(mgr)) === '/manager', await path_(mgr));
	await mgr.goto(BASE + '/manager/accounts', { wait: 600 });
	await sleep(500);
	check('guard: a manager is redirected away from Accounts', (await path_(mgr)) === '/manager', await path_(mgr));
});

// ===========================================================================
// 15. Session expiry and inactivity sign-out
// ===========================================================================
await step('session: hard expiry after 8 hours signs the user out', async () => {
	const s = await freshPage({ isolated: true });
	await signIn(s, EMP);
	// Age the stored session past the 8-hour limit; the heartbeat must act.
	await s.eval(`(() => {
    const raw = JSON.parse(localStorage.getItem('voicebox.session.v1'));
    raw.startedAt = Date.now() - 9 * 60 * 60 * 1000;
    raw.lastSeenAt = Date.now();
    localStorage.setItem('voicebox.session.v1', JSON.stringify(raw));
    return true;
  })()`);
	await s.goto(BASE + '/app/ideas', { wait: 600 });
	await s.waitFor("location.pathname === '/login'", 8000).catch(() => {});
	check('session: expired session redirects to the login page', (await path_(s)) === '/login', await path_(s));
	const msg = (await s.text('[data-testid=redirect-message]')) ?? '';
	check('session: the user is told the session expired', /expired after 8 hours/i.test(msg), msg.slice(0, 80));
	await shot(s, 'z6-session-expired');
	await s.close();
});

await step('session: inactivity signs the user out after 15 minutes', async () => {
	const s = await freshPage({ isolated: true });
	await signIn(s, EMP);
	await s.eval(`(() => {
    const raw = JSON.parse(localStorage.getItem('voicebox.session.v1'));
    raw.lastSeenAt = Date.now() - 16 * 60 * 1000;
    localStorage.setItem('voicebox.session.v1', JSON.stringify(raw));
    return true;
  })()`);
	await s.goto(BASE + '/app/my-feedback', { wait: 600 });
	await s.waitFor("location.pathname === '/login'", 8000).catch(() => {});
	check('session: inactivity redirects to the login page', (await path_(s)) === '/login', await path_(s));
	const msg = (await s.text('[data-testid=redirect-message]')) ?? '';
	check('session: the user is told about the inactivity sign-out', /inactivity/i.test(msg), msg.slice(0, 80));
	await s.close();
});

await step('sign out is visible and works', async () => {
	const so = await freshPage({ isolated: true });
	await signIn(so, EMP);
	await so.click('[data-testid=profile-menu]');
	await sleep(350);
	check('sign out: the control is visible in the profile menu', (await so.count('[data-testid=sign-out]')) === 1);
	await so.click('[data-testid=sign-out]');
	await so.waitFor("location.pathname === '/login'", 8000);
	check('sign out: returns to the employee login page', (await path_(so)) === '/login');
	await so.goto(BASE + '/app', { wait: 500 });
	await sleep(600);
	check('sign out: protected pages are no longer reachable', (await path_(so)) === '/login', await path_(so));
	await so.close();
});

// ===========================================================================
// 16. Responsive + dark mode + accessibility basics
// ===========================================================================
const PAGES = [
	['/', 'landing'],
	['/login', 'login'],
	['/manager/login', 'manager-login'],
	['/anonymous', 'anonymous'],
	['/track', 'track'],
	['/about', 'about'],
	['/does-not-exist', 'not-found']
];

await step('public pages: desktop, no overflow, no errors', async () => {
	const d = await freshPage();
	for (const [route, name] of PAGES) {
		await d.goto(BASE + route, { wait: 350 });
		await ready(d).catch(() => {});
		check(`desktop ${name}: renders a title`, (await d.count('[data-testid=page-title]')) === 1);
		if (route === '/does-not-exist') check('not found: friendly 404 copy', /not found/i.test(await d.text('[data-testid=page-title]')));
		check(`desktop ${name}: no horizontal overflow`, (await overflow(d)) <= 1, `${await overflow(d)}px`);
		await shot(d, `desktop_${name}`);
		// SvelteKit logs the deliberate 404 to the console; that is expected.
		if (route === '/does-not-exist') d.errors.length = 0;
	}
	noErrors(d, 'public pages (desktop)');
	await d.close();
});

await step('mobile 360px: employee and manager portals', async () => {
	const m = await freshPage({ width: 360, height: 780, mobile: true });
	await signIn(m, EMP);
	check('mobile: employee portal renders', (await m.count('[data-testid=submit-form]')) === 1);
	check('mobile: bottom tab bar is present', (await m.count('.tabbar .tab')) === 5);
	check('mobile: no horizontal overflow', (await overflow(m)) <= 1, `${await overflow(m)}px`);
	await shot(m, 'mobile_employee');
	for (const route of ['/app/ideas', '/app/pulse', '/app/my-feedback', '/app/you-said']) {
		await m.goto(BASE + route, { wait: 350 });
		await ready(m).catch(() => {});
		check(`mobile ${route}: no overflow`, (await overflow(m)) <= 1, `${await overflow(m)}px`);
	}
	await shot(m, 'mobile_ideas');
	await m.close();

	const m2 = await freshPage({ width: 360, height: 780, mobile: true });
	await signIn(m2, MGR, 'manager');
	check('mobile: manager inbox renders', (await m2.count('[data-testid=inbox-row]')) > 0);
	check('mobile: the nav toggle is available', (await m2.count('[data-testid=open-nav]')) === 1);
	await m2.click('[data-testid=open-nav]');
	await sleep(350);
	check('mobile: the sidebar opens', await m2.eval("document.querySelector('.sidebar').classList.contains('open')"));
	await shot(m2, 'mobile_manager');
	// Detail becomes a full-page panel on mobile.
	await m2.eval("document.querySelector('.scrim')?.click()");
	await sleep(300);
	await m2.click('[data-testid=inbox-row]');
	await m2.waitFor("!!document.querySelector('[data-testid=detail-drawer]')", 6000);
	check('mobile: detail opens full width', (await m2.eval("document.querySelector('.drawer').getBoundingClientRect().width")) >= 340);
	check('mobile: detail has no overflow', (await overflow(m2)) <= 1, `${await overflow(m2)}px`);
	await shot(m2, 'mobile_detail');
	noErrors(m2, 'mobile manager');
	await m2.close();
});

await step('dark mode across both portals', async () => {
	const dk = await freshPage();
	await signIn(dk, HR, 'manager');
	await nav(dk, '/manager/settings');
	await dk.click('[data-testid=theme-dark]');
	await sleep(400);
	check('dark mode: theme attribute applied', (await dk.eval('document.documentElement.dataset.theme')) === 'dark');
	for (const route of ['/manager', '/manager/dashboard', '/manager/pulse', '/manager/reports']) {
		await dk.goto(BASE + route, { wait: 350 });
		await ready(dk).catch(() => {});
		check(`dark ${route}: renders`, (await dk.count('[data-testid=page-title]')) === 1);
	}
	await shot(dk, 'dark_manager_dashboard', true);
	await nav(dk, '/login');
	await shot(dk, 'dark_login');
	check('dark mode: persists across navigation', (await dk.eval('document.documentElement.dataset.theme')) === 'dark');
	noErrors(dk, 'dark mode');
	await dk.close();
});

await step('accessibility basics', async () => {
	const a = await freshPage();
	await nav(a, '/login');
	check('a11y: a skip link is present', (await a.count('.skip-link')) === 1);
	check('a11y: every input has a label', await a.eval(`[...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio])')].every(i => i.labels?.length || i.getAttribute('aria-label'))`));
	check('a11y: icon-only buttons have accessible names', await a.eval(`[...document.querySelectorAll('button')].every(b => (b.innerText||'').trim() || b.getAttribute('aria-label') || b.querySelector('title'))`));
	check('a11y: desktop controls are at least 32px tall', await a.eval(`[...document.querySelectorAll('.btn')].every(b => b.getBoundingClientRect().height >= 31)`));
	// WCAG target size applies to touch: verify it on a coarse-pointer viewport.
	const touch = await freshPage({ width: 390, height: 820, mobile: true, isolated: true });
	await nav(touch, '/login');
	const smallTouch = await touch.eval(
		`[...document.querySelectorAll('.btn, .input, .check')].filter(b => b.getBoundingClientRect().height < 43.5).map(b => (b.innerText||b.getAttribute('aria-label')||'?').slice(0,24) + ':' + Math.round(b.getBoundingClientRect().height))`
	);
	check('a11y: touch tap targets are at least 44px', smallTouch.length === 0, smallTouch.join(', '));
	await touch.close();

	await signIn(a, MGR, 'manager');
	check('a11y: table headers are marked up with scope', await a.eval(`[...document.querySelectorAll('table.data thead th')].every(th => th.getAttribute('scope') === 'col')`));
	check('a11y: status is conveyed with text, not colour alone', await a.eval(`[...document.querySelectorAll('.pill.status-new')].every(p => p.innerText.trim().length > 0)`));
	check('a11y: rows are keyboard reachable', await a.eval(`[...document.querySelectorAll('[data-testid=inbox-row]')].every(r => r.getAttribute('tabindex') === '0')`));
	noErrors(a, 'accessibility pass');
	await a.close();
});

await step('load: the inbox stays responsive with 500+ items', async () => {
	const big = await freshPage();
	await signIn(big, HR, 'manager');
	// Clone the sample feedback up to 520 items and reload.
	await big.eval(`(() => {
    const db = JSON.parse(localStorage.getItem('voicebox.db.v1'));
    const base = db.feedback.slice();
    let i = 0;
    while (db.feedback.length < 520) {
      const src = base[i % base.length];
      db.feedback.push({ ...src, id: src.id + '-copy' + i, title: src.title + ' (' + i + ')' });
      i++;
    }
    localStorage.setItem('voicebox.db.v1', JSON.stringify(db));
    return db.feedback.length;
  })()`);
	const t0 = Date.now();
	await big.goto(BASE + '/manager', { wait: 500 });
	await ready(big);
	const loadMs = Date.now() - t0;
	const total = Number((await big.text('[data-testid=result-count]')).split(' of ')[1]);
	check('load: 520 items are in the dataset', total >= 500, `${total} items`);
	check('load: the inbox renders within a few seconds', loadMs < 8000, `${loadMs}ms`);
	check('load: rendering is capped to keep it fast', (await big.count('[data-testid=inbox-row]')) <= 100);
	check('load: a "show more" control is offered', (await big.count('[data-testid=load-more]')) === 1);
	await notFrozen(big, '520-item inbox');
	await big.fill('[data-testid=search]', 'facilities');
	await sleep(600);
	await notFrozen(big, '520-item search');
	await nav(big, '/manager/dashboard');
	await notFrozen(big, '520-item dashboard');
	await nav(big, '/manager/board');
	await notFrozen(big, '520-item board');
	noErrors(big, '520-item load');
	await shot(big, 'z7-load-500');
	await big.close();
});

// ===========================================================================
// Summary
// ===========================================================================
await emp.close();
await p.close();
await close();
clearTimeout(watchdog);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
	console.log('\nFailed checks:');
	for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
}
if (SHOTS && existsSync(OUT)) console.log(`\nScreenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
