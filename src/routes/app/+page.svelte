<script lang="ts">
	import { app } from '$lib/app.svelte.ts';
	import SubmitForm from '$lib/components/SubmitForm.svelte';
</script>

<svelte:head><title>Submit feedback - VoiceBox</title></svelte:head>

<div class="head">
	<h1 data-testid="page-title">Submit feedback</h1>
	<p>
		Praise, a concern or an idea - signed in as {app.account?.name ?? 'you'}, or anonymously. Every item gets a status you
		can follow, and managers respond publicly so the whole team sees what changed.
	</p>
</div>

<SubmitForm />

<style>
	.head {
		margin-bottom: var(--s-5);
		max-width: 62ch;
	}
	.head h1 {
		margin-bottom: var(--s-2);
	}
</style>
