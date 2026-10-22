<script lang="ts">
	// Account menu: name, role, change password, sign out. No role switcher.
	import { goto } from '$app/navigation';
	import { app } from '$lib/app.svelte.ts';
	import { checkPassword } from '$lib/core/password.ts';
	import Icon from './Icon.svelte';
	import Modal from './Modal.svelte';

	interface Props {
		portal: 'employee' | 'manager';
	}
	const { portal }: Props = $props();

	let open = $state(false);
	let pwOpen = $state(false);
	let current = $state('');
	let next = $state('');
	let confirm = $state('');
	let show = $state(false);
	let error = $state('');
	let busy = $state(false);

	const roleLabel = $derived(app.role === 'admin' ? 'Admin/HR' : app.role === 'manager' ? 'Manager' : 'Employee');

	async function changePassword() {
		error = '';
		const check = checkPassword(next, confirm);
		if (!check.ok) {
			error = check.message;
			return;
		}
		busy = true;
		const res = await app.changePassword(app.account!.id, current, next);
		busy = false;
		if (!res.ok) {
			error = res.error ?? 'Could not change the password.';
			return;
		}
		pwOpen = false;
		current = next = confirm = '';
		app.toast('Password changed.', 'success');
	}

	function signOut() {
		app.signOut();
		app.toast('You have been signed out.', 'info');
		void goto(portal === 'manager' ? '/manager/login' : '/login');
	}
</script>

<div class="wrap">
	<button class="trigger" onclick={() => (open = !open)} aria-expanded={open} aria-haspopup="menu" data-testid="profile-menu">
		<span class="avatar" aria-hidden="true">{(app.account?.name ?? '?').slice(0, 1)}</span>
		<Icon name="chevronDown" size={14} />
	</button>
	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="backdrop" onclick={() => (open = false)} onkeydown={(e) => e.key === 'Escape' && (open = false)}></div>
		<div class="menu" role="menu">
			<div class="head">
				<strong>{app.account?.name}</strong>
				<span class="caption">{app.account?.email}</span>
				<span class="pill" style="margin-top:6px">{roleLabel} &middot; {app.account?.department}</span>
			</div>
			<button class="item" role="menuitem" onclick={() => { open = false; pwOpen = true; }} data-testid="open-change-password">
				<Icon name="lock" size={16} /> Change password
			</button>
			<a class="item" role="menuitem" href="/about" onclick={() => (open = false)}><Icon name="shield" size={16} /> About &amp; privacy</a>
			<button class="item danger" role="menuitem" onclick={signOut} data-testid="sign-out"><Icon name="logout" size={16} /> Sign out</button>
		</div>
	{/if}
</div>

<Modal open={pwOpen} title="Change password" description="Passwords are hashed with PBKDF2 in this browser." onclose={() => (pwOpen = false)} testid="change-password-dialog">
	<div class="field">
		<label for="cur-pw">Current password</label>
		<input id="cur-pw" class="input" type={show ? 'text' : 'password'} bind:value={current} data-testid="current-password" autocomplete="current-password" />
	</div>
	<div class="field">
		<label for="new-pw">New password (at least 8 characters)</label>
		<input id="new-pw" class="input" type={show ? 'text' : 'password'} bind:value={next} data-testid="new-password" autocomplete="new-password" />
	</div>
	<div class="field">
		<label for="cfm-pw">Confirm new password</label>
		<input id="cfm-pw" class="input" type={show ? 'text' : 'password'} bind:value={confirm} data-testid="confirm-password" autocomplete="new-password" />
	</div>
	<label class="check"><input type="checkbox" bind:checked={show} /> Show passwords</label>
	{#if error}<p class="error-text" role="alert" data-testid="password-error">{error}</p>{/if}
	{#snippet footer()}
		<button class="btn" onclick={() => (pwOpen = false)}>Cancel</button>
		<button class="btn primary" onclick={changePassword} disabled={busy} data-testid="save-password">{busy ? 'Saving...' : 'Change password'}</button>
	{/snippet}
</Modal>

<style>
	.wrap {
		position: relative;
	}
	.trigger {
		display: flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--r);
		padding: 4px 6px;
		cursor: pointer;
		color: var(--text-2);
		min-height: 40px;
	}
	.trigger:hover {
		border-color: var(--border);
		background: var(--surface-2);
	}
	.avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--navy);
		color: #fff;
		display: grid;
		place-items: center;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		width: 240px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-lg);
		box-shadow: var(--shadow-3);
		z-index: 41;
		overflow: hidden;
	}
	.head {
		padding: var(--s-3);
		border-bottom: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.head strong {
		font-size: 13px;
	}
	.head .caption {
		font-size: 11px;
		word-break: break-all;
	}
	.item {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		width: 100%;
		padding: var(--s-3);
		min-height: 44px;
		background: none;
		border: 0;
		border-bottom: 1px solid var(--border);
		font: inherit;
		font-size: 13px;
		color: var(--text-2);
		cursor: pointer;
		text-align: left;
		text-decoration: none;
	}
	.item:last-child {
		border-bottom: 0;
	}
	.item:hover {
		background: var(--surface-2);
		color: var(--text);
		text-decoration: none;
	}
	.item.danger {
		color: var(--red);
	}
</style>
