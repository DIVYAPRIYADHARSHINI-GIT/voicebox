// Unit tests for the VoiceBox business rules: lockout, session expiry, route
// guards, status transitions, SLA/overdue, anonymity threshold, tracking codes,
// eNPS, sentiment, duplicate detection, department scoping and confidential
// visibility.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	CODE_ALPHABET,
	CODE_LENGTH,
	DEFAULT_SLA,
	IDLE_LIMIT_MS,
	LOCKOUT_MS,
	MAX_FAILED_ATTEMPTS,
	SESSION_MAX_MS,
	THRESHOLD_MESSAGE,
	areaOf,
	canBePublic,
	canTransition,
	canonicalCode,
	checkTransition,
	effectiveSla,
	emailLooksValid,
	enps,
	estimateSentiment,
	findByTrackingCode,
	findSimilar,
	generateTrackingCode,
	guard,
	homeFor,
	isConfidential,
	isDueSoon,
	isOpen,
	isOverdue,
	isValidTrackingCode,
	lockState,
	meetsThreshold,
	nextStatuses,
	normalizeTrackingCode,
	publicIdeas,
	publicView,
	registerFailure,
	respondDueDate,
	scopeForStaff,
	sessionState,
	slaDueDate,
	submitterLabel,
	titleSimilarity,
	titleTokens,
	validateDraft,
	visibleToStaff
} from '../../src/lib/core/rules.ts';
import type { Account, Feedback, Session, Status } from '../../src/lib/core/types.ts';
import { DAY_MS, daysBetween, isoDate, parseDateInput, recentWeeks, startOfDay, startOfWeek, weekKey } from '../../src/lib/core/time.ts';

const T0 = new Date(2026, 9, 22, 12, 0, 0).getTime(); // 22 Oct 2026, local noon

function makeItem(over: Partial<Feedback> = {}): Feedback {
	return {
		id: 'fb-1',
		title: 'Test item',
		description: 'A description long enough to be valid for the tests.',
		type: 'Suggestion',
		category: 'Culture',
		department: 'Design',
		urgency: 'Medium',
		anonymous: false,
		authorId: 'acct-1',
		authorName: 'Asha Ramanathan',
		createdAt: T0,
		updatedAt: T0,
		status: 'New',
		priority: 'Medium',
		sentiment: 'Neutral',
		tags: [],
		isPublic: false,
		upvotes: [],
		comments: [],
		responses: [],
		notes: [],
		history: [],
		readBy: [],
		...over
	};
}

// ---------------------------------------------------------------------------
// Lockout
// ---------------------------------------------------------------------------

test('lockout: form locks for 5 minutes after 5 failed attempts', () => {
	let rec = undefined;
	for (let i = 1; i <= MAX_FAILED_ATTEMPTS; i++) {
		rec = registerFailure(rec, T0);
		const state = lockState(rec, T0);
		if (i < MAX_FAILED_ATTEMPTS) {
			assert.equal(state.locked, false, `attempt ${i} should not lock`);
			assert.equal(state.attemptsLeft, MAX_FAILED_ATTEMPTS - i);
		} else {
			assert.equal(state.locked, true, 'the 5th failure locks the form');
			assert.equal(state.attemptsLeft, 0);
			assert.ok(state.remainingMs > 0 && state.remainingMs <= LOCKOUT_MS);
		}
	}
});

test('lockout: expires after 5 minutes and resets the counter', () => {
	let rec = undefined;
	for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) rec = registerFailure(rec, T0);
	assert.equal(lockState(rec, T0 + LOCKOUT_MS - 1).locked, true);
	const after = lockState(rec, T0 + LOCKOUT_MS + 1);
	assert.equal(after.locked, false);
	assert.equal(after.attemptsLeft, MAX_FAILED_ATTEMPTS, 'an expired lock resets attempts');
	// A failure after the lock expired starts counting from one again.
	const fresh = registerFailure(rec, T0 + LOCKOUT_MS + 1000);
	assert.equal(fresh.fails, 1);
});

test('lockout: no record means a clean slate', () => {
	const state = lockState(undefined, T0);
	assert.deepEqual(state, { locked: false, remainingMs: 0, attemptsLeft: MAX_FAILED_ATTEMPTS });
});

// ---------------------------------------------------------------------------
// Session expiry
// ---------------------------------------------------------------------------

const session = (over: Partial<Session> = {}): Session => ({ accountId: 'a', role: 'employee', startedAt: T0, lastSeenAt: T0, ...over });

test('session: active within limits', () => {
	assert.equal(sessionState(session(), T0 + 60_000), 'active');
	assert.equal(sessionState(session({ lastSeenAt: T0 + 60_000 }), T0 + 61_000), 'active');
});

test('session: hard expiry after 8 hours even while active', () => {
	const s = session({ lastSeenAt: T0 + SESSION_MAX_MS - 1000 });
	assert.equal(sessionState(s, T0 + SESSION_MAX_MS), 'expired');
	assert.equal(sessionState(s, T0 + SESSION_MAX_MS - 1), 'active');
});

test('session: idle sign-out after 15 minutes of inactivity', () => {
	const s = session();
	assert.equal(sessionState(s, T0 + IDLE_LIMIT_MS - 1), 'active');
	assert.equal(sessionState(s, T0 + IDLE_LIMIT_MS), 'idle');
});

test('session: no session reports none', () => {
	assert.equal(sessionState(null, T0), 'none');
	assert.equal(sessionState(undefined, T0), 'none');
});

// ---------------------------------------------------------------------------
// Route guards
// ---------------------------------------------------------------------------

test('guard: areas are classified correctly', () => {
	assert.equal(areaOf('/manager'), 'manager');
	assert.equal(areaOf('/manager/dashboard'), 'manager');
	assert.equal(areaOf('/manager/login'), 'public', 'the manager login page itself is public');
	assert.equal(areaOf('/app'), 'employee');
	assert.equal(areaOf('/app/pulse'), 'employee');
	assert.equal(areaOf('/login'), 'public');
	assert.equal(areaOf('/track'), 'public');
	assert.equal(areaOf('/anonymous'), 'public');
});

test('guard: employees cannot open manager pages', () => {
	const r = guard('/manager', 'employee');
	assert.equal(r.allow, false);
	assert.equal(r.redirect, '/app');
	assert.match(r.message ?? '', /manager portal/i);
});

test('guard: managers and admins cannot use the employee portal', () => {
	for (const role of ['manager', 'admin'] as const) {
		const r = guard('/app', role);
		assert.equal(r.allow, false);
		assert.equal(r.redirect, '/manager');
		assert.match(r.message ?? '', /sign out/i);
	}
});

test('guard: signed-out users are redirected to the right login page', () => {
	assert.equal(guard('/manager/inbox', undefined).redirect, '/manager/login');
	assert.equal(guard('/app/ideas', undefined).redirect, '/login');
});

test('guard: admin-only pages reject managers', () => {
	assert.equal(guard('/manager/settings', 'manager', true).allow, false);
	assert.equal(guard('/manager/settings', 'manager', true).redirect, '/manager');
	assert.equal(guard('/manager/settings', 'admin', true).allow, true);
});

test('guard: allowed cases', () => {
	assert.equal(guard('/manager', 'manager').allow, true);
	assert.equal(guard('/manager', 'admin').allow, true);
	assert.equal(guard('/app', 'employee').allow, true);
	assert.equal(guard('/login', undefined).allow, true);
	assert.equal(guard('/manager/login', undefined).allow, true);
});

test('guard: home route per role', () => {
	assert.equal(homeFor('employee'), '/app');
	assert.equal(homeFor('manager'), '/manager');
	assert.equal(homeFor('admin'), '/manager');
	assert.equal(homeFor(undefined), '/login');
});

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

test('transitions: the documented flow is allowed', () => {
	assert.ok(canTransition('New', 'Under review'));
	assert.ok(canTransition('Under review', 'In progress'));
	assert.ok(canTransition('In progress', 'Resolved'));
	assert.ok(canTransition('New', 'Declined'));
	assert.ok(canTransition('Under review', 'Declined'));
});

test('transitions: resolved only reopens to In progress', () => {
	assert.deepEqual(nextStatuses('Resolved'), ['In progress']);
	assert.equal(canTransition('Resolved', 'New'), false);
	assert.equal(canTransition('Resolved', 'Declined'), false);
});

test('transitions: declining requires a reason', () => {
	assert.deepEqual(checkTransition('New', 'Declined'), { ok: false, error: 'A reason is required to decline feedback.' });
	assert.deepEqual(checkTransition('New', 'Declined', '   '), { ok: false, error: 'A reason is required to decline feedback.' });
	assert.deepEqual(checkTransition('New', 'Declined', 'Not feasible this year'), { ok: true });
});

test('transitions: moving to the same status is rejected', () => {
	const r = checkTransition('New', 'New');
	assert.equal(r.ok, false);
	assert.match(r.error ?? '', /already/);
});

test('transitions: isOpen marks only pre-closure states', () => {
	assert.equal(isOpen('New'), true);
	assert.equal(isOpen('Under review'), true);
	assert.equal(isOpen('In progress'), true);
	assert.equal(isOpen('Resolved'), false);
	assert.equal(isOpen('Declined'), false);
});

// ---------------------------------------------------------------------------
// SLA / overdue
// ---------------------------------------------------------------------------

test('sla: due date derives from priority when none is set', () => {
	const critical = makeItem({ priority: 'Critical', createdAt: T0 });
	const low = makeItem({ priority: 'Low', createdAt: T0 });
	assert.equal(daysBetween(T0, slaDueDate(critical)), DEFAULT_SLA.Critical.resolve);
	assert.equal(daysBetween(T0, slaDueDate(low)), DEFAULT_SLA.Low.resolve);
});

test('sla: an explicit due date wins', () => {
	const due = T0 + 2 * DAY_MS;
	assert.equal(slaDueDate(makeItem({ dueDate: due })), due);
});

test('overdue: open and past due is overdue; closed never is', () => {
	const item = makeItem({ priority: 'High', createdAt: T0 - 30 * DAY_MS });
	assert.equal(isOverdue(item, T0), true);
	assert.equal(isOverdue({ ...item, status: 'Resolved' }, T0), false);
	assert.equal(isOverdue({ ...item, status: 'Declined' }, T0), false);
	assert.equal(isOverdue(makeItem({ createdAt: T0 }), T0), false, 'a brand new item is not overdue');
});

test('overdue: respects custom SLA settings from Settings', () => {
	const item = makeItem({ priority: 'Low', createdAt: T0 - 10 * DAY_MS });
	assert.equal(isOverdue(item, T0, DEFAULT_SLA), false, 'default Low SLA is 30 days');
	const strict = { ...DEFAULT_SLA, Low: { respond: 1, resolve: 5 } };
	assert.equal(isOverdue(item, T0, strict), true, 'a 5-day Low SLA makes it overdue');
});

test('due soon: items due within three days, not already overdue', () => {
	const soon = makeItem({ dueDate: T0 + 2 * DAY_MS });
	const far = makeItem({ dueDate: T0 + 10 * DAY_MS });
	const past = makeItem({ dueDate: T0 - DAY_MS });
	assert.equal(isDueSoon(soon, 3, T0), true);
	assert.equal(isDueSoon(far, 3, T0), false);
	assert.equal(isDueSoon(past, 3, T0), false, 'already overdue is not "due soon"');
});

test('sla: respond target is shorter than the resolve target', () => {
	const item = makeItem({ priority: 'High', createdAt: T0 });
	assert.ok(respondDueDate(item) < slaDueDate(item));
});

test('sla: effectiveSla falls back to defaults for missing rows', () => {
	assert.deepEqual(effectiveSla(undefined), DEFAULT_SLA);
	const partial = effectiveSla({ sla: { Critical: { respond: 2, resolve: 4 } } as never });
	assert.deepEqual(partial.Critical, { respond: 2, resolve: 4 });
	assert.deepEqual(partial.Low, DEFAULT_SLA.Low, 'missing rows keep the default');
});

// ---------------------------------------------------------------------------
// Anonymity threshold
// ---------------------------------------------------------------------------

test('anonymity threshold: results are hidden below the threshold', () => {
	assert.equal(meetsThreshold(4, 5), false);
	assert.equal(meetsThreshold(5, 5), true);
	assert.equal(meetsThreshold(6, 5), true);
	assert.equal(meetsThreshold(0, 5), false);
});

test('anonymity threshold: a configurable threshold is honoured', () => {
	assert.equal(meetsThreshold(3, 3), true);
	assert.equal(meetsThreshold(2, 3), false);
	assert.equal(meetsThreshold(1, 0), true, 'a zero threshold is clamped to 1');
	assert.equal(THRESHOLD_MESSAGE, 'Not enough responses to protect anonymity');
});

// ---------------------------------------------------------------------------
// Tracking codes
// ---------------------------------------------------------------------------

test('tracking code: 10 easy-to-read characters, no look-alikes', () => {
	for (let i = 0; i < 200; i++) {
		const code = generateTrackingCode();
		assert.equal(code.length, CODE_LENGTH);
		assert.match(code, /^[A-Z2-9]+$/);
		for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch), `${ch} must be in the alphabet`);
		assert.equal(/[01OIL]/.test(code), false, 'confusable characters are excluded');
	}
});

test('tracking code: generated codes are varied', () => {
	const codes = new Set(Array.from({ length: 100 }, () => generateTrackingCode()));
	assert.ok(codes.size > 90, 'codes should not repeat in practice');
});

test('tracking code: validation and normalisation', () => {
	assert.equal(isValidTrackingCode('ABCD234XYZ'), true);
	assert.equal(isValidTrackingCode('abcd 234-xyz'), true, 'case, spaces and dashes are tolerated');
	assert.equal(isValidTrackingCode('ABC'), false);
	assert.equal(normalizeTrackingCode(' abcd-234 xyz '), 'ABCD234XYZ');
});

test('tracking code: lookup tolerates typing variants', () => {
	const item = makeItem({ anonymous: true, authorId: undefined, authorName: undefined, trackingCode: 'ABCD234XYZ' });
	const items = [makeItem({ id: 'other' }), item];
	assert.equal(findByTrackingCode(items, 'ABCD234XYZ')?.id, item.id);
	assert.equal(findByTrackingCode(items, 'abcd-234-xyz')?.id, item.id);
	assert.equal(findByTrackingCode(items, ' abcd 234 xyz ')?.id, item.id);
	assert.equal(findByTrackingCode(items, 'ZZZZ999ZZZ'), undefined);
	assert.equal(findByTrackingCode(items, 'short'), undefined);
});

test('tracking code: canonical form collapses O/0 and I/1/L', () => {
	assert.equal(canonicalCode('O0I1L'), '00111');
});

// ---------------------------------------------------------------------------
// eNPS
// ---------------------------------------------------------------------------

test('enps: promoters minus detractors as a percentage', () => {
	// 5 promoters (9-10), 2 passives (7-8), 3 detractors (0-6) = 50 - 30 = 20
	const scores = [10, 10, 9, 9, 9, 8, 7, 6, 3, 0];
	const r = enps(scores);
	assert.equal(r.promoters, 5);
	assert.equal(r.passives, 2);
	assert.equal(r.detractors, 3);
	assert.equal(r.responses, 10);
	assert.equal(r.score, 20);
});

test('enps: boundary values are classified per the standard', () => {
	assert.equal(enps([9]).promoters, 1);
	assert.equal(enps([8]).passives, 1);
	assert.equal(enps([6]).detractors, 1);
	assert.equal(enps([10, 10]).score, 100);
	assert.equal(enps([0, 0]).score, -100);
});

test('enps: empty and out-of-range input is safe', () => {
	assert.equal(enps([]).score, 0);
	assert.equal(enps([]).responses, 0);
	assert.equal(enps([11, -1, NaN, 10]).responses, 1, 'invalid scores are ignored');
});

// ---------------------------------------------------------------------------
// Sentiment
// ---------------------------------------------------------------------------

test('sentiment: keyword estimation', () => {
	assert.equal(estimateSentiment('Thank you, this was really helpful and kind'), 'Positive');
	assert.equal(estimateSentiment('This process is broken, slow and frustrating'), 'Negative');
	assert.equal(estimateSentiment('The meeting is on Tuesday in room four'), 'Neutral');
});

test('sentiment: simple negation flips the word', () => {
	assert.equal(estimateSentiment('this was not helpful'), 'Negative');
	assert.equal(estimateSentiment('it is not broken'), 'Positive');
});

test('sentiment: a custom lexicon from Settings is used', () => {
	assert.equal(estimateSentiment('the flurb was magnificent', ['magnificent'], []), 'Positive');
	assert.equal(estimateSentiment('the flurb was magnificent', [], ['magnificent']), 'Negative');
});

test('sentiment: empty text is neutral', () => {
	assert.equal(estimateSentiment(''), 'Neutral');
});

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

test('duplicates: title tokens drop stop words and short words', () => {
	const tokens = titleTokens('We need a better standing desk for the studio');
	assert.ok(tokens.includes('better'));
	assert.ok(tokens.includes('standing'));
	assert.ok(tokens.includes('desk'));
	assert.equal(tokens.includes('the'), false);
	assert.equal(tokens.includes('we'), false);
});

test('duplicates: similarity is high for near-identical titles', () => {
	assert.ok(titleSimilarity('Standing desks for the studio floor', 'Standing desks on the studio floor') > 0.8);
	assert.ok(titleSimilarity('Better coffee please', 'Bike storage is full') < 0.2);
	assert.equal(titleSimilarity('', 'anything'), 0);
});

test('duplicates: only public, non-confidential items are suggested', () => {
	const items = [
		makeItem({ id: 'public', title: 'Standing desks for the studio floor', isPublic: true, upvotes: ['a'] }),
		makeItem({ id: 'private', title: 'Standing desks for the studio floor', isPublic: false }),
		makeItem({ id: 'confidential', title: 'Standing desks for the studio floor', isPublic: true, category: 'Confidential report' })
	];
	const found = findSimilar(items, 'Standing desks for the studio');
	assert.deepEqual(found.map((f) => f.id), ['public']);
});

test('duplicates: unrelated titles return nothing', () => {
	const items = [makeItem({ id: 'a', title: 'Bike storage is full by 9am', isPublic: true })];
	assert.deepEqual(findSimilar(items, 'Quiet room for client calls'), []);
});

// ---------------------------------------------------------------------------
// Department scoping + confidential visibility
// ---------------------------------------------------------------------------

const manager: Pick<Account, 'role' | 'department'> = { role: 'manager', department: 'Design' };
const otherManager: Pick<Account, 'role' | 'department'> = { role: 'manager', department: 'Engineering' };
const admin: Pick<Account, 'role' | 'department'> = { role: 'admin', department: 'People & Culture' };

test('scoping: a manager sees only their own department', () => {
	const design = makeItem({ id: 'd', department: 'Design' });
	const eng = makeItem({ id: 'e', department: 'Engineering' });
	assert.equal(visibleToStaff(design, manager), true);
	assert.equal(visibleToStaff(eng, manager), false);
	assert.deepEqual(scopeForStaff([design, eng], manager).map((f) => f.id), ['d']);
	assert.deepEqual(scopeForStaff([design, eng], otherManager).map((f) => f.id), ['e']);
});

test('scoping: admin sees every department', () => {
	const items = [makeItem({ id: 'd', department: 'Design' }), makeItem({ id: 'e', department: 'Engineering' })];
	assert.equal(scopeForStaff(items, admin).length, 2);
});

test('confidential: never visible to a manager, even in their department', () => {
	const report = makeItem({ id: 'c', department: 'Design', category: 'Confidential report' });
	assert.equal(isConfidential(report), true);
	assert.equal(visibleToStaff(report, manager), false, 'department managers never see confidential reports');
	assert.equal(visibleToStaff(report, admin), true, 'Admin/HR sees confidential reports');
});

test('confidential: employees never pass the staff visibility check', () => {
	const item = makeItem();
	assert.equal(visibleToStaff(item, { role: 'employee', department: 'Design' }), false);
});

test('confidential and concerns are never public on the ideas board', () => {
	assert.equal(canBePublic({ category: 'Confidential report', type: 'Concern' }), false);
	assert.equal(canBePublic({ category: 'Culture', type: 'Concern' }), false, 'concerns about individuals stay private');
	assert.equal(canBePublic({ category: 'Idea', type: 'Suggestion' }), true);
	assert.equal(canBePublic({ category: 'Culture', type: 'Praise' }), true);
});

test('ideas board excludes confidential reports and concerns', () => {
	const items = [
		makeItem({ id: 'ok', type: 'Suggestion', isPublic: true }),
		makeItem({ id: 'concern', type: 'Concern', isPublic: true }),
		makeItem({ id: 'conf', type: 'Suggestion', category: 'Confidential report', isPublic: true }),
		makeItem({ id: 'notpublic', type: 'Suggestion', isPublic: false })
	];
	assert.deepEqual(publicIdeas(items).map((f) => f.id), ['ok']);
});

// ---------------------------------------------------------------------------
// Anonymity of stored items
// ---------------------------------------------------------------------------

test('anonymous items never expose author data', () => {
	const anon = makeItem({ anonymous: true, authorId: 'leaked', authorName: 'Leaked Name' });
	const view = publicView(anon);
	assert.equal(view.authorId, undefined);
	assert.equal(view.authorName, undefined);
	assert.equal(submitterLabel(anon), 'Anonymous');
});

test('named items keep their author', () => {
	const named = makeItem();
	assert.equal(publicView(named).authorName, 'Asha Ramanathan');
	assert.equal(submitterLabel(named), 'Asha Ramanathan');
});

// ---------------------------------------------------------------------------
// Draft validation
// ---------------------------------------------------------------------------

test('validation: a good draft passes', () => {
	const r = validateDraft({ title: 'Standing desks', description: 'A description that is clearly long enough.', category: 'Facilities', urgency: 'Medium' });
	assert.equal(r.ok, true);
	assert.deepEqual(r.errors, {});
});

test('validation: short title and description are rejected', () => {
	const r = validateDraft({ title: 'Hi', description: 'too short', category: 'Culture', urgency: 'Low' });
	assert.equal(r.ok, false);
	assert.ok(r.errors.title);
	assert.ok(r.errors.description);
});

test('validation: a confidential report requires the acknowledgement', () => {
	const base = { title: 'A sensitive matter', description: 'Describing something that needs care and attention.', category: 'Confidential report', urgency: 'High' as const };
	assert.equal(validateDraft(base).ok, false);
	assert.ok(validateDraft(base).errors.confidentialAck);
	assert.equal(validateDraft({ ...base, confidentialAck: true }).ok, true);
});

test('validation: email format check', () => {
	assert.equal(emailLooksValid('employee@northwind.example'), true);
	assert.equal(emailLooksValid('not-an-email'), false);
	assert.equal(emailLooksValid(''), false);
});

// ---------------------------------------------------------------------------
// Time helpers (local time zone correctness)
// ---------------------------------------------------------------------------

test('time: start of day and week use local time', () => {
	const d = new Date(startOfDay(T0));
	assert.equal(d.getHours(), 0);
	assert.equal(d.getMinutes(), 0);
	assert.equal(new Date(startOfWeek(T0)).getDay(), 1, 'weeks start on Monday');
});

test('time: ISO week keys are stable and sortable', () => {
	const key = weekKey(T0);
	assert.match(key, /^\d{4}-W\d{2}$/);
	assert.equal(weekKey(startOfWeek(T0)), key, 'any day in the week maps to the same key');
	assert.equal(weekKey(startOfWeek(T0) + 6 * DAY_MS), key);
	assert.notEqual(weekKey(T0 + 7 * DAY_MS), key);
	const weeks = recentWeeks(8, T0);
	assert.equal(weeks.length, 8);
	assert.deepEqual(weeks, [...weeks].sort(), 'recentWeeks is oldest-first and sortable');
});

test('time: date inputs round-trip in local time', () => {
	const parsed = parseDateInput('2026-10-22');
	assert.ok(parsed);
	assert.equal(isoDate(parsed!), '2026-10-22', 'no off-by-one from time zones');
	assert.equal(parseDateInput('not a date'), undefined);
});

test('time: daysBetween counts calendar days', () => {
	assert.equal(daysBetween(T0, T0 + 3 * DAY_MS), 3);
	assert.equal(daysBetween(T0, T0), 0);
});

// ---------------------------------------------------------------------------
// Performance guard: the rules must stay cheap with 500+ items
// ---------------------------------------------------------------------------

test('performance: filtering and scoping 500 items is fast', () => {
	const many: Feedback[] = Array.from({ length: 500 }, (_, i) =>
		makeItem({ id: `fb-${i}`, department: i % 2 ? 'Design' : 'Engineering', createdAt: T0 - i * 3_600_000, status: (['New', 'Under review', 'In progress', 'Resolved'] as Status[])[i % 4] })
	);
	const start = Date.now();
	const scoped = scopeForStaff(many, manager);
	const overdueCount = scoped.filter((f) => isOverdue(f, T0)).length;
	const elapsed = Date.now() - start;
	assert.equal(scoped.length, 250);
	assert.ok(overdueCount >= 0);
	assert.ok(elapsed < 250, `scoping 500 items took ${elapsed}ms`);
});
