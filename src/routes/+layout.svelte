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
	import ConnectionBanner from '$lib/components/ConnectionBanner.svelte';

	const { children } = $props();

	onMount(() => {
		(async () => {
			await app.init();
			document.getElementById('boot-loader')?.remove();
			if (app.account) {
				await app.loadPortal();
				await app.refreshDerivedNotifications();
			}
		})();

		// Session heartbeat. The SERVER enforces the 8-hour and 15-minute limits;
		// this asks it periodically whether we are still signed in. A plain
		// interval (not a reactive effect) so it cannot loop.
		const timer = setInterval(() => void app.checkSession(), 60_000);
		const activity = () => app.touch();
		for (const ev of ['pointerdown', 'keydown', 'focus'] as const) window.addEventListener(ev, activity, { passive: true });

		// Refresh shared data when the tab regains focus, so a manager sees
		// tickets raised on other devices without a manual reload.
		const onVisible = () => {
			if (document.visibilityState === 'visible' && app.account) void app.loadPortal();
		};
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			clearInterval(timer);
			for (const ev of ['pointerdown', 'keydown', 'focus'] as const) window.removeEventListener(ev, activity);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	// Route protection by role. The server enforces access to the data itself;
	// this is the navigational half, so people land on the right portal.
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
<ConnectionBanner />
{@render children()}
<DemoBadge />
<IdleWarning />
<Toasts />
