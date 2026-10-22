<script lang="ts">
	// Shared sign-in form for both portals: generic errors, show/hide password,
	// 5-attempt lockout for 5 minutes, and the demo-accounts card.
	import { goto } from '$app/navigation';
	import { app } from '$lib/app.svelte.ts';
	import { DEMO_ACCOUNTS } from '$lib/core/seed.ts';
	import Icon from './Icon.svelte';

	interface Props {
		portal: 'employee' | 'manager';
	}
	const { portal }: Props = $props();

	let email = $state('');
	let password = $state('');
	let show = $state(false);
	let busy = $state(false);
	let error = $state('');
	let demoOpen = $state(false);
	// The lockout is enforced on the server (it must be, with shared data), so
	// the UI reflects what the last sign-in attempt reported.
	let lockedMinutes = $state(0);
	let lockedUntil = $state(0);
	let tick = $state(Date.now());

	$effect(() => {
		if (!lockedUntil) return;
		const t = setInterval(() => (tick = Date.now()), 1000);
		return () => clearInterval(t);
	});

	const locked = $derived(lockedUntil > tick);
	const secondsLeft = $derived(Math.max(0, Math.ceil((lockedUntil - tick) / 1000)));

	const demos = $derived(DEMO_ACCOUNTS.filter((a) => (portal === 'manager' ? a.role !== 'employee' : a.role === 'employee')).filter((a) => a.featured));

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		error = '';
		busy = true;
		const res = await app.signIn(email, password, portal);
		busy = false;
		if (!res.ok) {
			error = res.error ?? 'Email or password is incorrect.';
			password = '';
			const mins = /in (\d+) minute/.exec(error)?.[1];
			if (mins) {
				lockedMinutes = Number(mins);
				lockedUntil = Date.now() + Number(mins) * 60_000;
				tick = Date.now();
			} else if (/locked for 5 minutes/.test(error)) {
				lockedMinutes = 5;
				lockedUntil = Date.now() + 5 * 60_000;
				tick = Date.now();
			}
			return;
		}
		app.toast(`Signed in as ${app.account?.name}`, 'success');
		await goto(portal === 'manager' ? '/manager' : '/app');
	}

	function useDemo(demoEmail: string, demoPassword: string) {
		email = demoEmail;
		password = demoPassword;
		error = '';
	}
</script>

{#if app.redirectMessage}
	<div class="notice warn" style="margin-bottom:var(--s-4)" role="status" data-testid="redirect-message">
		<Icon name="info" size={16} />
		<span>{app.redirectMessage}</span>
	</div>
{/if}

<form onsubmit={submit} novalidate data-testid="login-form">
	<div class="field">
		<label for="email">Work email</label>
		<input
			id="email"
			class="input"
			type="email"
			bind:value={email}
			autocomplete="username"
			required
			placeholder="you@northwind.example"
			data-testid="login-email"
			aria-invalid={error ? 'true' : undefined}
		/>
	</div>

	<div class="field">
		<label for="password">Password</label>
		<div class="pw">
			<input
				id="password"
				class="input"
				type={show ? 'text' : 'password'}
				bind:value={password}
				autocomplete="current-password"
				required
				data-testid="login-password"
				aria-invalid={error ? 'true' : undefined}
			/>
			<button type="button" class="toggle" onclick={() => (show = !show)} aria-label={show ? 'Hide password' : 'Show password'} data-testid="toggle-password">
				{show ? 'Hide' : 'Show'}
			</button>
		</div>
	</div>

	{#if error}
		<p class="error-text" role="alert" data-testid="login-error" style="margin:0 0 var(--s-3)">{error}</p>
	{/if}

	{#if locked}
		<div class="notice danger" style="margin-bottom:var(--s-3)" role="alert" data-testid="lockout-notice">
			<Icon name="lock" size={16} />
			<span>Sign-in is locked for this email. Try again in {secondsLeft} second(s).</span>
		</div>
	{/if}

	<button class="btn primary block" type="submit" disabled={busy || locked} data-testid="login-submit">
		{busy ? 'Checking...' : 'Sign in'}
	</button>
</form>

<div class="demo-note">
	<Icon name="info" size={14} />
	<p>
		Demo accounts are shared by everyone using this deployment. Passwords are PBKDF2-hashed and verified on the server,
		but this is still a <strong>demo</strong>: the accounts are public, so do not store anything confidential in it.
	</p>
</div>

<details class="demo-card" bind:open={demoOpen} data-testid="demo-accounts">
	<summary>
		<span>Demo accounts</span>
		<span class="pill">Demo only</span>
	</summary>
	<ul>
		{#each demos as d (d.email)}
			<li>
				<div>
					<div class="who">{d.name} &middot; <span class="caption">{d.role === 'admin' ? 'Admin/HR' : d.role === 'manager' ? 'Manager' : 'Employee'}</span></div>
					<div class="creds mono">{d.email} / {d.password}</div>
				</div>
				<button class="btn sm" type="button" onclick={() => useDemo(d.email, d.password)} aria-label="Fill the form with the demo account for {d.name}" data-testid="use-demo-{d.role}">
					Use
				</button>
			</li>
		{/each}
	</ul>
	<p class="caption" style="margin:var(--s-2) 0 0">
		More demo accounts exist across all five departments (14 employees, 5 managers/HR). Passwords follow the same pattern.
	</p>
</details>

{#if portal === 'employee'}
	<div class="links">
		<a href="/anonymous" data-testid="link-anonymous">Submit anonymous feedback without signing in</a>
		<a href="/track" data-testid="link-track">Track feedback with a code</a>
		<a href="/manager/login" data-testid="link-manager-login">Manager portal sign-in</a>
	</div>
{:else}
	<div class="links">
		<a href="/login" data-testid="link-employee-login">Back to employee sign-in</a>
		<a href="/about">About VoiceBox and privacy</a>
	</div>
{/if}

<style>
	.pw {
		position: relative;
		display: flex;
	}
	.pw .input {
		padding-right: 64px;
	}
	.toggle {
		position: absolute;
		right: 2px;
		top: 2px;
		bottom: 2px;
		min-height: 40px;
		border: 0;
		background: transparent;
		color: var(--teal);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		padding: 0 var(--s-2);
		border-radius: var(--r-sm);
	}
	.toggle:hover {
		background: var(--surface-2);
	}
	.demo-note {
		display: flex;
		gap: var(--s-2);
		margin-top: var(--s-4);
		padding-top: var(--s-4);
		border-top: 1px solid var(--border);
		color: var(--text-3);
	}
	.demo-note p {
		font-size: 12px;
		margin: 0;
		color: var(--text-3);
	}
	.demo-card {
		margin-top: var(--s-4);
		border: 1px solid var(--border);
		border-radius: var(--r);
		background: var(--surface-2);
	}
	.demo-card summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
		padding: var(--s-3);
		cursor: pointer;
		font-size: 13px;
		font-weight: 500;
		min-height: 44px;
		list-style: none;
	}
	.demo-card summary::-webkit-details-marker {
		display: none;
	}
	.demo-card ul {
		list-style: none;
		margin: 0;
		padding: 0 var(--s-3) var(--s-3);
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.demo-card li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-sm);
		padding: var(--s-2) var(--s-3);
	}
	.who {
		font-size: 13px;
		font-weight: 500;
	}
	.creds {
		font-size: 11px;
		color: var(--text-3);
		word-break: break-all;
	}
	.links {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		margin-top: var(--s-4);
		font-size: 13px;
	}
	@media (pointer: coarse) {
		/* WCAG target size on touch devices. */
		.toggle {
			min-height: 44px;
		}
		.demo-card li .btn {
			min-width: 56px;
		}
	}
</style>
