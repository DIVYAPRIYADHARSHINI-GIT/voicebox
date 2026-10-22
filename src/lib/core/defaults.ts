// Default settings and the empty database document.
import { CONFIDENTIAL_CATEGORY } from './types.ts';
import type { Database, PulseQuestion, Settings } from './types.ts';
import { DEFAULT_ANONYMITY_THRESHOLD, DEFAULT_SLA, NEGATIVE_WORDS, POSITIVE_WORDS } from './rules.ts';

export const DEPARTMENTS = ['Design', 'Engineering', 'Client Services', 'Operations', 'People & Culture'];

export const CATEGORIES = ['Culture', 'Management', 'Facilities', 'Tools & Process', 'Benefits & Policies', 'Idea', CONFIDENTIAL_CATEGORY];

export const PULSE_QUESTIONS: PulseQuestion[] = [
	{ id: 'q-workload', text: 'My workload this week was manageable.', kind: 'scale5' },
	{ id: 'q-recognition', text: 'I felt recognised for my work this week.', kind: 'scale5' },
	{ id: 'q-support', text: 'I had the support I needed from my team.', kind: 'scale5' },
	{ id: 'q-enps', text: 'How likely are you to recommend working here?', kind: 'nps' },
	{ id: 'q-comment', text: 'Anything you would like to add? (optional)', kind: 'comment' }
];

export function defaultSettings(): Settings {
	return {
		companyName: 'Northwind Studio',
		departments: [...DEPARTMENTS],
		categories: [...CATEGORIES],
		sla: structuredCloneSafe(DEFAULT_SLA),
		anonymityThreshold: DEFAULT_ANONYMITY_THRESHOLD,
		pulseQuestions: PULSE_QUESTIONS.map((q) => ({ ...q })),
		sentimentPositive: [...POSITIVE_WORDS],
		sentimentNegative: [...NEGATIVE_WORDS],
		theme: 'light'
	};
}

export function emptyDatabase(): Database {
	return {
		version: 1,
		settings: defaultSettings(),
		accounts: [],
		feedback: [],
		pulse: [],
		participation: [],
		notifications: [],
		lockouts: {},
		seeded: false
	};
}

function structuredCloneSafe<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
