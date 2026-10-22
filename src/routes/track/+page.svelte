<script lang="ts">
	// Track by code: anyone with the code can see status and public responses,
	// without signing in. Internal notes are never shown here.
	import { app } from '$lib/app.svelte.ts';
	import { isValidTrackingCode } from '$lib/core/rules.ts';
	import { formatDate, formatDateTime } from '$lib/core/time.ts';
	import type { Feedback } from '$lib/core/types.ts';
	import Icon from '$lib/components/Icon.svelte';
	import Pill from '$lib/components/Pill.svelte';
	import FeedbackTimeline from '$lib/components/FeedbackTimeline.svelte';

	let code = $state('');
	let result = $state<Feedback | null>(null);
	let error = $state('');
	let searched = $state(false);

	function lookup(e: SubmitEvent) {
		e.preventDefault();
		searched = true;
		error = '';
		result = null;
		if (!isValidTrackingCode(code)) {
			error = 'A tracking code is 10 characters. Check the code and try again.';
			return;
		}
		const found = app.findByCode(code);
		if (!found) {
			error = 'No feedback was found for that code in this browser. Codes cannot be recovered, and demo data is stored per browser.';
			return;
		}
		result = found;
	}
</script>

<svelte:head><title>Track feedback - VoiceBox</title></svelte:head>

<div class="public-page">
	<header class="bar">
		<a class="brand" href="/">
			<span class="logo" aria-hidden="true"><Icon name="voice" size={18} /></span>
			<span><span class="wordmark">VoiceBox</span><span class="caption">Speak up. See it through.</span></span>
		</a>
		<span class="spacer"></span>
		<button class="btn ghost icon" onclick={() => app.toggleTheme()} aria-label="Switch between light and dark theme">
			<Icon name={app.settings.theme === 'dark' ? 'sun' : 'moon'} size={16} />
		</button>
		<a class="btn sm" href="/login">Employee sign-in</a>
	</header>

	<main id="main" class="wrap">
		<h1 data-testid="page-title">Track feedback with a code</h1>
		<p style="max-width:62ch">
			Enter the 10-character code you were given after submitting anonymously. You will see the current status and any
			public responses. No sign-in required.
		</p>

		<form class="card" onsubmit={lookup} data-testid="track-form">
			<div class="field" style="margin-bottom:var(--s-3)">
				<label for="code">Tracking code</label>
				<input
					id="code"
					class="input mono"
					style="font-size:17px; letter-spacing:0.14em; text-transform:uppercase"
					bind:value={code}
					maxlength="14"
					placeholder="ABCD234XYZ"
					autocomplete="off"
					spellcheck="false"
					data-testid="track-code"
					aria-invalid={error ? 'true' : undefined}
				/>
			</div>
			{#if error}<p class="error-text" role="alert" data-testid="track-error" style="margin:0 0 var(--s-3)">{error}</p>{/if}
			<button class="btn primary" type="submit" data-testid="track-submit">Check status</button>
		</form>

		{#if result}
			<article class="card" data-testid="track-result">
				<div class="row" style="justify-content:space-between; align-items:flex-start">
					<div>
						<h2>{result.title}</h2>
						<div class="row" style="margin-top:var(--s-2)">
							<Pill kind="status" value={result.status} />
							<Pill kind="plain" value={result.category} />
							<Pill kind="type" value={result.type} />
							<span class="caption">Submitted {formatDate(result.createdAt)}</span>
						</div>
					</div>
					<Pill kind="anon" value="Anonymous" />
				</div>

				<p class="desc">{result.description}</p>

				<h3>Public responses</h3>
				{#if result.responses.length === 0}
					<p class="caption">No response yet. Check back with your code - the status above updates as it is triaged.</p>
				{:else}
					<div class="stack" style="gap:var(--s-2)">
						{#each result.responses as r (r.id)}
							<div class="response" data-testid="track-response">
								<div class="caption">{r.authorName} &middot; {r.authorRole === 'admin' ? 'Admin/HR' : 'Manager'} &middot; {formatDateTime(r.at)}</div>
								<p style="margin:4px 0 0; color:var(--text)">{r.text}</p>
							</div>
						{/each}
					</div>
				{/if}

				{#if result.status === 'Declined' && result.declineReason}
					<div class="notice warn" style="margin-top:var(--s-3)"><Icon name="info" size={16} /><span><strong>Declined:</strong> {result.declineReason}</span></div>
				{/if}

				<h3>Status history</h3>
				<FeedbackTimeline item={result} />
				<p class="caption" style="margin-top:var(--s-3)">Internal notes are never shown on this page.</p>
			</article>
		{:else if searched && !error}
			<div class="card empty"><h3>Nothing found</h3></div>
		{/if}

		<p class="caption" style="margin-top:var(--s-4)">
			Need to send something new? <a href="/anonymous">Submit anonymous feedback</a>.
		</p>
	</main>
</div>

<style>
	.public-page {
		min-height: 100vh;
		background: var(--bg);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-3) var(--s-5);
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		color: var(--text);
		text-decoration: none;
	}
	.logo {
		width: 32px;
		height: 32px;
		border-radius: var(--r);
		background: var(--teal);
		color: #fff;
		display: grid;
		place-items: center;
	}
	.wordmark {
		display: block;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.brand .caption {
		display: block;
		font-size: 11px;
	}
	.wrap {
		max-width: 720px;
		margin: 0 auto;
		padding: var(--s-6) var(--s-4) var(--s-7);
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	h1 {
		margin-bottom: var(--s-2);
	}
	.wrap > p:first-of-type {
		margin-bottom: 0;
	}
	h3 {
		margin: var(--s-4) 0 var(--s-2);
	}
	.desc {
		white-space: pre-wrap;
		margin-top: var(--s-4);
	}
	.response {
		border-left: 2px solid var(--teal);
		background: var(--surface-2);
		padding: var(--s-3);
		border-radius: 0 var(--r) var(--r) 0;
	}
	@media (max-width: 700px) {
		.bar {
			padding: var(--s-3);
		}
		.wrap {
			padding: var(--s-4) var(--s-3) var(--s-7);
		}
	}
</style>
