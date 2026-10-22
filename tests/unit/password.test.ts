// Password hashing and verification. Node 22+ exposes the same Web Crypto API
// the browser uses, so these tests exercise the production code path.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	MIN_PASSWORD_LENGTH,
	checkPassword,
	hashPassword,
	passwordStrength,
	randomSalt,
	timingSafeEqual,
	verifyPassword
} from '../../src/lib/core/password.ts';

// Lower iteration count keeps the suite fast; production uses 120,000.
const FAST = 1000;

test('hashing: never stores the plain password', async () => {
	const cred = await hashPassword('Employee@123', FAST);
	assert.equal(cred.alg, 'PBKDF2-SHA256');
	assert.equal(cred.iterations, FAST);
	assert.ok(cred.salt.length > 0);
	assert.ok(cred.hash.length > 0);
	assert.equal(cred.hash.includes('Employee@123'), false);
	assert.equal(JSON.stringify(cred).includes('Employee@123'), false);
});

test('hashing: the same password with a new salt gives a different hash', async () => {
	const a = await hashPassword('Employee@123', FAST);
	const b = await hashPassword('Employee@123', FAST);
	assert.notEqual(a.salt, b.salt, 'each user gets a fresh random salt');
	assert.notEqual(a.hash, b.hash);
});

test('verification: the correct password verifies, a wrong one does not', async () => {
	const cred = await hashPassword('Manager@123', FAST);
	assert.equal(await verifyPassword('Manager@123', cred), true);
	assert.equal(await verifyPassword('manager@123', cred), false, 'passwords are case sensitive');
	assert.equal(await verifyPassword('Manager@1234', cred), false);
	assert.equal(await verifyPassword('', cred), false);
});

test('verification: a missing or damaged credential fails safely', async () => {
	assert.equal(await verifyPassword('anything', undefined), false);
	assert.equal(await verifyPassword('anything', { alg: 'PBKDF2-SHA256', iterations: FAST, salt: '', hash: '' }), false);
	assert.equal(await verifyPassword('anything', { alg: 'PBKDF2-SHA256', iterations: FAST, salt: 'not-base64!!', hash: 'x' }), false);
});

test('verification: iterations are read from the stored credential', async () => {
	const cred = await hashPassword('Admin@123', 2000);
	assert.equal(cred.iterations, 2000);
	assert.equal(await verifyPassword('Admin@123', cred), true);
});

test('salt: random bytes of the requested length', () => {
	const s = randomSalt(16);
	assert.equal(s.length, 16);
	assert.notDeepEqual([...s], [...randomSalt(16)]);
});

test('compare: length and content mismatches are rejected', () => {
	assert.equal(timingSafeEqual('abc', 'abc'), true);
	assert.equal(timingSafeEqual('abc', 'abd'), false);
	assert.equal(timingSafeEqual('abc', 'abcd'), false);
});

test('rules: at least 8 characters', () => {
	assert.equal(checkPassword('short1').ok, false);
	assert.equal(checkPassword('12345678').ok, true);
	assert.equal(checkPassword('').ok, false);
	assert.match(checkPassword('abc').message, new RegExp(String(MIN_PASSWORD_LENGTH)));
});

test('rules: confirmation must match when provided', () => {
	assert.equal(checkPassword('Employee@123', 'Employee@123').ok, true);
	const mismatch = checkPassword('Employee@123', 'Employee@124');
	assert.equal(mismatch.ok, false);
	assert.match(mismatch.message, /do not match/i);
});

test('strength: rough labels for the inline meter', () => {
	assert.equal(passwordStrength('abcdefgh'), 'weak');
	assert.equal(passwordStrength('Abcdefgh1'), 'fair');
	assert.equal(passwordStrength('Employee@123'), 'strong');
});
