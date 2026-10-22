<script lang="ts">
	// Shows the anonymous tracking code with a copy button. The code cannot be
	// recovered: nothing links it back to a person, by design.
	import { app } from '$lib/app.svelte.ts';
	import Icon from './Icon.svelte';

	interface Props {
		code: string;
	}
	const { code }: Props = $props();

	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			app.toast('Tracking code copied.', 'success');
			setTimeout(() => (copied = false), 2500);
		} catch {
			app.toast('Copy failed - please select the code and copy it manually.', 'warn');
		}
	}
</script>

<div class="code-box" data-testid="tracking-code-box">
	<div class="label">
		<Icon name="lock" size={14} />
		<span>Your tracking code</span>
	</div>
	<div class="row">
		<code class="code mono" data-testid="tracking-code">{code}</code>
		<button class="btn sm" onclick={copy} data-testid="copy-code">
			<Icon name="copy" size={14} />
			{copied ? 'Copied' : 'Copy'}
		</button>
	</div>
	<p>
		<strong>Save this code now.</strong> It is the only way to check the status and public responses for an anonymous
		submission, and it cannot be recovered - VoiceBox stores nothing that links the code to you. Use
		<a href="/track">Track by code</a> whenever you want an update.
	</p>
</div>

<style>
	.code-box {
		border: 1px solid var(--teal);
		background: var(--teal-050);
		border-radius: var(--r);
		padding: var(--s-4);
		margin: var(--s-4) 0;
	}
	.label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--teal);
		margin-bottom: var(--s-2);
	}
	.code {
		font-size: 20px;
		font-weight: 500;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-sm);
		padding: var(--s-2) var(--s-3);
		letter-spacing: 0.16em;
		user-select: all;
	}
	p {
		margin: var(--s-3) 0 0;
		font-size: 12px;
		color: var(--text-2);
	}
</style>
