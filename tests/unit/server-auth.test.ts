// Tests for the server-side session layer and the access-control rules.
//
// These matter more than the old client-side equivalents: with one shared
// database, the server is the only thing standing between a manager and another
// department's feedback, or between anyone and a confidential report.
//
// The SQL-level scoping (listFeedbackForStaff) is covered by the integration
// test in tests/e2e/cross-device.mjs, which runs against a real database.
// Here we test the pure logic those queries are built from, plus the signed
// session cookies.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.VOICEBOX_SESSION_SECRET = 'test-secret-for-unit-tests';

const { decodeSession, encodeSession, sessionStatus, canAccessItem, isStaff, requiredRoleFor, GENERIC_LOGIN_ERROR } = await import(
	'../../src/lib/server/auth.ts'
);
const { IDLE_LIMIT_MS, SESSION_MAX_MS, visibleToStaff, scopeForStaff } = await import('../../src/lib/core/rules.ts');
import type { Account, Feedback } from '../../src/lib/core/types.ts';

const T0 = new Date(2026, 9, 22, 12, 0, 0).getTime();

function account(over: Partial<Account> = {}): Account {
	return {
		id: 'acct-1',
		name: 'Marcus Webb',
		email: 'manager@northwind.example',
		role: 'manager',
		department: 'Design',
		active: true,
		createdAt: T0,
		cred: { alg: 'PBKDF2-SHA256', iterations: 1000, salt: 'c2FsdA', hash: 'aGFzaA' },
		...over
	};
}

function item(over: Partial<Feedback> = {}): Feedback {
	return {
		id: 'fb-1',
		title: 'Item',
		description: 'Description',
		type: 'Suggestion',
		category: 'Culture',
		department: 'Design',
		urgency: 'Medium',
		anonymous: false,
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
// Signed session cookies
// ---------------------------------------------------------------------------

test('session token: round-trips a valid payload', () => {
	const payload = { accountId: 'acct-1', startedAt: T0, lastSeenAt: T0 };
	assert.deepEqual(decodeSession(encodeSession(payload)), payload);
});

test('session token: a tampered payload is rejected', () => {
	const token = encodeSession({ accountId: 'acct-1', startedAt: T0, lastSeenAt: T0 });
	const [body, mac] = token.split('.');
	// Swap in a different account id but keep the original signature.
	const forgedBody = Buffer.from(JSON.stringify({ accountId: 'acct-admin', startedAt: T0, lastSeenAt: T0 })).toString('base64url');
	assert.equal(decodeSession(`${forgedBody}.${mac}`), null, 'a swapped body must not verify');
	assert.equal(decodeSession(`${body}.${mac.slice(0, -2)}xx`), null, 'a corrupted MAC must not verify');
	assert.equal(decodeSession('garbage'), null);
	assert.equal(decodeSession(undefined), null);
});

test('session token: a signature from another secret is rejected', () => {
	const token = encodeSession({ accountId: 'acct-1', startedAt: T0, lastSeenAt: T0 });
	const original = process.env.VOICEBOX_SESSION_SECRET;
	process.env.VOICEBOX_SESSION_SECRET = 'a-different-secret';
	assert.equal(decodeSession(token), null, 'rotating the secret invalidates old sessions');
	process.env.VOICEBOX_SESSION_SECRET = original;
});

test('session status: hard expiry and inactivity are enforced server-side', () => {
	const base = { accountId: 'acct-1', startedAt: T0, lastSeenAt: T0 };
	assert.equal(sessionStatus(base, T0 + 60_000), 'active');
	assert.equal(sessionStatus(base, T0 + IDLE_LIMIT_MS), 'idle');
	assert.equal(sessionStatus({ ...base, lastSeenAt: T0 + SESSION_MAX_MS - 1000 }, T0 + SESSION_MAX_MS), 'expired');
	assert.equal(sessionStatus(null, T0), 'none');
});

test('login failures use one generic message', () => {
	assert.match(GENERIC_LOGIN_ERROR, /Email or password is incorrect/);
	assert.equal(/not found|unknown|no such/i.test(GENERIC_LOGIN_ERROR), false, 'must not reveal whether the email exists');
});

// ---------------------------------------------------------------------------
// Access-control rules (the logic the SQL scoping is built from)
// ---------------------------------------------------------------------------

const manager = account({ department: 'Design' });
const otherManager = account({ id: 'acct-2', department: 'Engineering' });
const admin = account({ id: 'acct-3', role: 'admin', department: 'People & Culture' });

test('scoping: a manager sees only their own department', () => {
	const items = [item({ id: 'design', department: 'Design' }), item({ id: 'eng', department: 'Engineering' }), item({ id: 'ops', department: 'Operations' })];
	assert.deepEqual(scopeForStaff(items, manager).map((f) => f.id), ['design']);
	assert.deepEqual(scopeForStaff(items, otherManager).map((f) => f.id), ['eng']);
});

test('scoping: a manager never sees a confidential report, even in their department', () => {
	const items = [item({ id: 'normal', department: 'Design' }), item({ id: 'secret', department: 'Design', category: 'Confidential report' })];
	assert.deepEqual(scopeForStaff(items, manager).map((f) => f.id), ['normal']);
});

test('scoping: Admin/HR sees every department and confidential reports', () => {
	const items = [
		item({ id: 'design', department: 'Design' }),
		item({ id: 'eng', department: 'Engineering' }),
		item({ id: 'secret', department: 'Design', category: 'Confidential report' })
	];
	assert.equal(scopeForStaff(items, admin).length, 3);
});

test('scoping: an employee account matches nothing in the staff feed', () => {
	assert.deepEqual(scopeForStaff([item()], account({ role: 'employee' })), []);
});

test('per-item access: guessing an id does not grant access', () => {
	assert.equal(canAccessItem(item({ department: 'Design' }), manager), true);
	assert.equal(canAccessItem(item({ department: 'Engineering' }), manager), false, 'another department is refused');
	assert.equal(canAccessItem(item({ department: 'Design', category: 'Confidential report' }), manager), false, 'confidential is refused');
	assert.equal(canAccessItem(item({ department: 'Engineering', category: 'Confidential report' }), admin), true);
	assert.equal(visibleToStaff(item(), account({ role: 'employee' })), false);
});

test('role helpers', () => {
	assert.equal(isStaff(account({ role: 'manager' })), true);
	assert.equal(isStaff(account({ role: 'admin' })), true);
	assert.equal(isStaff(account({ role: 'employee' })), false);
	assert.equal(isStaff(null), false);
	assert.deepEqual(requiredRoleFor('employee'), ['employee']);
	assert.deepEqual(requiredRoleFor('admin'), ['admin']);
	assert.deepEqual(requiredRoleFor('manager'), ['manager', 'admin']);
});
