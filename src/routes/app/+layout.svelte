<script lang="ts">
	// Employee portal shell: left sidebar on desktop, bottom tab bar on mobile.
	import { page } from '$app/state';
	import { app } from '$lib/app.svelte.ts';
	import Icon from '$lib/components/Icon.svelte';
	import ProfileMenu from '$lib/components/ProfileMenu.svelte';
	import NotificationBell from '$lib/components/NotificationBell.svelte';

	const { children } = $props();

	const nav = [
		{ href: '/app', label: 'Submit feedback', icon: 'plus', exact: true },
		{ href: '/app/my-feedback', label: 'My feedback', icon: 'inbox' },
		{ href: '/app/ideas', label: 'Ideas board', icon: 'idea' },
		{ href: '/app/you-said', label: 'You said, we did', icon: 'check' },
		{ href: '/app/pulse', label: 'Pulse survey', icon: 'pulse' },
		{ href: '/track', label: 'Track by code', icon: 'search' }
	];

	const active = (href: string, exact = false) => (exact ? page.url.pathname === href : page.url.pathname.startsWith(href));
</script>

<div class="shell">
	<aside class="sidebar">
		<a class="brand" href="/app">
			<span class="logo" aria-hidden="true"><Icon name="voice" size={18} /></span>
			<span>
				<span class="wordmark">VoiceBox</span>
				<span class="caption">Employee portal</span>
			</span>
		</a>
		<nav aria-label="Employee portal">
			{#each nav as n (n.href)}
				<a class="nav-item" class:active={active(n.href, n.exact)} href={n.href} aria-current={active(n.href, n.exact) ? 'page' : undefined}>
					<Icon name={n.icon} size={17} />
					<span>{n.label}</span>
				</a>
			{/each}
		</nav>
		<div class="side-foot">
			<a class="nav-item" href="/about"><Icon name="shield" size={17} /><span>About &amp; privacy</span></a>
		</div>
	</aside>

	<div class="body">
		<header class="topbar">
			<div class="who">
				<strong>{app.account?.name ?? ''}</strong>
				<span class="caption">{app.account?.department ?? ''}</span>
			</div>
			<span class="spacer"></span>
			<button class="btn ghost icon" onclick={() => app.toggleTheme()} aria-label="Switch between light and dark theme">
				<Icon name={app.settings.theme === 'dark' ? 'sun' : 'moon'} size={16} />
			</button>
			<NotificationBell />
			<ProfileMenu portal="employee" />
		</header>

		<main id="main" class="content">
			{@render children()}
		</main>
	</div>

	<nav class="tabbar" aria-label="Employee portal (mobile)">
		{#each nav.slice(0, 5) as n (n.href)}
			<a class="tab" class:active={active(n.href, n.exact)} href={n.href} aria-current={active(n.href, n.exact) ? 'page' : undefined}>
				<Icon name={n.icon} size={19} />
				<span>{n.label.split(' ')[0]}</span>
			</a>
		{/each}
	</nav>
</div>

<style>
	.shell {
		display: grid;
		grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
		min-height: 100vh;
	}
	.sidebar {
		background: var(--navy);
		color: #fff;
		display: flex;
		flex-direction: column;
		padding: var(--s-4) var(--s-3);
		gap: var(--s-5);
		position: sticky;
		top: 0;
		height: 100vh;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2);
		color: #fff;
		text-decoration: none;
	}
	.brand:hover {
		text-decoration: none;
	}
	.logo {
		width: 32px;
		height: 32px;
		border-radius: var(--r);
		display: grid;
		place-items: center;
		background: var(--teal);
		flex: none;
	}
	.wordmark {
		display: block;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.brand .caption {
		display: block;
		color: rgba(255, 255, 255, 0.6);
		font-size: 11px;
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
	}
	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2) var(--s-3);
		min-height: 40px;
		border-radius: var(--r);
		color: rgba(255, 255, 255, 0.76);
		font-size: 13px;
		font-weight: 500;
		text-decoration: none;
		transition: background-color 0.12s ease, color 0.12s ease;
	}
	.nav-item:hover {
		background: rgba(255, 255, 255, 0.08);
		color: #fff;
		text-decoration: none;
	}
	.nav-item.active {
		background: var(--teal);
		color: #fff;
	}
	.side-foot {
		border-top: 1px solid rgba(255, 255, 255, 0.12);
		padding-top: var(--s-3);
	}
	.body {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.topbar {
		height: var(--topbar-h);
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: 0 var(--s-5);
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.who {
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}
	.who strong {
		font-size: 13px;
	}
	.who .caption {
		font-size: 11px;
	}
	.content {
		padding: var(--s-5);
		max-width: 1080px;
		width: 100%;
		margin: 0 auto;
		flex: 1;
	}
	.tabbar {
		display: none;
	}
	@media (max-width: 860px) {
		.shell {
			grid-template-columns: minmax(0, 1fr);
		}
		.sidebar {
			display: none;
		}
		.content {
			padding: var(--s-4) var(--s-3) 84px;
		}
		.topbar {
			padding: 0 var(--s-3);
		}
		.tabbar {
			display: grid;
			grid-template-columns: repeat(5, 1fr);
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			background: var(--surface);
			border-top: 1px solid var(--border);
			z-index: 30;
		}
		.tab {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 2px;
			min-height: 56px;
			font-size: 10px;
			color: var(--text-3);
			text-decoration: none;
			font-weight: 500;
		}
		.tab.active {
			color: var(--teal);
		}
	}
</style>
