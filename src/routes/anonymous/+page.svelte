<script lang="ts">
	// Public anonymous submission - no sign-in required, always anonymous.
	import { app } from '$lib/app.svelte.ts';
	import SubmitForm from '$lib/components/SubmitForm.svelte';
	import Icon from '$lib/components/Icon.svelte';
</script>

<svelte:head><title>Anonymous feedback - VoiceBox</title></svelte:head>

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
		<h1 data-testid="page-title">Submit anonymous feedback</h1>
		<p style="max-width:62ch">
			No sign-in and no account needed. Nothing identifying is stored: no name, no email, no account id, no IP address
			(there is no server to record one). You will get a tracking code so you can follow what happens.
		</p>
		<SubmitForm forceAnonymous />
		<p class="caption" style="margin-top:var(--s-4)">
			Already have a code? <a href="/track">Track your feedback</a>.
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
		max-width: 760px;
		margin: 0 auto;
		padding: var(--s-6) var(--s-4) var(--s-7);
	}
	h1 {
		margin-bottom: var(--s-2);
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
