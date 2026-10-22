<script lang="ts">
	import '../app.css';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { app } from '$lib/app.svelte.ts';
	import { guard } from '$lib/core/rules.ts';
	import Toasts from '$lib/components/Toasts.svelte';
	import DemoBadge from '$lib/components/DemoBadge.svelte';
	import IdleWarning from '$lib/components/IdleWarning.svelte';

	const { children } = $props();

	onMount(() => {
		(async () => {
			await app.init();
			document.getElementById('boot-loader')?.remove();
			app.refreshDerivedNotifications();
		})();

		// Session heartbeat: hard expiry at 8 hours, inactivity sign-out at 15
		// minutes. A plain interval (not a reactive effect) so it cannot loop.
		const timer = setInterval(() => app.checkSession(), 20_000);
		const activity = () => app.touch();
		for (const ev of ['pointerdown', 'keydown', 'focus'] as const) window.addEventListener(ev, activity, { passive: true });
		return () => {
			clearInterval(timer);
			for (const ev of ['pointerdown', 'keydown', 'focus'] as const) window.removeEventListener(ev, activity);
		};
	});

	// Route protection by role. Runs on every navigation once data is ready.
	//
	// The effect depends ONLY on the path and the role. Everything it writes
	// (redirectMessage, toasts, navigation) happens inside `untrack`, so the
	// effect can never re-trigger itself - that was a real reactive loop.
	$effect(() => {
		if (!app.ready) return;
		const path = page.url.pathname;
		const role = app.role;
		untrack(() => {
			const adminOnly = ['/manager/settings', '/manager/accounts'].some((p) => path.startsWith(p));
			const result = guard(path, role, adminOnly);
			if (result.allow || !result.redirect) return;
			// A message already set by the session watchdog ("expired after 8 hours",
			// "signed out after inactivity") is more specific than the generic guard
			// message, so it wins.
			if (!app.redirectMessage) app.redirectMessage = result.message ?? '';
			if (result.message) app.toast(result.message, 'warn');
			void goto(result.redirect, { replaceState: true });
		});
	});
</script>

<a class="skip-link" href="#main">Skip to main content</a>
{@render children()}
<DemoBadge />
<IdleWarning />
<Toasts />
