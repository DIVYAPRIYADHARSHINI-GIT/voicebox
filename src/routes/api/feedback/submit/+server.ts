// POST /api/feedback/submit - create feedback in the SHARED database.
//
// This is the route that fixes the reported problem: a ticket raised on any
// device is written to one shared database, so it appears in the manager portal
// on every other device immediately.
//
// Anonymous submissions are accepted without a session. Named submissions
// require one, and the author is taken from the SERVER-side session - never
// from the request body - so nobody can submit feedback as someone else.
import type { RequestHandler } from './$types';
import { authenticate } from '$lib/server/auth.ts';
import { dbReady } from '$lib/server/guards.ts';
import { bool, ensureSeeded, fail, ok, readJson, str } from '$lib/server/api.ts';
import { getSettings, insertFeedback, listAccounts } from '$lib/server/db.ts';
import { notify } from '$lib/server/notify.ts';
import { CONFIDENTIAL_CATEGORY, type Feedback, type FeedbackType, type Urgency } from '$lib/core/types.ts';
import { canBePublic, estimateSentiment, generateTrackingCode, validateDraft } from '$lib/core/rules.ts';
import { id } from '$lib/core/seed.ts';

interface Body {
	title?: unknown;
	description?: unknown;
	type?: unknown;
	category?: unknown;
	department?: unknown;
	urgency?: unknown;
	anonymous?: unknown;
	makePublic?: unknown;
	confidentialAck?: unknown;
}

const TYPES: FeedbackType[] = ['Praise', 'Concern', 'Suggestion'];
const URGENCIES: Urgency[] = ['Low', 'Medium', 'High'];

export const POST: RequestHandler = async (event) => {
	const notReady = dbReady();
	if (notReady) return notReady;

	const body = await readJson<Body>(event, 200_000);
	if (!body) return fail('Request body must be valid JSON.');

	try {
		await ensureSeeded();
	} catch (e) {
		return fail(`The shared database is unreachable: ${e instanceof Error ? e.message : String(e)}`, 503);
	}

	const title = str(body.title, 200);
	const description = str(body.description, 4000);
	const type = TYPES.includes(body.type as FeedbackType) ? (body.type as FeedbackType) : 'Suggestion';
	const category = str(body.category, 120);
	const urgency = URGENCIES.includes(body.urgency as Urgency) ? (body.urgency as Urgency) : 'Medium';
	const anonymous = bool(body.anonymous);
	const requestedPublic = bool(body.makePublic);

	const auth = await authenticate(event.cookies);

	// Named feedback requires a signed-in employee.
	if (!anonymous && !auth.account) return fail('Sign in to submit named feedback, or submit anonymously.', 401);
	if (!anonymous && auth.account && auth.account.role !== 'employee') {
		return fail('Manager accounts use the manager portal. Sign out to submit feedback as an employee.', 403);
	}

	const check = validateDraft({ title, description, category, urgency, confidentialAck: bool(body.confidentialAck) });
	if (!check.ok) return fail('Please check the form.', 422, { errors: check.errors });

	const settings = await getSettings();
	if (!settings.categories.includes(category)) return fail('Please check the form.', 422, { errors: { category: 'Choose a valid category.' } });

	const requestedDept = str(body.department, 120);
	const department =
		(settings.departments.includes(requestedDept) ? requestedDept : '') || (anonymous ? '' : (auth.account?.department ?? '')) || 'Unspecified';

	const at = Date.now();
	const sentiment = estimateSentiment(`${title} ${description}`, settings.sentimentPositive, settings.sentimentNegative);

	const item: Feedback = {
		id: id('fb'),
		title,
		description,
		type,
		category,
		department,
		urgency,
		anonymous,
		// Author comes from the session, and is omitted entirely when anonymous.
		authorId: anonymous ? undefined : auth.account!.id,
		authorName: anonymous ? undefined : auth.account!.name,
		trackingCode: anonymous ? generateTrackingCode() : undefined,
		createdAt: at,
		updatedAt: at,
		status: 'New',
		priority: urgency === 'High' ? 'High' : urgency === 'Medium' ? 'Medium' : 'Low',
		sentiment,
		tags: [],
		isPublic: requestedPublic && canBePublic({ category, type }),
		upvotes: [],
		comments: [],
		responses: [],
		notes: [],
		history: [
			{ at, actorRole: 'submitter', actorName: anonymous ? 'Anonymous' : (auth.account!.name ?? 'Employee'), to: 'New', note: 'Feedback submitted' }
		],
		readBy: []
	};

	await insertFeedback(item);

	// Notify the people who can actually see it: department managers, plus
	// Admin/HR (who also receive confidential reports).
	const accounts = await listAccounts();
	const recipients = accounts.filter(
		(a) => a.active && (a.role === 'admin' || (a.role === 'manager' && a.department === department && category !== CONFIDENTIAL_CATEGORY))
	);
	await Promise.all(recipients.map((r) => notify(r.id, 'status', `New ${type.toLowerCase()} in ${department}: ${title}`, `/manager?item=${item.id}`, at)));

	return ok({ item });
};
