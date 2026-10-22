<script lang="ts">
	// Weekly pulse survey. One response per employee per week; the "already
	// responded" marker is stored separately from the answers so an answer can
	// never be linked back to a person.
	import { app } from '$lib/app.svelte.ts';
	import Icon from '$lib/components/Icon.svelte';

	const questions = $derived(app.pulseQuestions.length ? app.pulseQuestions : app.settings.pulseQuestions);
	const answered = $derived(app.ready && app.hasAnsweredPulse());

	let scores = $state<Record<string, number>>({});
	let comment = $state('');
	let error = $state('');
	let justSent = $state(false);
	let busy = $state(false);

	const required = $derived(questions.filter((q) => q.kind !== 'comment'));
	const complete = $derived(required.every((q) => Number.isFinite(scores[q.id])));

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!complete) {
			error = 'Please answer every scored question.';
			return;
		}
		error = '';
		busy = true;
		const res = await app.submitPulse(scores, comment);
		busy = false;
		if (!res.ok) {
			error = res.error ?? 'Could not record your response.';
			return;
		}
		justSent = true;
		app.toast('Pulse response recorded anonymously.', 'success');
	}
</script>

<svelte:head><title>Pulse survey - VoiceBox</title></svelte:head>

<h1 data-testid="page-title">Weekly pulse</h1>
<p style="max-width:62ch">
	Four short questions, once a week. Your answers are stored with your department only - never your name or account id. The
	"already responded" marker is kept in a separate list, so answers cannot be traced back to you.
</p>

{#if answered || justSent}
	<div class="card" data-testid="pulse-done">
		<div class="row" style="align-items:flex-start; gap:var(--s-4)">
			<span class="tickmark" aria-hidden="true"><Icon name="check" size={20} /></span>
			<div>
				<h2>You have answered this week's pulse</h2>
				<p style="margin:4px 0 0">
					Thank you. The next pulse opens on Monday. Results are published once a group has at least
					{app.settings.anonymityThreshold} responses - below that, VoiceBox shows "Not enough responses to protect anonymity"
					instead of numbers.
				</p>
			</div>
		</div>
	</div>
{:else}
	<form class="card" onsubmit={(e) => void submit(e)} data-testid="pulse-form">
		{#each questions as q (q.id)}
			{#if q.kind === 'scale5'}
				<fieldset class="q">
					<legend>{q.text}</legend>
					<div class="scale" role="radiogroup" aria-label={q.text}>
						{#each [1, 2, 3, 4, 5] as n}
							<label class="opt" class:sel={scores[q.id] === n}>
								<input type="radio" name={q.id} value={n} checked={scores[q.id] === n} onchange={() => (scores = { ...scores, [q.id]: n })} data-testid="{q.id}-{n}" />
								<span class="num">{n}</span>
							</label>
						{/each}
					</div>
					<div class="ends caption"><span>1 - strongly disagree</span><span>5 - strongly agree</span></div>
				</fieldset>
			{:else if q.kind === 'nps'}
				<fieldset class="q">
					<legend>{q.text}</legend>
					<div class="scale nps" role="radiogroup" aria-label={q.text}>
						{#each Array.from({ length: 11 }, (_, i) => i) as n}
							<label class="opt" class:sel={scores[q.id] === n}>
								<input type="radio" name={q.id} value={n} checked={scores[q.id] === n} onchange={() => (scores = { ...scores, [q.id]: n })} data-testid="{q.id}-{n}" />
								<span class="num">{n}</span>
							</label>
						{/each}
					</div>
					<div class="ends caption"><span>0 - not at all likely</span><span>10 - extremely likely</span></div>
				</fieldset>
			{:else}
				<div class="field">
					<label for={q.id}>{q.text}</label>
					<textarea id={q.id} class="input" rows="3" bind:value={comment} maxlength="400" data-testid="pulse-comment"></textarea>
					<span class="hint num">{comment.length}/400</span>
				</div>
			{/if}
		{/each}

		{#if error}<p class="error-text" role="alert" data-testid="pulse-error">{error}</p>{/if}
		<button class="btn primary" type="submit" disabled={busy} data-testid="pulse-submit">{busy ? 'Sending...' : 'Send anonymously'}</button>
	</form>
{/if}

<style>
	h1 {
		margin-bottom: var(--s-2);
	}
	.q {
		border: 0;
		padding: 0;
		margin: 0 0 var(--s-5);
	}
	legend {
		font-weight: 500;
		font-size: 14px;
		padding: 0;
		margin-bottom: var(--s-3);
	}
	.scale {
		display: flex;
		gap: var(--s-2);
		flex-wrap: wrap;
	}
	.opt {
		position: relative;
		cursor: pointer;
	}
	.opt input {
		position: absolute;
		opacity: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		cursor: pointer;
	}
	.opt .num {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 1px solid var(--border-strong);
		border-radius: var(--r);
		background: var(--surface);
		font-weight: 600;
		color: var(--text-2);
		transition: all 0.12s ease;
	}
	.opt:hover .num {
		border-color: var(--teal);
		color: var(--teal);
	}
	.opt.sel .num {
		background: var(--teal);
		border-color: var(--teal);
		color: #fff;
	}
	.opt input:focus-visible + .num {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.nps .opt .num {
		width: 44px;
	}
	.ends {
		display: flex;
		justify-content: space-between;
		margin-top: var(--s-2);
		gap: var(--s-3);
	}
	.tickmark {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--green-050);
		color: var(--green);
		display: grid;
		place-items: center;
		flex: none;
	}
	@media (max-width: 560px) {
		.opt .num,
		.nps .opt .num {
			width: 40px;
			height: 40px;
		}
	}
</style>
