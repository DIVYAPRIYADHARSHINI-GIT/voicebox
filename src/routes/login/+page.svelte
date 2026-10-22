<script lang="ts">
	import AuthShell from '$lib/components/AuthShell.svelte';
	import LoginForm from '$lib/components/LoginForm.svelte';
</script>

<svelte:head><title>Employee sign-in - VoiceBox</title></svelte:head>

<AuthShell
	portal="employee"
	heading="Employee sign-in"
	statement="Share what is working and what is not, named or anonymous, and follow exactly what happens to it."
>
	<LoginForm portal="employee" />
</AuthShell>
