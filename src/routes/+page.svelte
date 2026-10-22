<script lang="ts">
	// Landing: sends people to the right portal. No role switcher anywhere.
	import { app } from '$lib/app.svelte.ts';
	import Icon from '$lib/components/Icon.svelte';
	import BrandArt from '$lib/components/BrandArt.svelte';
</script>

<svelte:head><title>VoiceBox - Speak up. See it through.</title></svelte:head>

<div class="landing" id="main">
	<header>
		<span class="logo" aria-hidden="true"><Icon name="voice" size={20} /></span>
		<div>
			<div class="wordmark">VoiceBox</div>
			<div class="caption">Speak up. See it through.</div>
		</div>
		<span class="spacer"></span>
		<button class="btn ghost icon" onclick={() => app.toggleTheme()} aria-label="Switch between light and dark theme">
			<Icon name={app.settings.theme === 'dark' ? 'sun' : 'moon'} size={16} />
		</button>
	</header>

	<main>
		<div class="hero">
			<h1 data-testid="page-title">Office feedback that leads somewhere</h1>
			<p>
				Employees share praise, concerns and ideas - named or anonymous - and can follow exactly what happens next.
				Managers triage, respond and report in their own portal.
			</p>
			<div class="row">
				<a class="btn primary" href="/login" data-testid="go-employee">Employee sign-in</a>
				<a class="btn" href="/manager/login" data-testid="go-manager">Manager portal</a>
			</div>
			<div class="secondary">
				<a href="/anonymous">Submit anonymous feedback without signing in</a>
				<a href="/track">Track feedback with a code</a>
				<a href="/about">About, privacy and demo-mode limits</a>
			</div>
		</div>
		<div class="art" aria-hidden="true">
			<BrandArt variant="employee" />
		</div>
	</main>
</div>

<style>
	.landing {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--navy);
		color: #fff;
	}
	header {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-4) var(--s-5);
		border-bottom: 1px solid rgba(255, 255, 255, 0.12);
	}
	.logo {
		width: 36px;
		height: 36px;
		border-radius: var(--r);
		display: grid;
		place-items: center;
		background: var(--teal);
		color: #fff;
	}
	.wordmark {
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	header .caption {
		color: rgba(255, 255, 255, 0.6);
	}
	header .btn {
		color: #fff;
	}
	header .btn:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
	}
	main {
		flex: 1;
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		align-items: center;
		gap: var(--s-6);
		padding: var(--s-7) var(--s-6);
		max-width: 1140px;
		margin: 0 auto;
		width: 100%;
	}
	h1 {
		color: #fff;
		font-size: 34px;
		line-height: 1.15;
		margin-bottom: var(--s-4);
		max-width: 16ch;
	}
	.hero p {
		color: rgba(255, 255, 255, 0.78);
		font-size: 15px;
		max-width: 48ch;
		margin-bottom: var(--s-5);
	}
	.secondary {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		margin-top: var(--s-5);
		font-size: 13px;
	}
	.secondary a {
		color: rgba(255, 255, 255, 0.72);
	}
	.secondary a:hover {
		color: #fff;
	}
	.art {
		display: grid;
		place-items: center;
	}
	@media (max-width: 860px) {
		main {
			grid-template-columns: minmax(0, 1fr);
			padding: var(--s-5) var(--s-4) var(--s-7);
		}
		h1 {
			font-size: 26px;
		}
		.art {
			order: -1;
		}
	}
</style>
