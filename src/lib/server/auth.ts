// Server-side authentication and access control.
//
// WHY THIS REPLACED THE BROWSER-ONLY VERSION
// When every browser held its own data, a client-side "session" was harmless -
// there was nothing to protect but your own copy. Now that one shared database
// backs every device, the server is the only place that can decide who sees
// what. Department scoping and confidential-report visibility are therefore
// enforced in SQL, on data the client never receives.
//
// Sessions are HMAC-signed, HttpOnly cookies: the browser cannot read or forge
// one, and the account is re-read on every request so deactivating an account
// takes effect immediately.
import { createHmac, timingSafeEqual as nodeTimingSafeEqual, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import type { Account, Feedback, Role } from '../core/types.ts';
import { IDLE_LIMIT_MS, SESSION_MAX_MS, visibleToStaff } from '../core/rules.ts';
import { verifyPassword } from '../core/password.ts';
import { accountByEmail, accountById } from './db.ts';

export const SESSION_COOKIE = 'voicebox_session';

/**
 * Dev fallback keeps `npm run dev` working without a local secret; production
 * always has VOICEBOX_SESSION_SECRET injected.
 */
const secret = (): string => process.env.VOICEBOX_SESSION_SECRET ?? 'voicebox-insecure-dev-secret-do-not-use-in-production';

export interface SessionPayload {
	accountId: string;
	/** Session start, for the 8-hour hard expiry. */
	startedAt: number;
	/** Last activity, for the 15-minute inactivity sign-out. */
	lastSeenAt: number;
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

function sign(data: string): string {
	return createHmac('sha256', secret()).update(data).digest('base64url');
}

export function encodeSession(payload: SessionPayload): string {
	const body = b64url(JSON.stringify(payload));
	return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined): SessionPayload | null {
	if (!token) return null;
	const [body, mac] = token.split('.');
	if (!body || !mac) return null;
	const expected = sign(body);
	// Constant-time comparison, guarding against length-mismatch throws.
	const a = Buffer.from(mac);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !nodeTimingSafeEqual(a, b)) return null;
	try {
		const parsed = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
		if (!parsed?.accountId || !parsed.startedAt || !parsed.lastSeenAt) return null;
		return parsed;
	} catch {
		return null;
	}
}

export type SessionStatus = 'active' | 'expired' | 'idle' | 'none';

export function sessionStatus(payload: SessionPayload | null, at = Date.now()): SessionStatus {
	if (!payload) return 'none';
	if (at - payload.startedAt >= SESSION_MAX_MS) return 'expired';
	if (at - payload.lastSeenAt >= IDLE_LIMIT_MS) return 'idle';
	return 'active';
}

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: process.env.NODE_ENV === 'production',
	maxAge: Math.floor(SESSION_MAX_MS / 1000)
};

export function setSessionCookie(cookies: Cookies, payload: SessionPayload): void {
	cookies.set(SESSION_COOKIE, encodeSession(payload), COOKIE_OPTIONS);
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export interface AuthResult {
	account: Account | null;
	status: SessionStatus;
	/** Human-readable reason when the session ended, shown on the login page. */
	reason?: string;
}

/**
 * Resolves the signed-in account for a request and refreshes the inactivity
 * clock. The account is looked up fresh every time, so a deactivated account
 * loses access immediately even with a valid cookie.
 */
export async function authenticate(cookies: Cookies, at = Date.now()): Promise<AuthResult> {
	const payload = decodeSession(cookies.get(SESSION_COOKIE));
	const status = sessionStatus(payload, at);

	if (status !== 'active') {
		if (payload) clearSessionCookie(cookies);
		return {
			account: null,
			status,
			reason:
				status === 'expired'
					? 'Your session expired after 8 hours. Please sign in again.'
					: status === 'idle'
						? 'You were signed out after 15 minutes of inactivity.'
						: undefined
		};
	}

	const account = await accountById(payload!.accountId);
	if (!account?.active) {
		clearSessionCookie(cookies);
		return { account: null, status: 'none', reason: 'That account is no longer active.' };
	}

	// Slide the inactivity window forward on genuine activity.
	setSessionCookie(cookies, { ...payload!, lastSeenAt: at });
	return { account, status: 'active' };
}

/** Generic failure message: never reveals whether an email exists. */
export const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';

export async function verifyCredentials(email: string, password: string): Promise<Account | null> {
	const account = await accountByEmail(email);
	if (!account?.active) {
		// Still spend time hashing so a missing account is not detectably faster.
		await verifyPassword(password, {
			alg: 'PBKDF2-SHA256',
			iterations: 10_000,
			salt: b64url(randomBytes(16)),
			hash: b64url(randomBytes(32))
		});
		return null;
	}
	return (await verifyPassword(password, account.cred)) ? account : null;
}

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

export const isStaff = (account: Account | null): boolean => account?.role === 'manager' || account?.role === 'admin';

/** Whether a staff member may act on one specific item. */
export function canAccessItem(item: Feedback, account: Account): boolean {
	return visibleToStaff(item, account);
}

export const requiredRoleFor = (area: 'employee' | 'manager' | 'admin'): Role[] =>
	area === 'employee' ? ['employee'] : area === 'admin' ? ['admin'] : ['manager', 'admin'];
