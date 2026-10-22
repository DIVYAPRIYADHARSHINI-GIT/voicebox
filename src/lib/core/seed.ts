// Sample data for the fictional company "Northwind Studio".
//
// Everything here is invented: people, departments, feedback text and pulse
// answers. No real company, person or incident is referenced. Timestamps are
// generated relative to "now" so the dashboard always has a recent window.
import { CONFIDENTIAL_CATEGORY } from './types.ts';
import type { Account, Database, Feedback, PulseResponse, Role, Status, Priority, Urgency, FeedbackType } from './types.ts';
import { DAY_MS, startOfDay, startOfWeek, weekKey } from './time.ts';
import { estimateSentiment, generateTrackingCode, slaDueDate } from './rules.ts';
import { hashPassword } from './password.ts';
import { emptyDatabase } from './defaults.ts';

export interface DemoAccountSpec {
	name: string;
	email: string;
	password: string;
	role: Role;
	department: string;
	title: string;
	/** Shown in the "Demo accounts" card on the login pages. */
	featured?: boolean;
}

export const DEMO_ACCOUNTS: DemoAccountSpec[] = [
	// Featured (shown on the login cards)
	{ name: 'Asha Ramanathan', email: 'employee@northwind.example', password: 'Employee@123', role: 'employee', department: 'Design', title: 'Product Designer', featured: true },
	{ name: 'Marcus Webb', email: 'manager@northwind.example', password: 'Manager@123', role: 'manager', department: 'Design', title: 'Design Manager', featured: true },
	{ name: 'Priya Varghese', email: 'hr@northwind.example', password: 'Admin@123', role: 'admin', department: 'People & Culture', title: 'Head of People & Culture', featured: true },

	// Additional employees
	{ name: 'Tomas Lindgren', email: 'tomas.l@northwind.example', password: 'Employee@123', role: 'employee', department: 'Engineering', title: 'Backend Engineer' },
	{ name: 'Nadia Okonkwo', email: 'nadia.o@northwind.example', password: 'Employee@123', role: 'employee', department: 'Engineering', title: 'QA Engineer' },
	{ name: 'Rafael Costa', email: 'rafael.c@northwind.example', password: 'Employee@123', role: 'employee', department: 'Engineering', title: 'Frontend Engineer' },
	{ name: 'Lena Fischer', email: 'lena.f@northwind.example', password: 'Employee@123', role: 'employee', department: 'Client Services', title: 'Account Executive' },
	{ name: 'Devi Subramanian', email: 'devi.s@northwind.example', password: 'Employee@123', role: 'employee', department: 'Client Services', title: 'Client Partner' },
	{ name: 'Oliver Grant', email: 'oliver.g@northwind.example', password: 'Employee@123', role: 'employee', department: 'Operations', title: 'Facilities Coordinator' },
	{ name: 'Mei Tanaka', email: 'mei.t@northwind.example', password: 'Employee@123', role: 'employee', department: 'Operations', title: 'Operations Analyst' },
	{ name: 'Samuel Adeyemi', email: 'samuel.a@northwind.example', password: 'Employee@123', role: 'employee', department: 'Design', title: 'Motion Designer' },
	{ name: 'Hana Brecht', email: 'hana.b@northwind.example', password: 'Employee@123', role: 'employee', department: 'Design', title: 'UX Researcher' },
	{ name: 'Ivan Petrov', email: 'ivan.p@northwind.example', password: 'Employee@123', role: 'employee', department: 'People & Culture', title: 'Recruiter' },
	{ name: 'Grace Mwangi', email: 'grace.m@northwind.example', password: 'Employee@123', role: 'employee', department: 'Client Services', title: 'Support Specialist' },
	{ name: 'Yusuf Demir', email: 'yusuf.d@northwind.example', password: 'Employee@123', role: 'employee', department: 'Engineering', title: 'Platform Engineer' },

	// Additional managers
	{ name: 'Elena Duarte', email: 'elena.d@northwind.example', password: 'Manager@123', role: 'manager', department: 'Engineering', title: 'Engineering Manager' },
	{ name: 'Jonah Alder', email: 'jonah.a@northwind.example', password: 'Manager@123', role: 'manager', department: 'Client Services', title: 'Client Services Lead' },
	{ name: 'Sofia Martel', email: 'sofia.m@northwind.example', password: 'Manager@123', role: 'manager', department: 'Operations', title: 'Operations Manager' },
	{ name: 'Daniel Reyes', email: 'daniel.r@northwind.example', password: 'Manager@123', role: 'manager', department: 'People & Culture', title: 'People Partner' }
];

export const FEATURED_EMPLOYEE = DEMO_ACCOUNTS.filter((a) => a.featured && a.role === 'employee');
export const FEATURED_STAFF = DEMO_ACCOUNTS.filter((a) => a.featured && a.role !== 'employee');

let counter = 0;
export function id(prefix: string): string {
	counter += 1;
	const rand = Math.random().toString(36).slice(2, 8);
	return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

/** Deterministic pseudo-random so sample data looks varied but is reproducible per launch. */
function makeRandom(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

interface Spec {
	title: string;
	description: string;
	type: FeedbackType;
	category: string;
	department: string;
	urgency: Urgency;
	anonymous: boolean;
	status: Status;
	priority: Priority;
	daysAgo: number;
	isPublic?: boolean;
	tags?: string[];
	response?: string;
	note?: string;
	owner?: string;
	votes?: number;
	overdue?: boolean;
	declineReason?: string;
}

const SPECS: Spec[] = [
	{
		title: 'Standing desks for the studio floor',
		description:
			'Several of us spend long stretches on detailed layout work. A few height-adjustable desks on the studio floor, bookable for half a day, would make long sessions much easier on the back.',
		type: 'Suggestion', category: 'Facilities', department: 'Design', urgency: 'Medium', anonymous: false, status: 'In progress',
		priority: 'Medium', daysAgo: 24, isPublic: true, tags: ['workspace', 'ergonomics'], votes: 14, owner: 'Sofia Martel',
		response: 'Thanks for raising this. Two adjustable desks are on order and will be bookable from the studio calendar.'
	},
	{
		title: 'Design review feedback was genuinely useful',
		description: 'The new structure for design reviews is clear and kind. Getting written notes before the session means the meeting is spent on decisions instead of recap. Thank you for the change.',
		type: 'Praise', category: 'Management', department: 'Design', urgency: 'Low', anonymous: false, status: 'Resolved',
		priority: 'Low', daysAgo: 31, isPublic: true, tags: ['reviews'], votes: 9,
		response: 'Shared with the whole design team. We are keeping the written-notes-first format.'
	},
	{
		title: 'Build pipeline is slow in the afternoon',
		description:
			'Between 2pm and 5pm our build queue often waits 20 minutes or more. It breaks focus and makes small fixes expensive. Could we look at more runners or splitting the test suite?',
		type: 'Concern', category: 'Tools & Process', department: 'Engineering', urgency: 'High', anonymous: false, status: 'In progress',
		priority: 'High', daysAgo: 12, tags: ['ci', 'tooling'], owner: 'Elena Duarte',
		response: 'We have split the slowest suite and are measuring the queue time this week.'
	},
	{
		title: 'Meeting load leaves no deep work time',
		description:
			'My calendar has back-to-back meetings on three days a week. I end up doing the actual work in the evening. A protected no-meeting block would help a lot.',
		type: 'Concern', category: 'Culture', department: 'Engineering', urgency: 'High', anonymous: true, status: 'Under review',
		priority: 'High', daysAgo: 9, tags: ['meetings', 'focus'], note: 'Third similar report this quarter; raise at the leads sync.'
	},
	{
		title: 'Quiet room for calls is always booked',
		description: 'The single quiet room is booked out most of the day, so client calls happen at desks. Two small phone booths would fix it.',
		type: 'Suggestion', category: 'Facilities', department: 'Client Services', urgency: 'Medium', anonymous: false, status: 'New',
		priority: 'Medium', daysAgo: 4, isPublic: true, tags: ['workspace'], votes: 11
	},
	{
		title: 'Onboarding buddy programme worked well',
		description: 'Having a named buddy in my first two weeks made a real difference. I knew who to ask and never felt stuck for long.',
		type: 'Praise', category: 'Culture', department: 'Engineering', urgency: 'Low', anonymous: false, status: 'Resolved',
		priority: 'Low', daysAgo: 45, isPublic: true, tags: ['onboarding'], votes: 7,
		response: 'The buddy programme is now standard for every new joiner.'
	},
	{
		title: 'Expense reimbursement takes too long',
		description: 'Reimbursements take around six weeks. For travel-heavy months that is a real cash-flow problem for people. A two-week target would be fairer.',
		type: 'Concern', category: 'Benefits & Policies', department: 'Client Services', urgency: 'High', anonymous: true, status: 'In progress',
		priority: 'High', daysAgo: 38, tags: ['expenses', 'finance'], owner: 'Priya Varghese', overdue: true,
		response: 'We are moving to fortnightly reimbursement runs. Next run is on the 15th.'
	},
	{
		title: 'Add a shared component library to the design system',
		description: 'We rebuild the same table and filter patterns in every project. A shared component library with the agreed states would save days per project.',
		type: 'Suggestion', category: 'Tools & Process', department: 'Design', urgency: 'Medium', anonymous: false, status: 'Under review',
		priority: 'Medium', daysAgo: 17, isPublic: true, tags: ['design-system'], votes: 19
	},
	{
		title: 'Air conditioning on the second floor is too cold',
		description: 'The second floor sits around 18 degrees all afternoon. People work in coats. Could the set point be raised a couple of degrees?',
		type: 'Concern', category: 'Facilities', department: 'Operations', urgency: 'Medium', anonymous: false, status: 'Resolved',
		priority: 'Medium', daysAgo: 27, tags: ['facilities', 'comfort'], owner: 'Sofia Martel',
		response: 'The set point is now 21 degrees and the vents near the windows were rebalanced.'
	},
	{
		title: 'More transparency on promotion criteria',
		description: 'It is not clear what separates a mid-level from a senior role here. Written criteria per discipline would help people plan, and help managers be consistent.',
		type: 'Suggestion', category: 'Management', department: 'Engineering', urgency: 'High', anonymous: true, status: 'Under review',
		priority: 'High', daysAgo: 21, tags: ['career', 'progression'], note: 'Drafting a levelling guide with the discipline leads.'
	},
	{
		title: 'Laptop refresh cycle is overdue for QA',
		description: 'The QA machines are four years old and cannot run the emulator suite without thermal throttling. Test runs take twice as long as they should.',
		type: 'Concern', category: 'Tools & Process', department: 'Engineering', urgency: 'High', anonymous: false, status: 'New',
		priority: 'Critical', daysAgo: 6, tags: ['hardware', 'qa'], overdue: true
	},
	{
		title: 'Thank you for the flexible hours during exams',
		description: 'Being able to shift my hours during my evening course made it possible to finish the term. It was handled without any fuss.',
		type: 'Praise', category: 'Benefits & Policies', department: 'Client Services', urgency: 'Low', anonymous: false, status: 'Resolved',
		priority: 'Low', daysAgo: 52, isPublic: true, tags: ['flexibility'], votes: 5,
		response: 'Glad it helped. Flexible study hours are written into the handbook now.'
	},
	{
		title: 'Client handover notes are inconsistent',
		description: 'When an account changes owner the notes vary from a full brief to a single line. A simple handover template would protect the relationship.',
		type: 'Suggestion', category: 'Tools & Process', department: 'Client Services', urgency: 'Medium', anonymous: false, status: 'In progress',
		priority: 'Medium', daysAgo: 15, isPublic: true, tags: ['handover', 'process'], votes: 6, owner: 'Jonah Alder'
	},
	{
		title: 'Bike storage is full by 9am',
		description: 'There are eight bike spaces for a much larger number of cyclists. People chain bikes to the railing, which blocks the fire route.',
		type: 'Concern', category: 'Facilities', department: 'Operations', urgency: 'Medium', anonymous: false, status: 'Under review',
		priority: 'Medium', daysAgo: 11, tags: ['facilities', 'safety']
	},
	{
		title: 'Mentoring circles for junior designers',
		description: 'A monthly small-group session where juniors bring work in progress and two seniors give feedback. Low cost, and it spreads knowledge beyond one-to-ones.',
		type: 'Suggestion', category: 'Culture', department: 'Design', urgency: 'Low', anonymous: false, status: 'New',
		priority: 'Low', daysAgo: 3, isPublic: true, tags: ['mentoring', 'learning'], votes: 13
	},
	{
		title: 'Parental leave policy is hard to find',
		description: 'The policy exists but is three folders deep in the shared drive. A short summary page with the key numbers would save a lot of anxious searching.',
		type: 'Suggestion', category: 'Benefits & Policies', department: 'People & Culture', urgency: 'Medium', anonymous: false, status: 'Resolved',
		priority: 'Medium', daysAgo: 34, isPublic: true, tags: ['policy', 'documentation'], votes: 8,
		response: 'A one-page summary is now linked from the handbook home page.'
	},
	{
		title: 'Sprint scope changes mid-week without discussion',
		description: 'Work is added after planning with no conversation about what comes out. It makes the sprint commitment meaningless and the team cynical.',
		type: 'Concern', category: 'Management', department: 'Engineering', urgency: 'High', anonymous: true, status: 'In progress',
		priority: 'High', daysAgo: 19, tags: ['planning'], owner: 'Elena Duarte', overdue: true,
		note: 'Agreed a written trade-off rule with the product lead.'
	},
	{
		title: 'Kitchen dishwasher has been broken for three weeks',
		description: 'Cups pile up in the sink and the kitchen smells by the afternoon. It has been reported twice through the facilities form.',
		type: 'Concern', category: 'Facilities', department: 'Operations', urgency: 'High', anonymous: false, status: 'Resolved',
		priority: 'High', daysAgo: 29, tags: ['facilities'], owner: 'Oliver Grant',
		response: 'The dishwasher was replaced on Tuesday and a weekly check added to the facilities round.'
	},
	{
		title: 'Give client services a voice in roadmap planning',
		description: 'We hear the same client blockers every week but have no route into roadmap discussions. A standing 15-minute slot would close the loop.',
		type: 'Suggestion', category: 'Management', department: 'Client Services', urgency: 'Medium', anonymous: false, status: 'Under review',
		priority: 'Medium', daysAgo: 13, isPublic: true, tags: ['roadmap'], votes: 10
	},
	{
		title: 'Documentation for the deployment process is out of date',
		description: 'The runbook still references the old pipeline. New engineers follow it, hit errors, and then ask in chat. Updating it would save repeated interruptions.',
		type: 'Concern', category: 'Tools & Process', department: 'Engineering', urgency: 'Medium', anonymous: false, status: 'In progress',
		priority: 'Medium', daysAgo: 8, tags: ['documentation'], owner: 'Yusuf Demir'
	},
	{
		title: 'Recognition for the overnight release support',
		description: 'Two people covered the overnight release window without being asked and stayed calm through a tricky rollback. That deserves to be said out loud.',
		type: 'Praise', category: 'Culture', department: 'Engineering', urgency: 'Low', anonymous: false, status: 'Resolved',
		priority: 'Low', daysAgo: 20, isPublic: true, tags: ['recognition'], votes: 12,
		response: 'Called out at the all-hands and logged for the quarterly recognition round.'
	},
	{
		title: 'Four-day week trial for one quarter',
		description: 'A single quarter trial with clear measures (delivery, client response time, wellbeing) would tell us more than another debate about it.',
		type: 'Suggestion', category: 'Benefits & Policies', department: 'Design', urgency: 'Low', anonymous: true, status: 'Declined',
		priority: 'Low', daysAgo: 60, tags: ['working-hours'],
		declineReason: 'Client coverage commitments for this year make a full trial impractical. Revisit at the next planning cycle.'
	},
	{
		title: 'Better coffee and tea options',
		description: 'The current machine produces something close to coffee. A simple filter setup and a decent decaf would be a small, popular change.',
		type: 'Suggestion', category: 'Facilities', department: 'Operations', urgency: 'Low', anonymous: false, status: 'New',
		priority: 'Low', daysAgo: 2, isPublic: true, tags: ['kitchen'], votes: 17
	},
	{
		title: 'Clearer on-call compensation',
		description: 'On-call weeks are compensated differently depending on who you ask. A single written rule would remove the awkward negotiation.',
		type: 'Concern', category: 'Benefits & Policies', department: 'Engineering', urgency: 'High', anonymous: true, status: 'Under review',
		priority: 'High', daysAgo: 16, tags: ['on-call', 'pay'], note: 'Finance drafting a single rate; legal review next week.'
	},
	{
		title: 'Research findings are not reaching engineering',
		description: 'We run studies and write them up, but the findings rarely make it into the backlog. A short monthly readout to engineering would help.',
		type: 'Suggestion', category: 'Tools & Process', department: 'Design', urgency: 'Medium', anonymous: false, status: 'In progress',
		priority: 'Medium', daysAgo: 22, isPublic: true, tags: ['research'], votes: 8, owner: 'Marcus Webb'
	},
	{
		title: 'Office entry badge readers fail intermittently',
		description: 'The side entrance reader fails roughly once a week and people wait outside until someone opens the door. It is a security as much as a comfort issue.',
		type: 'Concern', category: 'Facilities', department: 'Operations', urgency: 'High', anonymous: false, status: 'In progress',
		priority: 'High', daysAgo: 7, tags: ['security', 'facilities'], owner: 'Sofia Martel'
	},
	{
		title: 'Training budget is unclear per person',
		description: 'Nobody seems to know whether there is a per-person training budget or a shared pot. A clear number would let people plan courses.',
		type: 'Concern', category: 'Benefits & Policies', department: 'Design', urgency: 'Medium', anonymous: false, status: 'New',
		priority: 'Medium', daysAgo: 5, tags: ['learning', 'budget']
	},
	{
		title: 'Weekly demo is the best meeting we have',
		description: 'Short, concrete and open to everyone. It is the one place where the whole studio sees the same picture of progress.',
		type: 'Praise', category: 'Culture', department: 'Client Services', urgency: 'Low', anonymous: false, status: 'Resolved',
		priority: 'Low', daysAgo: 41, isPublic: true, tags: ['meetings'], votes: 6,
		response: 'Keeping the demo as-is and adding captions to the recording.'
	},
	{
		title: 'Accessibility checks should be part of definition of done',
		description: 'We find contrast and focus-order problems at the end of a project when they are expensive. A short checklist per ticket would catch most of them early.',
		type: 'Suggestion', category: 'Tools & Process', department: 'Engineering', urgency: 'Medium', anonymous: false, status: 'Under review',
		priority: 'High', daysAgo: 10, isPublic: true, tags: ['accessibility', 'quality'], votes: 15
	},
	{
		title: 'Desk booking tool double-books the same desk',
		description: 'Two people regularly arrive to the same booked desk. It usually resolves politely but it wastes 10 minutes and someone ends up without a monitor.',
		type: 'Concern', category: 'Tools & Process', department: 'Operations', urgency: 'Medium', anonymous: false, status: 'In progress',
		priority: 'Medium', daysAgo: 14, tags: ['tooling'], owner: 'Mei Tanaka'
	},
	{
		title: 'Share the hiring plan with the wider team',
		description: 'People are asked to interview without knowing what the hiring plan is. Sharing the shape of it would make the time feel purposeful.',
		type: 'Suggestion', category: 'Management', department: 'People & Culture', urgency: 'Low', anonymous: false, status: 'New',
		priority: 'Low', daysAgo: 1, isPublic: true, tags: ['hiring'], votes: 4
	},
	{
		title: 'Return-to-office days are not consistent across teams',
		description: 'One team has fixed Tuesdays, another has none, and collaborative work suffers. A studio-wide anchor day would make in-person time useful.',
		type: 'Concern', category: 'Culture', department: 'Design', urgency: 'Medium', anonymous: true, status: 'Under review',
		priority: 'Medium', daysAgo: 18, tags: ['hybrid'], note: 'Proposal for a Wednesday anchor day going to leadership.'
	},
	{
		title: 'Lighting in the north meeting room is harsh',
		description: 'The overhead lights are very bright and there is no dimmer, which makes long workshops uncomfortable and washes out the screen.',
		type: 'Concern', category: 'Facilities', department: 'Design', urgency: 'Low', anonymous: false, status: 'Resolved',
		priority: 'Low', daysAgo: 36, tags: ['facilities'], owner: 'Oliver Grant',
		response: 'Dimmable fittings were installed and the screen was moved away from the window.'
	},
	{
		title: 'Automated test flakiness erodes trust in the suite',
		description: 'About one in six runs fails for unrelated reasons. People re-run until green, which defeats the point of the suite.',
		type: 'Concern', category: 'Tools & Process', department: 'Engineering', urgency: 'High', anonymous: false, status: 'In progress',
		priority: 'High', daysAgo: 25, tags: ['testing', 'ci'], owner: 'Nadia Okonkwo', overdue: true,
		response: 'The five flakiest tests are quarantined and being rewritten this sprint.'
	},
	{
		title: 'Introduce a small wellbeing allowance',
		description: 'A modest monthly allowance for a gym, classes or equipment would be a visible investment in people and is simple to administer.',
		type: 'Suggestion', category: 'Benefits & Policies', department: 'Operations', urgency: 'Low', anonymous: false, status: 'Under review',
		priority: 'Low', daysAgo: 26, isPublic: true, tags: ['wellbeing', 'benefits'], votes: 16
	},
	{
		title: 'Clear escalation path for client emergencies',
		description: 'When a client issue arrives at 6pm it is unclear who decides. People either over-escalate or wait. A written path with names would fix it.',
		type: 'Suggestion', category: 'Management', department: 'Client Services', urgency: 'High', anonymous: false, status: 'In progress',
		priority: 'High', daysAgo: 23, tags: ['escalation'], owner: 'Jonah Alder'
	},
	{
		title: 'More diverse interview panels',
		description: 'Most panels look the same, which affects both the candidate experience and the decisions. Widening the pool of trained interviewers would help.',
		type: 'Suggestion', category: 'Culture', department: 'People & Culture', urgency: 'Medium', anonymous: false, status: 'In progress',
		priority: 'Medium', daysAgo: 30, isPublic: true, tags: ['hiring', 'inclusion'], votes: 11, owner: 'Daniel Reyes'
	},
	{
		title: 'Shared drive structure is impossible to navigate',
		description: 'Finding a current file means asking in chat. A simple agreed folder structure with an owner per top-level folder would save hours every week.',
		type: 'Concern', category: 'Tools & Process', department: 'Client Services', urgency: 'Medium', anonymous: true, status: 'New',
		priority: 'Medium', daysAgo: 2, tags: ['documentation', 'tooling']
	},
	{
		title: 'Thank you for acting on the pulse survey comments',
		description: 'Seeing the "you said, we did" wall with real changes on it made the survey feel worth answering. Please keep publishing the outcomes.',
		type: 'Praise', category: 'Culture', department: 'Operations', urgency: 'Low', anonymous: false, status: 'Resolved',
		priority: 'Low', daysAgo: 13, isPublic: true, tags: ['feedback-loop'], votes: 9,
		response: 'The wall is updated every month after the triage review.'
	},
	{
		title: 'Noise from the construction next door',
		description: 'Drilling starts around 8am and makes calls difficult on the street-facing side. Noise-cancelling headsets or a temporary room swap would help.',
		type: 'Concern', category: 'Facilities', department: 'Client Services', urgency: 'Medium', anonymous: false, status: 'Under review',
		priority: 'Medium', daysAgo: 5, tags: ['noise', 'facilities']
	},
	{
		title: 'Code review turnaround has improved a lot',
		description: 'Reviews now come back within a day instead of three. Whatever changed in the rota is working and shipping feels much smoother.',
		type: 'Praise', category: 'Tools & Process', department: 'Engineering', urgency: 'Low', anonymous: false, status: 'Resolved',
		priority: 'Low', daysAgo: 9, isPublic: true, tags: ['code-review'], votes: 7,
		response: 'The review rota stays. Thanks for noticing.'
	},
	// Two confidential reports (Admin/HR only).
	{
		title: 'Repeated dismissive comments in a project channel',
		description:
			'A colleague repeatedly dismisses a teammate in the project channel, including comments about their accent. It happens in front of others and has not stopped after a private request.',
		type: 'Concern', category: CONFIDENTIAL_CATEGORY, department: 'Engineering', urgency: 'High', anonymous: true, status: 'Under review',
		priority: 'Critical', daysAgo: 6, tags: ['conduct'],
		note: 'Acknowledged to the reporter through the public response. Handling under the formal conduct process outside this tool.'
	},
	{
		title: 'Concern about expense approvals on a client account',
		description:
			'Expense claims on one client account appear to be approved by the same person who submits them. I may be missing context, but it felt important to raise quietly.',
		type: 'Concern', category: CONFIDENTIAL_CATEGORY, department: 'Client Services', urgency: 'High', anonymous: false, status: 'New',
		priority: 'High', daysAgo: 3, tags: ['finance', 'controls']
	}
];

/** Builds the full sample database (accounts are hashed with PBKDF2). */
export async function buildSampleDatabase(at = Date.now()): Promise<Database> {
	const db = emptyDatabase();
	db.seeded = true;

	// Faster PBKDF2 for the 19 demo accounts so first launch stays snappy;
	// accounts created later use the full iteration count.
	const seedIterations = 10_000;
	const accounts: Account[] = [];
	for (const spec of DEMO_ACCOUNTS) {
		accounts.push({
			id: `acct-${spec.email.split('@')[0].replace(/[^a-z0-9]/g, '-')}`,
			name: spec.name,
			email: spec.email,
			role: spec.role,
			department: spec.department,
			title: spec.title,
			active: true,
			createdAt: at - 200 * DAY_MS,
			cred: await hashPassword(spec.password, seedIterations)
		});
	}
	db.accounts = accounts;

	const employees = accounts.filter((a) => a.role === 'employee');
	const staffByName = new Map(accounts.map((a) => [a.name, a]));
	const rand = makeRandom(20261022);

	db.feedback = SPECS.map((spec, i) => {
		const createdAt = at - spec.daysAgo * DAY_MS + Math.floor(rand() * 8) * 3_600_000;
		const author = spec.anonymous ? undefined : employees[i % employees.length];
		const owner = spec.owner ? staffByName.get(spec.owner) : undefined;
		const sentiment = estimateSentiment(`${spec.title} ${spec.description}`);
		const item: Feedback = {
			id: id('fb'),
			title: spec.title,
			description: spec.description,
			type: spec.type,
			category: spec.category,
			department: spec.department,
			urgency: spec.urgency,
			anonymous: spec.anonymous,
			authorId: spec.anonymous ? undefined : author?.id,
			authorName: spec.anonymous ? undefined : author?.name,
			trackingCode: spec.anonymous ? generateTrackingCode(rand) : undefined,
			createdAt,
			updatedAt: createdAt,
			status: 'New',
			priority: spec.priority,
			sentiment,
			ownerId: owner?.id,
			ownerName: owner?.name,
			tags: spec.tags ?? [],
			isPublic: Boolean(spec.isPublic),
			upvotes: [],
			comments: [],
			responses: [],
			notes: [],
			history: [{ at: createdAt, actorRole: 'submitter', actorName: spec.anonymous ? 'Anonymous' : (author?.name ?? 'Employee'), to: 'New', note: 'Feedback submitted' }],
			readBy: [],
			declineReason: spec.declineReason
		};

		// Upvotes from distinct employees (never from anonymous submissions).
		const votes = Math.min(spec.votes ?? 0, employees.length);
		item.upvotes = employees.slice(0, votes).map((e) => e.id);

		// Walk the status history towards the target status.
		const path: Status[] = [];
		if (spec.status === 'Under review' || spec.status === 'In progress' || spec.status === 'Resolved') path.push('Under review');
		if (spec.status === 'In progress' || spec.status === 'Resolved') path.push('In progress');
		if (spec.status === 'Resolved') path.push('Resolved');
		if (spec.status === 'Declined') path.push('Declined');
		let t = createdAt;
		let prev: Status = 'New';
		for (const to of path) {
			t += (1 + Math.floor(rand() * 4)) * DAY_MS;
			if (t > at) t = at - 3_600_000;
			item.history.push({ at: t, actorRole: 'manager', actorName: owner?.name ?? 'Manager', from: prev, to, note: to === 'Declined' ? (spec.declineReason ?? '') : `Status changed to ${to}` });
			prev = to;
			if (to === 'Resolved') item.resolvedAt = t;
		}
		item.status = spec.status;
		item.updatedAt = t;

		if (spec.response) {
			const respondedAt = Math.min(createdAt + (1 + Math.floor(rand() * 3)) * DAY_MS, at - 3_600_000);
			item.responses.push({
				id: id('resp'),
				at: respondedAt,
				authorRole: owner?.role ?? 'manager',
				authorName: owner?.name ?? 'Marcus Webb',
				text: spec.response
			});
			item.firstResponseAt = respondedAt;
		}
		if (spec.note) {
			item.notes.push({ id: id('note'), at: Math.min(createdAt + DAY_MS, at - 3_600_000), authorId: owner?.id ?? 'acct-manager', authorName: owner?.name ?? 'Marcus Webb', text: spec.note });
		}

		// Some items are deliberately overdue: pull the due date into the past.
		if (spec.overdue) item.dueDate = startOfDay(at) - (2 + Math.floor(rand() * 6)) * DAY_MS;
		else if (rand() < 0.3) item.dueDate = slaDueDate(item);

		// A few items are already read by the department manager.
		if (i % 3 === 0) {
			const mgr = accounts.find((a) => a.role === 'manager' && a.department === spec.department);
			if (mgr) item.readBy = [mgr.id];
		}

		// Comments on a couple of popular ideas (kept simple).
		if (item.isPublic && votes >= 10) {
			item.comments.push({
				id: id('cmt'),
				at: Math.min(createdAt + 2 * DAY_MS, at - 3_600_000),
				authorId: employees[(i + 3) % employees.length].id,
				authorName: employees[(i + 3) % employees.length].name,
				text: 'Strong agree. This comes up in almost every retro.'
			});
		}
		return item;
	});

	// ~8 weeks of pulse responses. Participation markers are stored separately
	// (and only for the current week) so answers cannot be linked to a person.
	const questions = db.settings.pulseQuestions;
	const pulse: PulseResponse[] = [];
	const PULSE_COMMENTS = [
		'Workload was heavy but the team helped.',
		'Good week. Clear priorities and no surprise meetings.',
		'Too many context switches between client work and internal projects.',
		'Recognition in the demo meeting felt genuine.',
		'Still waiting on hardware, which slows testing down.',
		'The new review format saves time.',
		'Office was noisy because of the construction next door.',
		'Felt supported after raising a blocker early.'
	];
	for (let w = 7; w >= 0; w--) {
		const weekStart = startOfWeek(at) - w * 7 * DAY_MS;
		const key = weekKey(weekStart);
		for (const dept of db.settings.departments) {
			// 5 to 9 responses per department per week, so the threshold of 5 passes
			// for departments, while narrow filter combinations do not.
			const count = 5 + Math.floor(rand() * 5);
			for (let i = 0; i < count; i++) {
				const mood = 0.55 + rand() * 0.45 - w * 0.01;
				const scale = () => Math.max(1, Math.min(5, Math.round(mood * 5 + (rand() - 0.5) * 1.6)));
				const scores: Record<string, number> = {};
				for (const q of questions) {
					if (q.kind === 'scale5') scores[q.id] = scale();
					if (q.kind === 'nps') scores[q.id] = Math.max(0, Math.min(10, Math.round(mood * 10 + (rand() - 0.5) * 3)));
				}
				pulse.push({
					id: id('pulse'),
					week: key,
					at: weekStart + Math.floor(rand() * 5) * DAY_MS + 10 * 3_600_000,
					department: dept,
					scores,
					comment: rand() < 0.3 ? PULSE_COMMENTS[Math.floor(rand() * PULSE_COMMENTS.length)] : undefined
				});
			}
		}
	}
	db.pulse = pulse;

	// A small "Design" team sub-group with fewer than 5 responses this week is
	// demonstrated by the threshold test in the UI (filters), not by seeding a
	// fake team, so nothing extra is stored here.

	db.notifications = [];
	return db;
}
