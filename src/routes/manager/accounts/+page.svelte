<script lang="ts">
	// Admin/HR account management: create employee and manager accounts,
	// deactivate accounts and reset passwords. All in-browser, demo only.
	import { app } from '$lib/app.svelte.ts';
	import { checkPassword } from '$lib/core/password.ts';
	import { emailLooksValid } from '$lib/core/rules.ts';
	import { formatDate } from '$lib/core/time.ts';
	import type { Account, Role } from '$lib/core/types.ts';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	let createOpen = $state(false);
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let role = $state<Role>('employee');
	let department = $state('');
	let title = $state('');
	let error = $state('');
	let busy = $state(false);

	let resetFor = $state<Account | null>(null);
	let resetPw = $state('');
	let deactivate = $state<Account | null>(null);
	let search = $state('');

	const accounts = $derived(
		app.db.accounts
			.filter((a) => `${a.name} ${a.email} ${a.department}`.toLowerCase().includes(search.trim().toLowerCase()))
			.sort((x, y) => x.role.localeCompare(y.role) || x.name.localeCompare(y.name))
	);

	$effect(() => {
		if (!department) department = app.settings.departments[0] ?? '';
	});

	async function create() {
		error = '';
		if (name.trim().length < 2) {
			error = 'Enter the person\u2019s name.';
			return;
		}
		if (!emailLooksValid(email)) {
			error = 'Enter a valid email address.';
			return;
		}
		const pw = checkPassword(password);
		if (!pw.ok) {
			error = pw.message;
			return;
		}
		busy = true;
		const res = await app.createAccount({ name, email, password, role, department, title });
		busy = false;
		if (!res.ok) {
			error = res.error ?? 'Could not create the account.';
			return;
		}
		createOpen = false;
		name = email = password = title = '';
		app.toast('Account created.', 'success');
	}

	async function doReset() {
		if (!resetFor) return;
		const pw = checkPassword(resetPw);
		if (!pw.ok) {
			app.toast(pw.message, 'error');
			return;
		}
		await app.resetPassword(resetFor.id, resetPw);
		app.toast(`Password reset for ${resetFor.name}. Share the new password securely.`, 'success');
		resetFor = null;
		resetPw = '';
	}

	const roleLabel = (r: Role) => (r === 'admin' ? 'Admin/HR' : r === 'manager' ? 'Manager' : 'Employee');
</script>

<svelte:head><title>Accounts - VoiceBox</title></svelte:head>

<div class="page-head">
	<div>
		<h1 data-testid="page-title">Accounts</h1>
		<p style="margin:var(--s-2) 0 0">
			{app.db.accounts.length} accounts in this browser. Demo authentication only: passwords are PBKDF2-hashed in local
			storage, which is not a substitute for server-side authentication.
		</p>
	</div>
	<button class="btn primary" onclick={() => (createOpen = true)} data-testid="create-account"><Icon name="plus" size={15} /> Create account</button>
</div>

<div class="row" style="margin-bottom:var(--s-3)">
	<input class="input" style="max-width:320px" type="search" placeholder="Search name, email or department" bind:value={search} aria-label="Search accounts" data-testid="account-search" />
</div>

<div class="table-wrap">
	<table class="data" data-testid="accounts-table">
		<thead>
			<tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Department</th><th scope="col">Title</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col">Actions</th></tr>
		</thead>
		<tbody>
			{#each accounts as a (a.id)}
				<tr style="cursor:default">
					<td style="color:var(--text); font-weight:500">{a.name}</td>
					<td>{a.email}</td>
					<td>{roleLabel(a.role)}</td>
					<td>{a.department}</td>
					<td>{a.title ?? '-'}</td>
					<td>
						{#if a.active}<span class="pill status-resolved">Active</span>{:else}<span class="pill status-declined">Deactivated</span>{/if}
						{#if a.mustChangePassword}<span class="pill status-under-review">Reset</span>{/if}
					</td>
					<td>{formatDate(a.createdAt)}</td>
					<td>
						<div class="row" style="gap:4px; flex-wrap:nowrap">
							<button class="btn sm ghost" onclick={() => { resetFor = a; resetPw = ''; }} data-testid="reset-password">Reset</button>
							{#if a.id !== app.account?.id}
								<button class="btn sm ghost" onclick={() => (a.active ? (deactivate = a) : app.setAccountActive(a.id, true))} data-testid="toggle-active">
									{a.active ? 'Deactivate' : 'Activate'}
								</button>
							{/if}
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<Modal open={createOpen} title="Create account" description="The person can sign in with this email and password in this browser." onclose={() => (createOpen = false)} testid="create-account-dialog">
	<div class="field"><label for="a-name">Name</label><input id="a-name" class="input" bind:value={name} data-testid="a-name" data-autofocus /></div>
	<div class="field"><label for="a-email">Email</label><input id="a-email" class="input" type="email" bind:value={email} placeholder="name@northwind.example" data-testid="a-email" /></div>
	<div class="grid-2">
		<div class="field">
			<label for="a-role">Role</label>
			<select id="a-role" class="input" bind:value={role} data-testid="a-role">
				<option value="employee">Employee</option>
				<option value="manager">Manager</option>
				<option value="admin">Admin/HR</option>
			</select>
		</div>
		<div class="field">
			<label for="a-dept">Department</label>
			<select id="a-dept" class="input" bind:value={department} data-testid="a-dept">
				{#each app.settings.departments as d}<option value={d}>{d}</option>{/each}
			</select>
		</div>
	</div>
	<div class="field"><label for="a-title">Job title (optional)</label><input id="a-title" class="input" bind:value={title} data-testid="a-title" /></div>
	<div class="field"><label for="a-pw">Temporary password (at least 8 characters)</label><input id="a-pw" class="input" type="text" bind:value={password} data-testid="a-password" /></div>
	{#if error}<p class="error-text" role="alert" data-testid="account-error">{error}</p>{/if}
	{#snippet footer()}
		<button class="btn" onclick={() => (createOpen = false)}>Cancel</button>
		<button class="btn primary" onclick={create} disabled={busy} data-testid="save-account">{busy ? 'Creating...' : 'Create account'}</button>
	{/snippet}
</Modal>

<Modal open={resetFor !== null} title="Reset password" description={resetFor ? `A new password for ${resetFor.name}.` : ''} onclose={() => (resetFor = null)} testid="reset-dialog">
	<div class="field"><label for="r-pw">New password</label><input id="r-pw" class="input" type="text" bind:value={resetPw} data-testid="reset-password-input" data-autofocus /></div>
	<p class="caption">The person is marked as needing a password change, and can set their own from the profile menu.</p>
	{#snippet footer()}
		<button class="btn" onclick={() => (resetFor = null)}>Cancel</button>
		<button class="btn primary" onclick={doReset} data-testid="reset-confirm">Reset password</button>
	{/snippet}
</Modal>

<ConfirmDialog
	open={deactivate !== null}
	title="Deactivate account"
	message={deactivate ? `${deactivate.name} will no longer be able to sign in. Their feedback and history stay in place.` : ''}
	confirmLabel="Deactivate"
	danger
	onconfirm={() => { if (deactivate) { app.setAccountActive(deactivate.id, false); app.toast('Account deactivated.', 'info'); deactivate = null; } }}
	oncancel={() => (deactivate = null)}
	testid="deactivate-dialog"
/>

<style>
	.page-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--s-4);
		flex-wrap: wrap;
		margin-bottom: var(--s-4);
	}
	.page-head p {
		max-width: 62ch;
	}
</style>
