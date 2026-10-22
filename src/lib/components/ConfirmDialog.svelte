<script lang="ts">
	// Confirmation for destructive actions and sensitive exports.
	import Modal from './Modal.svelte';

	interface Props {
		open: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		danger?: boolean;
		/** Require typing a word (e.g. DELETE) before confirming. */
		requireText?: string;
		onconfirm: () => void;
		oncancel: () => void;
		testid?: string;
	}
	const { open, title, message, confirmLabel = 'Confirm', danger = false, requireText, onconfirm, oncancel, testid = 'confirm-dialog' }: Props = $props();

	let typed = $state('');
	const ready = $derived(!requireText || typed.trim().toUpperCase() === requireText.toUpperCase());

	$effect(() => {
		if (open) typed = '';
	});
</script>

<Modal {open} {title} onclose={oncancel} {testid}>
	<p>{message}</p>
	{#if requireText}
		<div class="field">
			<label for="confirm-text">Type <strong>{requireText}</strong> to continue</label>
			<input id="confirm-text" class="input mono" bind:value={typed} data-testid="confirm-text" autocomplete="off" data-autofocus />
		</div>
	{/if}
	{#snippet footer()}
		<button class="btn" onclick={oncancel} data-testid="confirm-cancel">Cancel</button>
		<button class="btn" class:danger class:primary={!danger} disabled={!ready} onclick={onconfirm} data-testid="confirm-ok">{confirmLabel}</button>
	{/snippet}
</Modal>
