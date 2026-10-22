<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
</script>

<svelte:head><title>Page not found - VoiceBox</title></svelte:head>

<div class="wrap" id="main">
	<div class="card">
		<span class="mark" aria-hidden="true"><Icon name="search" size={24} /></span>
		<h1 data-testid="page-title">{page.status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
		<p>
			{page.status === 404
				? 'That page does not exist in VoiceBox. It may have been renamed, or the link may be incomplete.'
				: (page.error?.message ?? 'An unexpected error occurred. Your data in this browser has not been changed.')}
		</p>
		<div class="row" style="justify-content:center">
			<a class="btn primary" href="/">Back to the start page</a>
			<a class="btn" href="/login">Employee sign-in</a>
			<a class="btn" href="/manager/login">Manager portal</a>
		</div>
	</div>
</div>

<style>
	.wrap {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: var(--s-5);
		background: var(--bg);
	}
	.card {
		max-width: 520px;
		text-align: center;
	}
	.mark {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: var(--surface-2);
		border: 1px solid var(--border);
		color: var(--text-3);
		display: inline-grid;
		place-items: center;
		margin-bottom: var(--s-4);
	}
	h1 {
		margin-bottom: var(--s-2);
	}
</style>
