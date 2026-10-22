// Password hashing with Web Crypto PBKDF2-SHA256 and a per-user random salt.
//
// DEMO-MODE HONESTY: this runs entirely in the browser and the hash is stored in
// localStorage. Anyone with access to the browser profile can read the hash and
// attempt offline cracking. It is good enough to keep plain-text passwords out of
// storage for a demo, but real deployments need server-side authentication.
import type { Credential } from './types.ts';

export const PBKDF2_ITERATIONS = 120_000;
export const MIN_PASSWORD_LENGTH = 8;

const subtle = () => {
	const c = globalThis.crypto;
	if (!c?.subtle) throw new Error('Web Crypto is not available in this browser.');
	return c.subtle;
};

const b64 = (buf: ArrayBuffer | Uint8Array): string => {
	const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
};

const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function randomSalt(bytes = 16): Uint8Array {
	const out = new Uint8Array(bytes);
	globalThis.crypto.getRandomValues(out);
	return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
	const key = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await subtle().deriveBits({ name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' }, key, 256);
	return b64(bits);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<Credential> {
	const salt = randomSalt();
	return { alg: 'PBKDF2-SHA256', iterations, salt: b64(salt), hash: await derive(password, salt, iterations) };
}

export async function verifyPassword(password: string, cred: Credential | undefined): Promise<boolean> {
	if (!cred?.salt || !cred.hash) return false;
	try {
		const got = await derive(password, unb64(cred.salt), cred.iterations || PBKDF2_ITERATIONS);
		return timingSafeEqual(got, cred.hash);
	} catch {
		return false;
	}
}

/** Constant-time-ish string compare (same length strings from base64 of fixed-size digests). */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export interface PasswordCheck {
	ok: boolean;
	message: string;
}

/** Password rules: at least 8 characters. Kept deliberately simple and explicit. */
export function checkPassword(password: string, confirm?: string): PasswordCheck {
	if (!password) return { ok: false, message: 'Enter a password.' };
	if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, message: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
	if (confirm !== undefined && password !== confirm) return { ok: false, message: 'The two passwords do not match.' };
	return { ok: true, message: 'Password looks good.' };
}

/** Rough strength label for the inline meter (not a security control). */
export function passwordStrength(password: string): 'weak' | 'fair' | 'strong' {
	let score = 0;
	if (password.length >= 8) score++;
	if (password.length >= 12) score++;
	if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
	if (/\d/.test(password)) score++;
	if (/[^A-Za-z0-9]/.test(password)) score++;
	if (score <= 2) return 'weak';
	if (score <= 3) return 'fair';
	return 'strong';
}
