<script lang="ts">
	// Manager portal shell: collapsible sidebar + top bar with name, department,
	// notification bell and sign out. Accounts/Settings appear for Admin/HR only.
	import { page } from '$app/state';
	import { app } from '$lib/app.svelte.ts';
	import Icon from '$lib/components/Icon.svelte';
	import ProfileMenu from '$lib/components/ProfileMenu.svelte';
	import NotificationBell from '$lib/components/NotificationBell.svelte';

	const { children } = $props();

	let collapsed = $state(false);
	let mobileOpen = $state(false);

	const nav = $derived([
		{ href: '/manager', label: 'Feedback Inbox', icon: 'inbox', exact: true },
		{ href: '/manager/board', label: 'Board', icon: 'board' },
		{ href: '/manager/dashboard', label: 'Dashboard', icon: 'dashboard' },
		{ href: '/manager/pulse', label: 'Pulse results', icon: 'pulse' },
		{ href: '/manager/ideas', label: 'Ideas', icon: 'idea' },
		{ href: '/manager/reports', label: 'Reports', icon: 'report' },
		...(app.isAdmin
			? [
					{ href: '/manager/accounts', label: 'Accounts', icon: 'people' },
					{ href: '/manager/settings', label: 'Settings', icon: 'settings' }
				]
			: [])
	]);

	const active = (href: string, exact = false) => (exact ? page.url.pathname === href : page.url.pathname.startsWith(href));
	const roleLabel = $derived(app.role === 'admin' ? 'Admin/HR' : 'Manager');
</script>

<div class="shell" class:collapsed>
	{#if mobileOpen}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="scrim" onclick={() => (mobileOpen = false)} onkeydown={(e) => e.key === 'Escape' && (mobileOpen = false)}></div>
	{/if}

	<aside class="sidebar" class:open={mobileOpen}>
		<div class="brand">
			<span class="logo" aria-hidden="true"><Icon name="voice" size={18} /></span>
			{#if !collapsed}
				<span>
					<span class="wordmark">VoiceBox</span>
					<span class="caption">Manager portal</span>
				</span>
			{/if}
		</div>

		<nav aria-label="Manager portal">
			{#each nav as n (n.href)}
				<a
					class="nav-item"
					class:active={active(n.href, n.exact)}
					href={n.href}
					title={collapsed ? n.label : undefined}
					aria-current={active(n.href, n.exact) ? 'page' : undefined}
					onclick={() => (mobileOpen = false)}
				>
					<Icon name={n.icon} size={17} />
					{#if !collapsed}<span>{n.label}</span>{/if}
				</a>
			{/each}
		</nav>

		<button class="collapse" onclick={() => (collapsed = !collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} data-testid="collapse-sidebar">
			<Icon name={collapsed ? 'chevron' : 'arrowLeft'} size={16} />
			{#if !collapsed}<span>Collapse</span>{/if}
		</button>
	</aside>

	<div class="body">
		<header class="topbar">
			<button class="btn ghost icon mobile-only" onclick={() => (mobileOpen = !mobileOpen)} aria-label="Open navigation" data-testid="open-nav">
				<Icon name="menu" size={18} />
			</button>
			<div class="who">
				<strong data-testid="manager-name">{app.account?.name ?? ''}</strong>
				<span class="caption" data-testid="manager-dept">{roleLabel} &middot; {app.isAdmin ? 'All departments' : (app.account?.department ?? '')}</span>
			</div>
			<span class="spacer"></span>
			<button class="btn ghost icon" onclick={() => app.toggleTheme()} aria-label="Switch between light and dark theme">
				<Icon name={app.settings.theme === 'dark' ? 'sun' : 'moon'} size={16} />
			</button>
			<NotificationBell />
			<ProfileMenu portal="manager" />
		</header>

		<main id="main" class="content">
			{@render children()}
		</main>
	</div>
</div>

<style>
	.shell {
		display: grid;
		grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
		min-height: 100vh;
	}
	.shell.collapsed {
		grid-template-columns: 64px minmax(0, 1fr);
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
	}
	.logo {
		width: 32px;
		height: 32px;
		border-radius: var(--r);
		display: grid;
		place-items: center;
		background: #fff;
		color: var(--navy);
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
	.collapsed .nav-item {
		justify-content: center;
		padding: var(--s-2);
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
	.collapse {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-2) var(--s-3);
		min-height: 40px;
		border: 0;
		border-top: 1px solid rgba(255, 255, 255, 0.12);
		background: none;
		color: rgba(255, 255, 255, 0.6);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
		border-radius: 0;
	}
	.collapsed .collapse {
		justify-content: center;
	}
	.collapse:hover {
		color: #fff;
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
		z-index: 25;
	}
	.who {
		display: flex;
		flex-direction: column;
		line-height: 1.25;
		min-width: 0;
	}
	.who strong {
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.who .caption {
		font-size: 11px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.content {
		padding: var(--s-5);
		flex: 1;
		min-width: 0;
	}
	.mobile-only {
		display: none;
	}
	.scrim {
		display: none;
	}
	@media (max-width: 960px) {
		.shell,
		.shell.collapsed {
			grid-template-columns: minmax(0, 1fr);
		}
		.sidebar {
			position: fixed;
			left: 0;
			top: 0;
			bottom: 0;
			width: var(--sidebar-w);
			z-index: 45;
			transform: translateX(-100%);
			transition: transform 0.16s ease;
			height: 100vh;
		}
		.sidebar.open {
			transform: translateX(0);
		}
		.scrim {
			display: block;
			position: fixed;
			inset: 0;
			background: rgba(20, 33, 61, 0.4);
			z-index: 44;
		}
		.mobile-only {
			display: inline-flex;
		}
		.topbar {
			padding: 0 var(--s-3);
		}
		.content {
			padding: var(--s-4) var(--s-3) var(--s-7);
		}
	}
</style>
