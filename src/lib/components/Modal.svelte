<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		wide?: boolean;
		onclose: () => void;
		children: Snippet;
		footer?: Snippet;
		testid?: string;
	}
	const { open, title, description, wide = false, onclose, children, footer, testid }: Props = $props();

	let dialogEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (open && dialogEl) {
			const focusable = dialogEl.querySelector<HTMLElement>('[data-autofocus], button, input, select, textarea, a[href]');
			focusable?.focus();
		}
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onclose();
			return;
		}
		if (e.key !== 'Tab' || !dialogEl) return;
		// Simple focus trap.
		const nodes = [...dialogEl.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]')].filter((n) => !n.hasAttribute('disabled'));
		if (!nodes.length) return;
		const first = nodes[0];
		const last = nodes[nodes.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()} onkeydown={onkeydown}>
		<div
			class="dialog"
			class:wide
			role="dialog"
			aria-modal="true"
			aria-label={title}
			bind:this={dialogEl}
			data-testid={testid}
		>
			<div class="head">
				<div>
					<h2>{title}</h2>
					{#if description}<p class="caption" style="margin:4px 0 0">{description}</p>{/if}
				</div>
				<button class="btn ghost icon" onclick={onclose} aria-label="Close dialog"><Icon name="close" size={16} /></button>
			</div>
			<div class="body">{@render children()}</div>
			{#if footer}<div class="foot">{@render footer()}</div>{/if}
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(20, 33, 61, 0.45);
		display: grid;
		place-items: center;
		padding: var(--s-4);
		z-index: 70;
		animation: fade 0.12s ease;
	}
	.dialog {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-lg);
		box-shadow: var(--shadow-3);
		width: min(520px, 100%);
		max-height: calc(100vh - 32px);
		display: flex;
		flex-direction: column;
	}
	.dialog.wide {
		width: min(760px, 100%);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--s-3);
		padding: var(--s-4) var(--s-5);
		border-bottom: 1px solid var(--border);
	}
	.body {
		padding: var(--s-5);
		overflow: auto;
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		gap: var(--s-2);
		padding: var(--s-4) var(--s-5);
		border-top: 1px solid var(--border);
		background: var(--surface-2);
		border-radius: 0 0 var(--r-lg) var(--r-lg);
		flex-wrap: wrap;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
</style>
