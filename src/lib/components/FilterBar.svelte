<script lang="ts">
	// Search + filters + sort, shared by the inbox and the board.
	import { app } from '$lib/app.svelte.ts';
	import { PRIORITIES, SENTIMENTS, STATUSES } from '$lib/core/types.ts';
	import { activeFilterCount, emptyFilters, type FilterState, type SortKey } from '$lib/core/filters.ts';
	import Icon from './Icon.svelte';

	interface Props {
		filters: FilterState;
		sort: SortKey;
		showSort?: boolean;
		onchange: (f: FilterState) => void;
		onsort?: (s: SortKey) => void;
		count: number;
		total: number;
	}
	const { filters, sort, showSort = true, onchange, onsort, count, total }: Props = $props();

	let open = $state(false);
	const set = (patch: Partial<FilterState>) => onchange({ ...filters, ...patch });
	const activeCount = $derived(activeFilterCount(filters));
</script>

<div class="bar">
	<div class="search">
		<Icon name="search" size={16} />
		<input
			class="input"
			type="search"
			placeholder="Search title, description, tags or submitter"
			value={filters.q}
			oninput={(e) => set({ q: e.currentTarget.value })}
			aria-label="Search feedback"
			data-testid="search"
		/>
	</div>

	<button class="btn" onclick={() => (open = !open)} aria-expanded={open} data-testid="toggle-filters">
		<Icon name="filter" size={15} />
		Filters{#if activeCount}<span class="badge num">{activeCount}</span>{/if}
	</button>

	{#if showSort}
		<label class="sort">
			<span class="sr-only">Sort by</span>
			<select class="input" value={sort} onchange={(e) => onsort?.(e.currentTarget.value as SortKey)} data-testid="sort">
				<option value="newest">Newest first</option>
				<option value="oldest">Oldest first</option>
				<option value="due">Due date</option>
				<option value="priority">Priority</option>
				<option value="status">Status</option>
				<option value="votes">Most upvoted</option>
			</select>
		</label>
	{/if}

	<span class="spacer"></span>
	<span class="caption num" data-testid="result-count">{count} of {total}</span>
</div>

{#if open}
	<div class="filters card tight" data-testid="filter-panel">
		<div class="grid-4">
			<label class="f">
				<span class="label">Status</span>
				<select class="input" value={filters.status} onchange={(e) => set({ status: e.currentTarget.value as FilterState['status'] })} data-testid="filter-status">
					<option value="all">All statuses</option>
					{#each STATUSES as s}<option value={s}>{s}</option>{/each}
				</select>
			</label>
			<label class="f">
				<span class="label">Category</span>
				<select class="input" value={filters.category} onchange={(e) => set({ category: e.currentTarget.value })} data-testid="filter-category">
					<option value="all">All categories</option>
					{#each app.settings.categories as c}<option value={c}>{c}</option>{/each}
				</select>
			</label>
			<label class="f">
				<span class="label">Department</span>
				<select class="input" value={filters.department} onchange={(e) => set({ department: e.currentTarget.value })} disabled={!app.isAdmin} data-testid="filter-department">
					<option value="all">{app.isAdmin ? 'All departments' : (app.account?.department ?? 'My department')}</option>
					{#each app.settings.departments as d}<option value={d}>{d}</option>{/each}
				</select>
			</label>
			<label class="f">
				<span class="label">Priority</span>
				<select class="input" value={filters.priority} onchange={(e) => set({ priority: e.currentTarget.value as FilterState['priority'] })} data-testid="filter-priority">
					<option value="all">All priorities</option>
					{#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
				</select>
			</label>
			<label class="f">
				<span class="label">Sentiment</span>
				<select class="input" value={filters.sentiment} onchange={(e) => set({ sentiment: e.currentTarget.value as FilterState['sentiment'] })} data-testid="filter-sentiment">
					<option value="all">All sentiment</option>
					{#each SENTIMENTS as s}<option value={s}>{s}</option>{/each}
				</select>
			</label>
			{#if app.isAdmin}
				<label class="f">
					<span class="label">Confidential reports</span>
					<select class="input" value={filters.confidential} onchange={(e) => set({ confidential: e.currentTarget.value as FilterState['confidential'] })} data-testid="filter-confidential">
						<option value="include">Include</option>
						<option value="exclude">Exclude</option>
						<option value="only">Only confidential</option>
					</select>
				</label>
			{/if}
		</div>

		<div class="row toggles">
			<label class="check"><input type="checkbox" checked={filters.overdue} onchange={(e) => set({ overdue: e.currentTarget.checked })} data-testid="filter-overdue" /> Overdue only</label>
			<label class="check"><input type="checkbox" checked={filters.anonymous} onchange={(e) => set({ anonymous: e.currentTarget.checked })} data-testid="filter-anonymous" /> Anonymous only</label>
			<label class="check"><input type="checkbox" checked={filters.unread} onchange={(e) => set({ unread: e.currentTarget.checked })} data-testid="filter-unread" /> Unread only</label>
			<label class="check"><input type="checkbox" checked={filters.mine} onchange={(e) => set({ mine: e.currentTarget.checked })} data-testid="filter-mine" /> Assigned to me</label>
			<span class="spacer"></span>
			<button class="btn sm ghost" onclick={() => onchange(emptyFilters())} data-testid="clear-filters">Clear all</button>
		</div>
	</div>
{/if}

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		flex-wrap: wrap;
		margin-bottom: var(--s-3);
	}
	.search {
		position: relative;
		flex: 1;
		min-width: 200px;
		display: flex;
		align-items: center;
	}
	.search :global(.icon) {
		position: absolute;
		left: 10px;
		color: var(--text-3);
		pointer-events: none;
	}
	.search .input {
		padding-left: 34px;
	}
	.badge {
		background: var(--teal);
		color: #fff;
		border-radius: 999px;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		font-size: 11px;
		font-weight: 700;
		display: grid;
		place-items: center;
	}
	.sort select {
		min-width: 150px;
	}
	.filters {
		margin-bottom: var(--s-3);
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.toggles {
		margin-top: var(--s-4);
		padding-top: var(--s-3);
		border-top: 1px solid var(--border);
		gap: var(--s-4);
	}
</style>
