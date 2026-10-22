<script lang="ts">
	// Split sign-in layout: brand panel left, form card right.
	// Employee and manager portals share the structure but differ in heading and
	// accent so a user always knows which portal they are in.
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import BrandArt from './BrandArt.svelte';

	interface Props {
		portal: 'employee' | 'manager';
		heading: string;
		statement: string;
		children: Snippet;
	}
	const { portal, heading, statement, children }: Props = $props();
</script>

<div class="auth" data-portal={portal}>
	<aside class="brand">
		<div class="brand-top">
			<span class="logo" aria-hidden="true"><Icon name="voice" size={22} /></span>
			<div>
				<div class="wordmark">VoiceBox</div>
				<div class="tag">Speak up. See it through.</div>
			</div>
		</div>
		<div class="art">
			<BrandArt variant={portal} />
		</div>
		<div class="brand-bottom">
			<p class="statement">{statement}</p>
			<p class="company">Northwind Studio &middot; {portal === 'manager' ? 'Manager portal' : 'Employee portal'}</p>
		</div>
	</aside>

	<main class="form-side" id="main">
		<div class="form-card">
			<div class="portal-tag" data-testid="portal-tag">
				<Icon name={portal === 'manager' ? 'shield' : 'user'} size={14} />
				{portal === 'manager' ? 'Manager portal' : 'Employee portal'}
			</div>
			<h1 data-testid="page-title">{heading}</h1>
			{@render children()}
		</div>
	</main>
</div>

<style>
	.auth {
		min-height: 100vh;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		background: var(--bg);
	}
	.brand {
		background: var(--navy);
		color: #fff;
		padding: var(--s-7) var(--s-6);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--s-6);
	}
	.auth[data-portal='manager'] .brand {
		background: linear-gradient(180deg, var(--navy) 0%, #0d1830 100%);
	}
	.brand-top {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}
	.logo {
		width: 40px;
		height: 40px;
		border-radius: var(--r);
		display: grid;
		place-items: center;
		background: var(--teal);
		color: #fff;
		flex: none;
	}
	.auth[data-portal='manager'] .logo {
		background: #fff;
		color: var(--navy);
	}
	.wordmark {
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.tag {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.68);
	}
	.art {
		display: grid;
		place-items: center;
		flex: 1;
		min-height: 180px;
	}
	.statement {
		color: rgba(255, 255, 255, 0.86);
		font-size: 15px;
		max-width: 38ch;
		margin-bottom: var(--s-2);
	}
	.company {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.55);
		margin: 0;
	}
	.form-side {
		display: grid;
		place-items: center;
		padding: var(--s-6) var(--s-5);
	}
	.form-card {
		width: min(420px, 100%);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-lg);
		box-shadow: var(--shadow-2);
		padding: var(--s-6);
	}
	.portal-tag {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--teal);
		margin-bottom: var(--s-3);
	}
	.auth[data-portal='manager'] .portal-tag {
		color: var(--navy-500);
	}
	.form-card h1 {
		margin-bottom: var(--s-5);
	}
	@media (max-width: 860px) {
		.auth {
			grid-template-columns: minmax(0, 1fr);
		}
		.brand {
			padding: var(--s-5) var(--s-4);
			gap: var(--s-4);
		}
		.art {
			min-height: 120px;
		}
		.art :global(svg) {
			max-height: 130px;
		}
		.form-side {
			padding: var(--s-5) var(--s-4) var(--s-7);
		}
		.form-card {
			padding: var(--s-5);
			border: 1px solid var(--border);
		}
	}
</style>
