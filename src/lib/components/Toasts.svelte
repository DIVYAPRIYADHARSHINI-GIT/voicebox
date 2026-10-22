<script lang="ts">
	import { app } from '$lib/app.svelte.ts';
	import Icon from './Icon.svelte';

	const iconFor = (tone: string) => (tone === 'success' ? 'check' : tone === 'error' ? 'warn' : tone === 'warn' ? 'warn' : 'info');
</script>

<div class="toasts" aria-live="polite" aria-atomic="false" data-testid="toasts">
	{#each app.toasts as t (t.id)}
		<div class="toast {t.tone}" role="status">
			<Icon name={iconFor(t.tone)} size={16} />
			<span>{t.text}</span>
			<button class="x" onclick={() => app.dismiss(t.id)} aria-label="Dismiss message"><Icon name="close" size={14} /></button>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		right: var(--s-4);
		bottom: var(--s-4);
		z-index: 60;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		max-width: min(380px, calc(100vw - 32px));
	}
	.toast {
		display: flex;
		align-items: flex-start;
		gap: var(--s-2);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-left: 3px solid var(--text-3);
		border-radius: var(--r);
		box-shadow: var(--shadow-3);
		padding: var(--s-3);
		font-size: 13px;
		color: var(--text);
		animation: slide-in 0.16s ease;
	}
	.toast.success {
		border-left-color: var(--green);
		color: var(--text);
	}
	.toast.success :global(.icon) {
		color: var(--green);
	}
	.toast.error {
		border-left-color: var(--red);
	}
	.toast.error :global(.icon) {
		color: var(--red);
	}
	.toast.warn {
		border-left-color: var(--amber);
	}
	.toast.warn :global(.icon) {
		color: var(--amber);
	}
	.toast.info :global(.icon) {
		color: var(--teal);
	}
	.toast span {
		flex: 1;
	}
	.x {
		background: none;
		border: 0;
		color: var(--text-3);
		cursor: pointer;
		padding: 2px;
		display: flex;
	}
	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
</style>
