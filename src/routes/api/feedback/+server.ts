// GET /api/feedback - the feed for the signed-in account.
//
// Scoping happens in SQL. A manager's query filters by department and excludes
// confidential reports, so restricted rows never leave the database - they are
// not merely hidden in the UI. Anonymous items are stripped of author fields
// before serialisation as a final guarantee.
import type { RequestHandler } from './$types';
import { requireAccount, ok } from '$lib/server/api.ts';
import { listFeedbackForAuthor, listFeedbackForStaff, listOwners, listPublicFeedback, listResolvedWithResponses } from '$lib/server/db.ts';
import { CONFIDENTIAL_CATEGORY, type Feedback } from '$lib/core/types.ts';
import { canBePublic, publicView } from '$lib/core/rules.ts';

/** Employees never receive internal notes, for any item. */
const stripInternal = (item: Feedback): Feedback => ({ ...publicView(item), notes: [] });

export const GET: RequestHandler = async (event) => {
	// 'staff' first: a manager or admin gets the triage feed.
	const staff = await requireAccount(event, 'staff');
	if (!('response' in staff)) {
		const items = await listFeedbackForStaff(staff.account, CONFIDENTIAL_CATEGORY);
		return ok({
			scope: staff.account.role === 'admin' ? 'all' : staff.account.department,
			items: items.map(publicView),
			owners: await listOwners()
		});
	}

	// Otherwise fall through to the employee portal.
	const employee = await requireAccount(event, 'employee');
	if ('response' in employee) return employee.response;
	const { account } = employee;

	const [mine, publicItems, resolved] = await Promise.all([
		listFeedbackForAuthor(account.id),
		listPublicFeedback(),
		listResolvedWithResponses(CONFIDENTIAL_CATEGORY)
	]);

	return ok({
		scope: 'self',
		// Anonymous items are deliberately absent from "mine": nothing links them
		// to an account, which is the point of submitting anonymously.
		mine: mine.map(stripInternal),
		ideas: publicItems.filter((f) => canBePublic(f)).map(stripInternal),
		wall: resolved.map(stripInternal)
	});
};
