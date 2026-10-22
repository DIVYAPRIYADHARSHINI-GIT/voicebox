<script lang="ts">
	// In-app notifications only. There is no server, so no email or push.
	import { app } from '$lib/app.svelte.ts';
	import { relative } from '$lib/core/time.ts';
	import Icon from './Icon.svelte';

	let open = $state(false);
	const items = $derived(app.myNotifications.slice(0, 30));
</script>

<div class="wrap">
	<button class="btn ghost icon" onclick={() => (open = !open)} aria-expanded={open} aria-label="Notifications ({app.unreadCount} unread)" data-testid="bell">
		<Icon name="bell" size={17} />
		{#if app.unreadCount > 0}<span class="count num" data-testid="bell-count">{app.unreadCount > 99 ? '99+' : app.unreadCount}</span>{/if}
	</button>

	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="backdrop" onclick={() => (open = false)} onkeydown={(e) => e.key === 'Escape' && (open = false)}></div>
		<div class="panel-pop" role="region" aria-label="Notifications" data-testid="bell-panel">
			<div class="head">
				<strong>Notifications</strong>
				<button class="btn sm ghost" onclick={() => app.markAllNotificationsRead()} data-testid="mark-all-read">Mark all read</button>
			</div>
			{#if items.length === 0}
				<p class="empty caption" style="padding:var(--s-5)">Nothing yet. You will be notified when your feedback changes status or gets a response.</p>
			{:else}
				<ul>
					{#each items as n (n.id)}
						<li class:unread={!n.read}>
							<a href={n.href} onclick={() => { app.markNotificationRead(n.id); open = false; }}>
								<span class="kind"><Icon name={n.kind === 'overdue' ? 'warn' : n.kind === 'pulse' ? 'pulse' : n.kind === 'assigned' ? 'user' : 'inbox'} size={14} /></span>
								<span class="text">
									{n.text}
									<span class="caption">{relative(n.at)}</span>
								</span>
								{#if !n.read}<span class="unread-dot" aria-label="Unread"></span>{/if}
							</a>
						</li>
					{/each}
				</ul>
			{/if}
			<p class="foot caption">In-app only: there is no server in demo mode, so VoiceBox cannot send email or push notifications.</p>
		</div>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
	}
	.btn {
		position: relative;
	}
	.count {
		position: absolute;
		top: 2px;
		right: 0;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: 999px;
		background: var(--red);
		color: #fff;
		font-size: 10px;
		font-weight: 700;
		display: grid;
		place-items: center;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
	}
	.panel-pop {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		width: min(360px, calc(100vw - 24px));
		max-height: 70vh;
		overflow: auto;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-lg);
		box-shadow: var(--shadow-3);
		z-index: 41;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--s-3);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		background: var(--surface);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li a {
		display: flex;
		gap: var(--s-2);
		align-items: flex-start;
		padding: var(--s-3);
		border-bottom: 1px solid var(--border);
		color: var(--text-2);
		font-size: 13px;
		text-decoration: none;
	}
	li a:hover {
		background: var(--surface-2);
		text-decoration: none;
	}
	li.unread a {
		background: var(--teal-050);
	}
	.kind {
		color: var(--text-3);
		margin-top: 2px;
	}
	.text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.foot {
		padding: var(--s-3);
		margin: 0;
		font-size: 11px;
		border-top: 1px solid var(--border);
	}
</style>
