<script lang="ts">
	// Admin settings: company, departments, categories, SLA days, anonymity
	// threshold, pulse questions, sentiment keywords, theme and data tools.
	import { app } from '$lib/app.svelte.ts';
	import { PRIORITIES, type Priority, type PulseQuestion } from '$lib/core/types.ts';
	import { downloadBackup } from '$lib/exports.ts';
	import Icon from '$lib/components/Icon.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	let companyName = $state('');
	let departments = $state('');
	let categories = $state('');
	let sla = $state<Record<Priority, { respond: number; resolve: number }>>({ ...app.sla });
	let threshold = $state(5);
	let questions = $state<PulseQuestion[]>([]);
	let positive = $state('');
	let negative = $state('');
	let loaded = $state(false);
	let freshOpen = $state(false);
	let sampleOpen = $state(false);
	let importing = $state(false);
	let busy = $state(false);

	// Load the form from settings once (not a reactive loop: it writes only while !loaded).
	$effect(() => {
		if (loaded || !app.ready) return;
		const s = app.settings;
		companyName = s.companyName;
		departments = s.departments.join('\n');
		categories = s.categories.join('\n');
		sla = JSON.parse(JSON.stringify(app.sla));
		threshold = s.anonymityThreshold;
		questions = s.pulseQuestions.map((q) => ({ ...q }));
		positive = s.sentimentPositive.join(', ');
		negative = s.sentimentNegative.join(', ');
		loaded = true;
	});

	const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
	const words = (s: string) => s.split(/[,\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean);

	async function save() {
		const depts = lines(departments);
		const cats = lines(categories);
		if (!depts.length || !cats.length) {
			app.toast('Departments and categories cannot be empty.', 'error');
			return;
		}
		if (!cats.includes('Confidential report')) cats.push('Confidential report');
		busy = true;
		const res = await app.saveSettings({
			companyName: companyName.trim() || 'Company',
			departments: depts,
			categories: cats,
			sla,
			anonymityThreshold: Math.max(1, Math.min(500, Math.round(threshold))),
			pulseQuestions: questions,
			sentimentPositive: words(positive),
			sentimentNegative: words(negative)
		});
		busy = false;
		app.toast(res.ok ? 'Settings saved for every device.' : (res.error ?? 'Could not save settings.'), res.ok ? 'success' : 'error');
	}

	async function loadSample() {
		sampleOpen = false;
		const res = await app.loadSampleData();
		loaded = false;
		app.toast(res.ok ? 'Sample data loaded for every device.' : (res.error ?? 'Could not load sample data.'), res.ok ? 'success' : 'error');
	}

	async function onImport(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		importing = true;
		const res = await app.importBackup(await file.text());
		importing = false;
		input.value = '';
		loaded = false;
		app.toast(res.ok ? `Backup imported. Imported accounts use the temporary password ${res.tempPassword}.` : (res.error ?? 'Import failed.'), res.ok ? 'success' : 'error');
	}

	async function startFresh() {
		freshOpen = false;
		const res = await app.startFresh();
		if (!res.ok) {
			app.toast(res.error ?? 'Could not clear the data.', 'error');
			return;
		}
		window.location.href = '/manager';
	}
</script>

<svelte:head><title>Settings - VoiceBox</title></svelte:head>

<h1 data-testid="page-title">Settings</h1>
<p style="max-width:66ch">Admin/HR only. Changes apply to the shared dataset and take effect on every device.</p>

<div class="grid-2" style="margin-top:var(--s-4)">
	<div class="card">
		<div class="card-head"><h2>Company</h2></div>
		<div class="field"><label for="s-company">Company name</label><input id="s-company" class="input" bind:value={companyName} data-testid="s-company" /></div>
		<div class="field">
			<label for="s-depts">Departments <span class="hint">one per line</span></label>
			<textarea id="s-depts" class="input" rows="6" bind:value={departments} data-testid="s-departments"></textarea>
		</div>
		<div class="field">
			<label for="s-cats">Categories <span class="hint">one per line</span></label>
			<textarea id="s-cats" class="input" rows="7" bind:value={categories} data-testid="s-categories"></textarea>
			<span class="hint">"Confidential report" is always kept, because it drives the Admin-only visibility rule.</span>
		</div>
		<div class="field">
			<span class="label">Theme</span>
			<div class="row">
				<button class="btn sm" class:primary={app.settings.theme === 'light'} onclick={() => app.setTheme('light')} data-testid="theme-light"><Icon name="sun" size={14} /> Light</button>
				<button class="btn sm" class:primary={app.settings.theme === 'dark'} onclick={() => app.setTheme('dark')} data-testid="theme-dark"><Icon name="moon" size={14} /> Dark</button>
			</div>
		</div>
	</div>

	<div class="card">
		<div class="card-head"><h2>SLA targets</h2><span class="caption">days</span></div>
		<table class="plain">
			<thead><tr><th scope="col">Priority</th><th scope="col">Respond within</th><th scope="col">Resolve within</th></tr></thead>
			<tbody>
				{#each PRIORITIES as p (p)}
					<tr>
						<td>{p}</td>
						<td><input class="input sm-input num" type="number" min="1" max="120" bind:value={sla[p].respond} aria-label="Respond days for {p}" data-testid="sla-respond-{p}" /></td>
						<td><input class="input sm-input num" type="number" min="1" max="365" bind:value={sla[p].resolve} aria-label="Resolve days for {p}" data-testid="sla-resolve-{p}" /></td>
					</tr>
				{/each}
			</tbody>
		</table>

		<hr class="divider" />
		<div class="field">
			<label for="s-threshold">Anonymity threshold</label>
			<input id="s-threshold" class="input sm-input num" type="number" min="1" max="500" bind:value={threshold} data-testid="s-threshold" />
			<span class="hint">
				Pulse and department results are hidden for any group with fewer than this many responses. Default is 5; lowering it
				makes individual answers easier to infer.
			</span>
		</div>

		<hr class="divider" />
		<h3>Notifications</h3>
		<p class="caption">
			VoiceBox does not send email or push notifications. All notifications appear in the in-app bell only, on whichever
			device the person signs in from.
		</p>
	</div>
</div>

<div class="card" style="margin-top:var(--s-4)">
	<div class="card-head"><h2>Pulse questions</h2><span class="caption">three 1-5 questions, one 0-10 eNPS question, one comment</span></div>
	{#each questions as q, i (q.id)}
		<div class="field">
			<label for="q-{q.id}">{q.kind === 'nps' ? 'eNPS question (0-10)' : q.kind === 'comment' ? 'Optional comment prompt' : `Scale question ${i + 1} (1-5)`}</label>
			<input id="q-{q.id}" class="input" value={q.text} oninput={(e) => (questions[i] = { ...q, text: e.currentTarget.value })} data-testid="pulse-q-{i}" />
		</div>
	{/each}
</div>

<div class="grid-2" style="margin-top:var(--s-4)">
	<div class="card">
		<div class="card-head"><h2>Sentiment keywords</h2><span class="caption">bundled lexicon, no AI</span></div>
		<div class="field">
			<label for="s-pos">Positive words <span class="hint">comma separated</span></label>
			<textarea id="s-pos" class="input" rows="4" bind:value={positive} data-testid="s-positive"></textarea>
		</div>
		<div class="field">
			<label for="s-neg">Negative words <span class="hint">comma separated</span></label>
			<textarea id="s-neg" class="input" rows="4" bind:value={negative} data-testid="s-negative"></textarea>
		</div>
	</div>

	<div class="card">
		<div class="card-head"><h2>Data tools</h2></div>
		<p>These tools act on the shared dataset that every device reads.</p>
		<div class="row">
			<button class="btn" onclick={() => void downloadBackup()} data-testid="settings-backup"><Icon name="download" size={15} /> Export backup</button>
			<label class="btn" style="cursor:pointer">
				<Icon name="upload" size={15} />
				{importing ? 'Importing...' : 'Import backup'}
				<input type="file" accept="application/json,.json" onchange={onImport} style="display:none" data-testid="settings-import" />
			</label>
		</div>
		<hr class="divider" />
		<div class="row">
			<button class="btn" onclick={() => (sampleOpen = true)} data-testid="load-sample">Load sample data</button>
			<button class="btn danger" onclick={() => (freshOpen = true)} data-testid="settings-start-fresh"><Icon name="trash" size={15} /> Start fresh</button>
		</div>
		<p class="caption" style="margin-top:var(--s-3)">
			"Load sample data" replaces the shared dataset with the Northwind Studio demo set (19 accounts, ~44 feedback items, 8 weeks of pulse responses) for everyone.
		</p>
	</div>
</div>

<div class="save-bar">
	<button class="btn primary" onclick={() => void save()} disabled={busy} data-testid="save-settings">{busy ? 'Saving...' : 'Save settings'}</button>
</div>

<ConfirmDialog
	open={sampleOpen}
	title="Replace data with the sample set?"
	message="Everything currently stored in this browser will be replaced by the Northwind Studio sample data. Export a backup first if you want to keep it."
	confirmLabel="Load sample data"
	danger
	onconfirm={loadSample}
	oncancel={() => (sampleOpen = false)}
	testid="sample-dialog"
/>

<ConfirmDialog
	open={freshOpen}
	title="Delete all data in this browser?"
	message="Every account, feedback item and pulse response stored in this browser will be removed, and you will be signed out."
	confirmLabel="Delete everything"
	danger
	requireText="DELETE"
	onconfirm={() => void startFresh()}
	oncancel={() => (freshOpen = false)}
	testid="settings-fresh-dialog"
/>

<style>
	h1 {
		margin-bottom: var(--s-2);
	}
	table.plain {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	table.plain th {
		text-align: left;
		font-size: 12px;
		color: var(--text-3);
		padding: var(--s-2) var(--s-2) var(--s-2) 0;
		border-bottom: 1px solid var(--border);
	}
	table.plain td {
		padding: var(--s-2) var(--s-2) var(--s-2) 0;
		border-bottom: 1px solid var(--border);
		color: var(--text-2);
	}
	.sm-input {
		max-width: 110px;
	}
	.card p {
		font-size: 13px;
	}
	.save-bar {
		position: sticky;
		bottom: 0;
		display: flex;
		justify-content: flex-end;
		gap: var(--s-2);
		padding: var(--s-3) 0;
		margin-top: var(--s-4);
		background: linear-gradient(to top, var(--bg) 60%, transparent);
	}
</style>
