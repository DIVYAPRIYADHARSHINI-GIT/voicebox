<script lang="ts">
	// Shown when the shared store is unreachable or unconfigured. Visible
	// failure matters here: silently falling back to local-only data is what
	// made tickets invisible across devices in the first place.
	import { app } from '$lib/app.svelte.ts';
	import Icon from './Icon.svelte';
</script>

{#if app.connectionError}
	<div class="banner" role="alert" data-testid="connection-banner">
		<Icon name="warn" size={16} />
		<span>{app.connectionError}</span>
		<button class="btn sm" onclick={() => { void app.refreshIdentity(); void app.loadPortal(); }} data-testid="retry-connection">Retry</button>
	</div>
{/if}

<style>
	.banner {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2) var(--s-4);
		background: var(--red-050);
		color: var(--red);
		border-bottom: 1px solid var(--red);
		font-size: 13px;
		position: sticky;
		top: 0;
		z-index: 60;
	}
	.banner span {
		flex: 1;
	}
</style>
