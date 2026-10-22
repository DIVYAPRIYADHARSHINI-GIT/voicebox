<script lang="ts">
	// Feedback Inbox - the manager portal landing page.
	import { page } from '$app/state';
	import { app } from '$lib/app.svelte.ts';
	import { applyFilters, emptyFilters, sortItems, type FilterState, type SortKey } from '$lib/core/filters.ts';
	import { isConfidential, isDueSoon, submitterLabel, type FeedbackDraft } from '$lib/core/rules.ts';
	import { formatDate, relative } from '$lib/core/time.ts';
	import { STATUSES, type Status } from '$lib/core/types.ts';
	import Icon from '$lib/components/Icon.svelte';
	import Pill from '$lib/components/Pill.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import DetailDrawer from '$lib/components/DetailDrawer.svelte';
	import Modal from '$lib/components/Modal.svelte';

	let filters = $state<FilterState>(emptyFilters());
	let sort = $state<SortKey>('newest');
	let openId = $state<string | null>(null);
	let selected = $state<string[]>([]);
	let bulkOpen = $state(false);
	let bulkKind = $state<'status' | 'owner' | 'tag'>('status');
	let bulkStatus = $state<Status>('Under review');
	let bulkOwner = $state('');
	let bulkTag = $state('');
	let bulkBusy = $state(false);

	const scoped = $derived(app.scopedFeedback);
	const filtered = $derived(
		sortItems(applyFilters(scoped, filters, { viewerId: app.account?.id, sla: app.sla }), sort, (f) => app.due(f))
	);
	// Cap the rendered rows so 500+ items can never freeze the page.
	const PAGE = 100;
	let shown = $state(PAGE);
	const rows = $derived(filtered.slice(0, shown));
	const openItem = $derived(openId ? app.byId(openId) : undefined);

	// Needs-your-attention counters.
	const attention = $derived.by(() => {
		const mine = app.account?.id;
		return {
			unread: scoped.filter((f) => app.isUnread(f)).length,
			overdue: scoped.filter((f) => app.overdue(f)).length,
			dueSoon: scoped.filter((f) => isDueSoon(f, 3, Date.now(), app.sla)).length,
			assigned: scoped.filter((f) => f.ownerId === mine && f.status !== 'Resolved' && f.status !== 'Declined').length
		};
	});

	$effect(() => {
		const want = page.url.searchParams.get('item');
		if (want && scoped.some((i) => i.id === want)) openId = want;
	});

	function openRow(itemId: string) {
		openId = itemId;
		void app.markRead(itemId, true);
	}

	function toggleSelect(itemId: string, checked: boolean) {
		selected = checked ? [...selected, itemId] : selected.filter((x) => x !== itemId);
	}

	async function runBulk() {
		const action =
			bulkKind === 'status'
				? ({ kind: 'status', value: bulkStatus, reason: 'Bulk update from the inbox' } as const)
				: bulkKind === 'owner'
					? ({ kind: 'owner', value: bulkOwner } as const)
					: ({ kind: 'tag', value: bulkTag } as const);
		bulkBusy = true;
		const n = await app.bulk(selected, action);
		bulkBusy = false;
		bulkOpen = false;
		selected = [];
		app.toast(`${n} item(s) updated.`, 'success');
	}

	const applyAttention = (patch: Partial<FilterState>) => {
		filters = { ...emptyFilters(), ...patch };
		shown = PAGE;
	};
</script>

<svelte:head><title>Feedback Inbox - VoiceBox</title></svelte:head>

<div class="page-head">
	<div>
		<h1 data-testid="page-title">Feedback Inbox</h1>
		<p style="margin:var(--s-2) 0 0">
			{#if app.isAdmin}
				All departments, including confidential reports.
			{:else}
				Feedback for {app.account?.department}. Confidential reports go to Admin/HR only and are not shown here.
			{/if}
		</p>
	</div>
	<a class="btn" href="/manager/board"><Icon name="board" size={15} /> Board view</a>
</div>

<div class="attention" data-testid="attention-strip">
	<button class="att" onclick={() => applyAttention({ unread: true })} data-testid="att-new">
		<span class="n num">{attention.unread}</span>
		<span class="l">New / unread</span>
	</button>
	<button class="att warn" onclick={() => applyAttention({ overdue: true })} data-testid="att-overdue">
		<span class="n num">{attention.overdue}</span>
		<span class="l">Overdue</span>
	</button>
	<button class="att" onclick={() => applyAttention({ status: 'all' })} data-testid="att-due-soon">
		<span class="n num">{attention.dueSoon}</span>
		<span class="l">Due in 3 days</span>
	</button>
	<button class="att" onclick={() => applyAttention({ mine: true })} data-testid="att-mine">
		<span class="n num">{attention.assigned}</span>
		<span class="l">Assigned to me</span>
	</button>
</div>

<FilterBar
	{filters}
	{sort}
	count={filtered.length}
	total={scoped.length}
	onchange={(f) => { filters = f; shown = PAGE; }}
	onsort={(s) => (sort = s)}
/>

{#if selected.length > 0}
	<div class="bulkbar" data-testid="bulk-bar">
		<strong class="num">{selected.length} selected</strong>
		<button class="btn sm" onclick={() => { bulkKind = 'status'; bulkOpen = true; }} data-testid="bulk-status">Change status</button>
		<button class="btn sm" onclick={() => { bulkKind = 'owner'; bulkOpen = true; }} data-testid="bulk-owner">Assign owner</button>
		<button class="btn sm" onclick={() => { bulkKind = 'tag'; bulkOpen = true; }} data-testid="bulk-tag">Add tag</button>
		<button class="btn sm ghost" onclick={() => (selected = [])}>Clear selection</button>
	</div>
{/if}

{#if !app.ready}
	<div class="card stack">{#each [1, 2, 3, 4, 5] as i}<div class="skeleton" style="height:36px"></div>{/each}</div>
{:else if filtered.length === 0}
	<div class="card empty" data-testid="inbox-empty">
		<h3>No feedback matches these filters</h3>
		<p>Try clearing the filters, or widen the search.</p>
		<button class="btn" onclick={() => (filters = emptyFilters())}>Clear filters</button>
	</div>
{:else}
	<div class="table-wrap">
		<table class="data" data-testid="inbox-table">
			<thead>
				<tr>
					<th scope="col" style="width:34px">
						<span class="sr-only">Select</span>
						<input
							type="checkbox"
							checked={selected.length > 0 && selected.length === rows.length}
							onchange={(e) => (selected = e.currentTarget.checked ? rows.map((r) => r.id) : [])}
							aria-label="Select all visible rows"
							data-testid="select-all"
						/>
					</th>
					<th scope="col" style="width:28px"><span class="sr-only">Unread</span></th>
					<th scope="col">Title</th>
					<th scope="col">Category</th>
					<th scope="col">Type</th>
					<th scope="col">Sentiment</th>
					<th scope="col">Priority</th>
					<th scope="col">Status</th>
					<th scope="col">Submitter</th>
					<th scope="col">Department</th>
					<th scope="col">Submitted</th>
					<th scope="col">Due</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as item (item.id)}
					<tr
						aria-selected={openId === item.id}
						onclick={() => openRow(item.id)}
						onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openRow(item.id))}
						tabindex="0"
						data-testid="inbox-row"
					>
						<td onclick={(e) => e.stopPropagation()}>
							<input
								type="checkbox"
								checked={selected.includes(item.id)}
								onchange={(e) => toggleSelect(item.id, e.currentTarget.checked)}
								aria-label="Select {item.title}"
								data-testid="row-select"
							/>
						</td>
						<td>{#if app.isUnread(item)}<span class="unread-dot" title="Unread" data-testid="unread-dot"></span><span class="sr-only">Unread</span>{/if}</td>
						<td class="title-cell">
							{item.title}
							{#if isConfidential(item)}<Pill kind="sensitive" value="Sensitive" />{/if}
							{#if app.overdue(item)}<Pill kind="overdue" value="Overdue" />{/if}
						</td>
						<td>{item.category}</td>
						<td>{item.type}</td>
						<td><Pill kind="sentiment" value={item.sentiment} /></td>
						<td><Pill kind="priority" value={item.priority} /></td>
						<td><Pill kind="status" value={item.status} /></td>
						<td data-testid="submitter-cell">{submitterLabel(item)}</td>
						<td>{item.department}</td>
						<td>{formatDate(item.createdAt)}</td>
						<td title={relative(app.due(item))}>{formatDate(app.due(item))}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if filtered.length > shown}
		<div class="row" style="justify-content:center; margin-top:var(--s-3)">
			<button class="btn" onclick={() => (shown += PAGE)} data-testid="load-more">Show {Math.min(PAGE, filtered.length - shown)} more ({filtered.length - shown} remaining)</button>
		</div>
	{/if}
{/if}

{#if openItem}
	<DetailDrawer item={openItem} onclose={() => (openId = null)} />
{/if}

<Modal
	open={bulkOpen}
	title={bulkKind === 'status' ? 'Change status' : bulkKind === 'owner' ? 'Assign owner' : 'Add tag'}
	description="{selected.length} item(s) will be updated."
	onclose={() => (bulkOpen = false)}
	testid="bulk-dialog"
>
	{#if bulkKind === 'status'}
		<div class="field">
			<label for="bulk-status-select">New status</label>
			<select id="bulk-status-select" class="input" bind:value={bulkStatus} data-testid="bulk-status-select">
				{#each STATUSES.filter((s) => s !== 'Declined') as s}<option value={s}>{s}</option>{/each}
			</select>
			<span class="hint">Declining requires an individual reason, so it is not available as a bulk action.</span>
		</div>
	{:else if bulkKind === 'owner'}
		<div class="field">
			<label for="bulk-owner-select">Owner</label>
			<select id="bulk-owner-select" class="input" bind:value={bulkOwner} data-testid="bulk-owner-select">
				<option value="">Unassigned</option>
				{#each app.owners as o (o.id)}<option value={o.id}>{o.name} ({o.department})</option>{/each}
			</select>
		</div>
	{:else}
		<div class="field">
			<label for="bulk-tag-input">Tag</label>
			<input id="bulk-tag-input" class="input" bind:value={bulkTag} placeholder="e.g. facilities" data-testid="bulk-tag-input" />
		</div>
	{/if}
	{#snippet footer()}
		<button class="btn" onclick={() => (bulkOpen = false)}>Cancel</button>
		<button class="btn primary" onclick={() => void runBulk()} disabled={bulkBusy} data-testid="bulk-apply">{bulkBusy ? 'Applying...' : 'Apply'}</button>
	{/snippet}
</Modal>

<style>
	.page-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--s-4);
		flex-wrap: wrap;
		margin-bottom: var(--s-4);
	}
	.attention {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--s-3);
		margin-bottom: var(--s-4);
	}
	.att {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-lg);
		box-shadow: var(--shadow-1);
		padding: var(--s-3) var(--s-4);
		font: inherit;
		cursor: pointer;
		min-height: 64px;
		transition: border-color 0.12s ease;
	}
	.att:hover {
		border-color: var(--teal);
	}
	.att .n {
		font-size: 22px;
		font-weight: 600;
		color: var(--text);
		line-height: 1.1;
	}
	.att .l {
		font-size: 12px;
		color: var(--text-3);
	}
	.att.warn .n {
		color: var(--red);
	}
	.bulkbar {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		flex-wrap: wrap;
		background: var(--teal-050);
		border: 1px solid var(--teal);
		border-radius: var(--r);
		padding: var(--s-2) var(--s-3);
		margin-bottom: var(--s-3);
		font-size: 13px;
	}
	table.data input[type='checkbox'] {
		width: 16px;
		height: 16px;
		accent-color: var(--teal);
	}
	@media (max-width: 760px) {
		.attention {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
