// Cross-device regression test - the specific bug this architecture fixes.
//
//   npm run build && npx vite preview --port 4319 --strictPort &
//   caffeinate -dims env BASE_URL=http://localhost:4319 node tests/e2e/cross-device.mjs
//
// Every "device" is a SEPARATE browser context with its own cookie jar and its
// own localStorage, which is exactly the situation that used to fail: an
// employee submitting on one device was invisible to a manager on another.
//
// Flow: employee signs in on device A and raises a named + an anonymous ticket
// -> manager signs in on device B and SEES them -> manager triages and responds
// -> employee on device A sees the response -> a third, signed-out device
// tracks the anonymous code. Plus the access-control boundaries that matter
// once the data is shared.
import { launch, sleep } from './cdp.mjs';
import { resetStore } from './reset-store.mjs';

// The dataset is shared server-side now, so a run must start from a known
// fixture: previous runs' failed logins would otherwise leave demo accounts
// locked, and load records would accumulate.
await resetStore().catch((e) => console.log('reset-store skipped:', e.message));

const BASE = (process.env.BASE_URL ?? 'http://localhost:4319').replace(/\/$/, '');

const EMP = { email: 'employee@northwind.example', password: 'Employee@123', name: 'Asha Ramanathan' };
const MGR = { email: 'manager@northwind.example', password: 'Manager@123', name: 'Marcus Webb' };
const ENG_MGR = { email: 'elena.d@northwind.example', password: 'Manager@123', name: 'Elena Duarte' };
const HR = { email: 'hr@northwind.example', password: 'Admin@123', name: 'Priya Varghese' };

const results = [];
function check(name, ok, detail = '') {
	results.push({ name, ok: Boolean(ok), detail });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const { newPage, close } = await launch({ port: Number(process.env.CDP_PORT ?? 9437) });
const watchdog = setTimeout(async () => {
	console.error('E2E watchdog: aborting');
	await close().catch(() => {});
	process.exit(2);
}, Number(process.env.E2E_TIMEOUT_MS ?? 5 * 60_000));
watchdog.unref();

/** A genuinely separate device: isolated cookies AND isolated localStorage. */
async function device(label) {
	const p = await newPage({ isolated: true });
	await p.viewport(1366, 900);
	await p.addInitScript('window.__beat = 0; setInterval(() => { window.__beat++; }, 50);');
	p.label = label;
	return p;
}

const ready = (p) => p.waitFor("!document.querySelector('[data-testid=loading]') && !!document.querySelector('[data-testid=page-title]')", 15000);
const nav = async (p, path) => {
	await p.goto(BASE + path, { wait: 400 });
	await ready(p).catch(() => {});
};

async function signIn(p, who, portal = 'employee') {
	await nav(p, portal === 'manager' ? '/manager/login' : '/login');
	await p.fill('[data-testid=login-email]', who.email);
	await p.fill('[data-testid=login-password]', who.password);
	await p.click('[data-testid=login-submit]');
	await p.waitFor(`location.pathname.startsWith('${portal === 'manager' ? '/manager' : '/app'}')`, 15000);
	await ready(p).catch(() => {});
	// The portal fetches its data from the server after navigating, so wait for
	// the first payload to land before asserting on content.
	if (portal === 'manager') {
		await p
			.waitFor("!!document.querySelector('[data-testid=inbox-row]') || !!document.querySelector('[data-testid=inbox-empty]')", 15000)
			.catch(() => {});
	}
	await sleep(400);
}

async function step(name, fn) {
	try {
		await fn();
	} catch (e) {
		check(name, false, String(e?.message ?? e).split('\n')[0]);
	}
}

const unique = Date.now().toString(36).slice(-5).toUpperCase();
const NAMED_TITLE = `Projector in the Design studio drops signal ${unique}`;
const ANON_TITLE = `Sprint scope changes without a trade-off talk ${unique}`;
let CODE = '';
let ITEM_ID = null;

// ---------------------------------------------------------------------------
// Device A: the employee's phone
// ---------------------------------------------------------------------------
const phone = await device('phone');

await step('storage is shared, not per-browser', async () => {
	const health = await (await fetch(BASE + '/api/health')).json();
	check('health: shared storage configured', health.mode === 'shared' && health.storage.configured === true, JSON.stringify(health.storage));
});

await step('device A: employee signs in and submits a named ticket', async () => {
	await signIn(phone, EMP);
	check('device A: signed in', (await phone.text('[data-testid=page-title]')) === 'Submit feedback');

	await phone.fill('[data-testid=f-title]', NAMED_TITLE);
	await phone.fill(
		'[data-testid=f-description]',
		'The projector in the main Design studio loses signal every few minutes during client reviews, which makes presenting impossible.'
	);
	await phone.fill('[data-testid=f-type]', 'Concern');
	await phone.fill('[data-testid=f-category]', 'Facilities');
	await phone.fill('[data-testid=f-urgency]', 'High');
	await phone.click('[data-testid=submit-feedback]');
	await phone.waitFor("!!document.querySelector('[data-testid=submit-success]')", 15000);
	check('device A: named ticket submitted', true);
});

await step('device A: employee submits an anonymous ticket and gets a code', async () => {
	await nav(phone, '/app');
	await phone.fill('[data-testid=f-title]', ANON_TITLE);
	await phone.fill(
		'[data-testid=f-description]',
		'Work is added after planning with no discussion of what comes out, so the sprint commitment stops meaning anything to the team.'
	);
	await phone.fill('[data-testid=f-type]', 'Concern');
	await phone.fill('[data-testid=f-category]', 'Management');
	await phone.click('[data-testid=f-anonymous]');
	await sleep(200);
	await phone.click('[data-testid=submit-feedback]');
	await phone.waitFor("!!document.querySelector('[data-testid=tracking-code]')", 15000);
	CODE = (await phone.text('[data-testid=tracking-code]')).trim();
	check('device A: anonymous ticket got a code', /^[A-Z2-9]{10}$/.test(CODE), CODE);
});

// ---------------------------------------------------------------------------
// Device B: the manager's laptop - THE BUG
// ---------------------------------------------------------------------------
const laptop = await device('laptop');

await step('device B: the manager SEES the tickets raised on device A', async () => {
	await signIn(laptop, MGR, 'manager');
	const who = (await laptop.text('[data-testid=manager-name]')) ?? '';
	const rows = await laptop.count('[data-testid=inbox-row]');
	check('device B: manager signed in', who.includes('Marcus') && rows > 0, `${who.trim()} / ${rows} rows`);

	const table = await laptop.eval("document.querySelector('[data-testid=inbox-table]')?.innerText ?? ''");
	check('>>> device B: the NAMED ticket from device A is visible', table.includes(NAMED_TITLE), 'this is the reported bug');
	check('>>> device B: the ANONYMOUS ticket from device A is visible', table.includes(ANON_TITLE));
	// Read the submitter cell of the anonymous row itself.
	const anonSubmitter = await laptop.eval(
		`(() => { const r = [...document.querySelectorAll('[data-testid=inbox-row]')].find((x) => x.innerText.includes(${JSON.stringify(ANON_TITLE)})); return r ? r.querySelector('[data-testid=submitter-cell]').innerText.trim() : null; })()`
	);
	check('device B: the anonymous row shows "Anonymous", not a name', anonSubmitter === 'Anonymous', String(anonSubmitter));
});

await step('device B: manager triages and responds', async () => {
	// Narrow to this run's tickets, then open the named one specifically.
	await laptop.fill('[data-testid=search]', NAMED_TITLE.slice(0, 40));
	await laptop.waitFor(`[...document.querySelectorAll('[data-testid=inbox-row]')].some((r) => r.innerText.includes(${JSON.stringify(unique)}))`, 15000);
	await laptop.clickText('[data-testid=inbox-row]', unique);
	await laptop.waitFor("!!document.querySelector('[data-testid=detail-drawer]')", 15000);
	// Confirm the drawer really is the ticket from device A before mutating it.
	const drawerTitle = (await laptop.text('[data-testid=detail-drawer]')) ?? '';
	check('device B: opened the device-A ticket', drawerTitle.includes(unique) && drawerTitle.includes('Projector'), drawerTitle.slice(0, 60));

	// Capture the id so the assertions below can check the real record rather
	// than drawer text ('Under review' is also a button label in the drawer).
	ITEM_ID = await laptop.eval(
		`(async () => { const res = await fetch('/api/feedback', { credentials: 'same-origin' }); const d = await res.json(); return (d.items ?? []).find((i) => i.title === ${JSON.stringify(NAMED_TITLE)})?.id ?? null; })()`
	);
	check('device B: located the device-A record', Boolean(ITEM_ID), String(ITEM_ID));

	await laptop.click('[data-testid=status-under-review]');
	await laptop
		.waitFor(
			`(async () => { const res = await fetch('/api/feedback', { credentials: 'same-origin' }); const d = await res.json(); return (d.items ?? []).find((i) => i.id === ${JSON.stringify('PLACEHOLDER')})?.status === 'Under review'; })()`.replace(
				'"PLACEHOLDER"',
				JSON.stringify(ITEM_ID)
			),
			15000
		)
		.catch(() => {});
	const afterStatus = await laptop.eval(
		`(async () => { const res = await fetch('/api/feedback', { credentials: 'same-origin' }); const d = await res.json(); return (d.items ?? []).find((i) => i.id === ${JSON.stringify(ITEM_ID)})?.status ?? null; })()`
	);
	check('device B: status moved to Under review', afterStatus === 'Under review', String(afterStatus));

	const RESPONSE = 'Thanks for reporting this. A replacement projector is ordered and arrives next week.';
	await laptop.fill('[data-testid=response-box]', RESPONSE);
	await laptop.click('[data-testid=send-response]');
	await laptop
		.waitFor(`document.querySelector('[data-testid=detail-drawer]').innerText.includes('replacement projector is ordered')`, 15000)
		.catch(() => {});
	check('device B: public response saved', ((await laptop.text('[data-testid=detail-drawer]')) ?? '').includes('replacement projector is ordered'));

	await laptop.fill('[data-testid=note-box]', 'Internal: charged to the facilities budget, not for the submitter.');
	await laptop.click('[data-testid=add-note]');
	await laptop.waitFor("document.querySelectorAll('[data-testid=internal-note]').length >= 1", 15000).catch(() => {});
	check('device B: internal note saved', (await laptop.count('[data-testid=internal-note]')) >= 1);
	await laptop.click('[data-testid=close-detail]');
	await laptop.fill('[data-testid=search]', '');
	await sleep(400);
});

// ---------------------------------------------------------------------------
// Back to device A: the employee sees the manager's work
// ---------------------------------------------------------------------------
await step('device A: the employee sees the response from device B', async () => {
	await nav(phone, '/app/my-feedback');
	await phone.waitFor("!!document.querySelector('[data-testid=my-feedback-list]')", 15000);

	// Check the payload itself: the UI list can be long, so this is the reliable
	// assertion that the employee's own record reflects device B's triage.
	const mine = await phone.eval(`(async () => {
    const res = await fetch('/api/feedback', { credentials: 'same-origin' });
    const data = await res.json();
    const row = (data.mine ?? []).find((i) => i.title === ${JSON.stringify(NAMED_TITLE)});
    return row ? { status: row.status, responses: row.responses.length, notes: row.notes.length, text: row.responses[0]?.text ?? '' } : null;
  })()`);
	check('device A: the named ticket is in the employee’s own feed', mine !== null);
	check('>>> device A: the status change from device B is visible', mine?.status === 'Under review', String(mine?.status));
	check('>>> device A: the manager response from device B is visible', (mine?.text ?? '').includes('replacement projector is ordered'));
	check('device A: the internal note is NOT sent to the employee', mine?.notes === 0, `${mine?.notes} notes`);

	// And confirm it renders: expand that specific row in the UI.
	const opened = await phone.eval(
		`(() => { const b = [...document.querySelectorAll('.row-head')].find((x) => x.innerText.includes(${JSON.stringify(NAMED_TITLE)})); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`
	);
	if (opened) {
		await phone.waitFor("!!document.querySelector('[data-testid=my-feedback-detail]')", 10000).catch(() => {});
		const detail = (await phone.text('[data-testid=my-feedback-detail]')) ?? '';
		check('device A: the response renders in the UI', detail.includes('replacement projector is ordered'));
		check('device A: the internal note is NOT shown in the UI', !detail.includes('facilities budget'));
	} else {
		check('device A: the response renders in the UI', false, 'row not found in the list');
	}

	// Anonymous submissions never appear here, by design.
	const anonInMine = await phone.eval(`(async () => {
    const res = await fetch('/api/feedback', { credentials: 'same-origin' });
    const data = await res.json();
    return (data.mine ?? []).some((i) => i.title === ${JSON.stringify(ANON_TITLE)} || i.anonymous === true);
  })()`);
	check('device A: no anonymous item appears in My feedback', anonInMine === false);
});

// ---------------------------------------------------------------------------
// Device C: signed out entirely - tracking by code
// ---------------------------------------------------------------------------
await step('device C: a signed-out device tracks the anonymous code', async () => {
	const kiosk = await device('kiosk');
	await nav(kiosk, '/track');
	await kiosk.fill('[data-testid=track-code]', CODE);
	await kiosk.click('[data-testid=track-submit]');
	await kiosk.waitFor("!!document.querySelector('[data-testid=track-result]') || !!document.querySelector('[data-testid=track-error]')", 15000);
	const result = (await kiosk.text('[data-testid=track-result]')) ?? '';
	check('>>> device C: the code from device A resolves with no sign-in', result.includes(ANON_TITLE), result.slice(0, 70));
	check('device C: shown as Anonymous', /Anonymous/.test(result));
	check('device C: no author name anywhere', !result.includes(EMP.name));
	await kiosk.close();
});

// ---------------------------------------------------------------------------
// Access control, now that the data is genuinely shared
// ---------------------------------------------------------------------------
await step('scoping: another department\u2019s manager cannot see these tickets', async () => {
	const other = await device('eng-laptop');
	await signIn(other, ENG_MGR, 'manager');
	const table = await other.eval("document.querySelector('[data-testid=inbox-table]')?.innerText ?? ''");
	check('scoping: the Engineering manager does not see Design tickets', !table.includes(NAMED_TITLE) && !table.includes(ANON_TITLE));
	const depts = await other.eval("[...new Set([...document.querySelectorAll('[data-testid=inbox-row]')].map(r => r.children[9].innerText.trim()))]");
	check('scoping: only their own department is present', depts.length > 0 && depts.every((d) => d === 'Engineering'), depts.join(', ') || 'no rows');
	await other.close();
});

await step('scoping: confidential reports reach Admin/HR only', async () => {
	const mgrTable = await laptop.eval("document.querySelector('[data-testid=inbox-table]')?.innerText ?? ''");
	check('confidential: not in the manager inbox', !/Sensitive/.test(mgrTable));

	const hr = await device('hr-laptop');
	await signIn(hr, HR, 'manager');
	await hr.click('[data-testid=toggle-filters]');
	await hr.fill('[data-testid=filter-confidential]', 'only');
	await sleep(800);
	check('confidential: visible to Admin/HR', (await hr.count('[data-testid=inbox-row]')) >= 1);
	await hr.close();
});

await step('API: the server refuses cross-department access directly', async () => {
	// Bypass the UI entirely: ask the API for another department's item.
	const probe = await laptop.eval(`(async () => {
    const res = await fetch('/api/feedback', { credentials: 'same-origin' });
    const data = await res.json();
    return (data.items ?? []).map((i) => i.department);
  })()`);
	check('API: the feed itself is scoped server-side', probe.every((d) => d === 'Design'), [...new Set(probe)].join(', '));

	const forged = await laptop.eval(`(async () => {
    const res = await fetch('/api/admin/accounts', { credentials: 'same-origin' });
    return { status: res.status, body: await res.json() };
  })()`);
	check('API: a manager cannot read the admin accounts endpoint', forged.status === 403, `HTTP ${forged.status}`);
});


await step('concurrency: simultaneous submissions are not lost', async () => {
	// The old read-modify-write lost records under concurrency; this is the guard.
	const tag = `CONC${Date.now().toString(36).slice(-4).toUpperCase()}`;
	const sent = await phone.eval(`(async () => {
    const posts = Array.from({ length: 6 }, (_, i) =>
      fetch('/api/feedback/submit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Concurrency ${tag} number ' + i,
          description: 'Checking that simultaneous submissions from a device are all persisted to the shared store without loss.',
          type: 'Suggestion', category: 'Culture', department: 'Design', urgency: 'Low',
          anonymous: false, makePublic: false
        })
      }).then((r) => r.ok)
    );
    return (await Promise.all(posts)).filter(Boolean).length;
  })()`);
	check('concurrency: all 6 submissions were accepted', sent === 6, `${sent}/6`);

	await sleep(1500);
	const seen = await laptop.eval(`(async () => {
    const res = await fetch('/api/feedback', { credentials: 'same-origin' });
    const data = await res.json();
    return (data.items ?? []).filter((i) => i.title.includes('${tag}')).length;
  })()`);
	check('>>> concurrency: all 6 are visible to the manager (none lost)', seen === 6, `${seen}/6 persisted`);
});

await step('session: signing out on one device does not sign out the other', async () => {
	const second = await device('employee-tablet');
	await signIn(second, EMP);
	check('tablet: the same employee can sign in on a second device', (await second.text('[data-testid=page-title]')) === 'Submit feedback');

	await second.click('[data-testid=profile-menu]');
	await sleep(300);
	await second.click('[data-testid=sign-out]');
	await second.waitFor("location.pathname === '/login'", 15000);
	await second.close();

	// Device A must still be signed in: sessions are per-device cookies.
	await nav(phone, '/app/my-feedback');
	check('device A: still signed in after the tablet signed out', (await phone.eval('location.pathname')) === '/app/my-feedback');
});

// ---------------------------------------------------------------------------
await laptop.close();
await phone.close();
await close();
clearTimeout(watchdog);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
	console.log('\nFailed checks:');
	for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
}
process.exit(failed.length ? 1 : 0);
