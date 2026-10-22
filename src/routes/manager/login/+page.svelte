<script lang="ts">
	import AuthShell from '$lib/components/AuthShell.svelte';
	import LoginForm from '$lib/components/LoginForm.svelte';
</script>

<svelte:head><title>Manager portal sign-in - VoiceBox</title></svelte:head>

<AuthShell
	portal="manager"
	heading="Manager portal"
	statement="Triage feedback for your department, respond publicly, and show the organisation that it led to action."
>
	<LoginForm portal="manager" />
</AuthShell>
