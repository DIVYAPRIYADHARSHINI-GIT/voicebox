<script lang="ts">
	// Dashboard: KPI cards + simple SVG charts. Managers see their department
	// only; department comparison respects the anonymity threshold.
	import { app } from '$lib/app.svelte.ts';
	import {
		RANGES,
		byCategory,
		byStatus,
		computeKpis,
		departmentComparison,
		inRange,
		resolutionTrend,
		sentimentTrend,
		topIdeas,
		topThemes,
		volumeSeries,
		type RangeKey
	} from '$lib/core/stats.ts';
	import { THRESHOLD_MESSAGE } from '$lib/core/rules.ts';
	import { STATUSES } from '$lib/core/types.ts';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import Donut from '$lib/components/charts/Donut.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Pill from '$lib/components/Pill.svelte';

	let range = $state<RangeKey>('30d');

	const scoped = $derived(app.scopedFeedback);
	const items = $derived(scoped.filter((f) => inRange(f.createdAt, range)));
	const pulse = $derived(app.isAdmin ? app.db.pulse : app.db.pulse.filter((p) => p.department === app.account?.department));
	const kpis = $derived(computeKpis(items, pulse, app.settings));
	const volume = $derived(volumeSeries(items, range));
	const categories = $derived(byCategory(items));
	const statuses = $derived(byStatus(items, STATUSES));
	const sentiment = $derived(sentimentTrend(items));
	const resolution = $derived(resolutionTrend(items));
	const ideas = $derived(topIdeas(items, 5));
	const themes = $derived(topThemes(items, 8));
	const depts = $derived(departmentComparison(items, app.settings.anonymityThreshold));

	const STATUS_COLORS: Record<string, string> = {
		New: 'var(--navy-500)',
		'Under review': 'var(--amber)',
		'In progress': 'var(--teal)',
		Resolved: 'var(--green)',
		Declined: 'var(--text-3)'
	};

	const hours = (n: number | null) => (n === null ? '-' : n >= 48 ? `${Math.round(n / 24)} d` : `${n} h`);
</script>

<svelte:head><title>Dashboard - VoiceBox</title></svelte:head>

<div class="page-head">
	<div>
		<h1 data-testid="page-title">Dashboard</h1>
		<p style="margin:var(--s-2) 0 0">
			{app.isAdmin ? 'All departments.' : `${app.account?.department} only.`} Charts are drawn as plain SVG - no chart library.
		</p>
	</div>
	<div class="row" role="group" aria-label="Date range">
		{#each RANGES as r (r.key)}
			<button class="btn sm" class:primary={range === r.key} onclick={() => (range = r.key)} data-testid="range-{r.key}">{r.label}</button>
		{/each}
	</div>
</div>

<div class="kpis" data-testid="kpis">
	<div class="card tight kpi" data-testid="kpi-total"><span class="l">Total feedback</span><span class="v num">{kpis.total}</span></div>
	<div class="card tight kpi" data-testid="kpi-open"><span class="l">Open items</span><span class="v num">{kpis.open}</span></div>
	<div class="card tight kpi" data-testid="kpi-resolved"><span class="l">Resolved this month</span><span class="v num">{kpis.resolvedThisMonth}</span></div>
	<div class="card tight kpi" data-testid="kpi-first-response"><span class="l">Avg. first response</span><span class="v num">{hours(kpis.avgFirstResponseHours)}</span></div>
	<div class="card tight kpi" data-testid="kpi-resolution"><span class="l">Avg. time to resolve</span><span class="v num">{hours(kpis.avgResolutionHours)}</span></div>
	<div class="card tight kpi" class:alert={kpis.overdue > 0} data-testid="kpi-overdue"><span class="l">Overdue</span><span class="v num">{kpis.overdue}</span></div>
	<div class="card tight kpi" data-testid="kpi-enps">
		<span class="l">eNPS</span>
		<span class="v num">{kpis.enpsResponses >= app.settings.anonymityThreshold ? kpis.enps : '-'}</span>
		<span class="caption">{kpis.enpsResponses >= app.settings.anonymityThreshold ? `${kpis.enpsResponses} responses` : THRESHOLD_MESSAGE}</span>
	</div>
</div>

<div class="grid-2" style="margin-top:var(--s-4)">
	<div class="card">
		<div class="card-head"><h2>Feedback volume</h2><span class="caption">{range === '90d' || range === 'all' ? 'per week' : 'per day'}</span></div>
		<BarChart data={volume} testid="chart-volume" />
	</div>
	<div class="card">
		<div class="card-head"><h2>By status</h2></div>
		<Donut data={statuses} colors={STATUS_COLORS} testid="chart-status" />
	</div>
</div>

<div class="grid-2" style="margin-top:var(--s-4)">
	<div class="card">
		<div class="card-head"><h2>By category</h2></div>
		{#if categories.length}
			<BarChart data={categories} horizontal color="var(--navy-500)" testid="chart-category" />
		{:else}
			<p class="caption">No data in this range.</p>
		{/if}
	</div>
	<div class="card">
		<div class="card-head"><h2>Sentiment trend</h2><span class="caption">auto-estimated, by week</span></div>
		{#if sentiment.length}
			<LineChart
				labels={sentiment.map((s) => s.label)}
				series={[
					{ name: 'Positive', color: 'var(--green)', values: sentiment.map((s) => s.Positive) },
					{ name: 'Neutral', color: 'var(--text-3)', values: sentiment.map((s) => s.Neutral) },
					{ name: 'Negative', color: 'var(--red)', values: sentiment.map((s) => s.Negative) }
				]}
				testid="chart-sentiment"
			/>
		{:else}
			<p class="caption">No data in this range.</p>
		{/if}
	</div>
</div>

<div class="grid-2" style="margin-top:var(--s-4)">
	<div class="card">
		<div class="card-head"><h2>Resolution time trend</h2><span class="caption">average hours, by week resolved</span></div>
		{#if resolution.length}
			<LineChart labels={resolution.map((r) => r.label)} series={[{ name: 'Hours', color: 'var(--teal)', values: resolution.map((r) => r.value) }]} suffix="h" testid="chart-resolution" />
		{:else}
			<p class="caption">Nothing resolved in this range yet.</p>
		{/if}
	</div>
	<div class="card">
		<div class="card-head"><h2>Top 5 most-upvoted ideas</h2></div>
		{#if ideas.length}
			<ol class="ideas" data-testid="top-ideas">
				{#each ideas as row (row.item.id)}
					<li>
						<span class="votes num">{row.votes}</span>
						<span class="t">{row.item.title}</span>
						<Pill kind="status" value={row.item.status} />
					</li>
				{/each}
			</ol>
		{:else}
			<p class="caption">No upvoted public ideas in this range.</p>
		{/if}
	</div>
</div>

<div class="grid-2" style="margin-top:var(--s-4)">
	<div class="card">
		<div class="card-head"><h2>Department comparison</h2><span class="caption">threshold: {app.settings.anonymityThreshold}</span></div>
		{#if app.isAdmin}
			<table class="plain" data-testid="dept-comparison">
				<thead><tr><th scope="col">Department</th><th scope="col">Items</th><th scope="col">Open</th></tr></thead>
				<tbody>
					{#each depts as d (d.department)}
						<tr>
							<td>{d.department}</td>
							{#if d.shown}
								<td class="num">{d.count}</td>
								<td class="num">{d.open}</td>
							{:else}
								<td colspan="2" class="caption" data-testid="threshold-hidden">{THRESHOLD_MESSAGE}</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="caption" data-testid="dept-scoped-note">
				You see {app.account?.department} only. Cross-department comparison is available to Admin/HR.
			</p>
			<BarChart data={depts.filter((d) => d.shown).map((d) => ({ label: d.department, value: d.count }))} horizontal testid="chart-dept" />
		{/if}
	</div>
	<div class="card">
		<div class="card-head"><h2>Top themes</h2><span class="caption">frequent tags and keywords</span></div>
		{#if themes.length}
			<ul class="themes" data-testid="top-themes">
				{#each themes as t (t.label)}
					<li>
						<span class="pill">{#if t.kind === 'tag'}<Icon name="tag" size={11} />{/if}{t.label}</span>
						<span class="caption num">{t.count}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="caption">No themes yet in this range.</p>
		{/if}
	</div>
</div>

<style>
	.page-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--s-4);
		flex-wrap: wrap;
		margin-bottom: var(--s-4);
	}
	.kpis {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: var(--s-3);
	}
	.kpi {
		display: flex;
		flex-direction: column;
		gap: 2px;
		justify-content: flex-start;
	}
	.kpi .l {
		font-size: 12px;
		color: var(--text-3);
		line-height: 1.3;
	}
	.kpi .v {
		font-size: 24px;
		font-weight: 600;
		color: var(--text);
		line-height: 1.2;
	}
	.kpi.alert .v {
		color: var(--red);
	}
	.kpi .caption {
		font-size: 11px;
	}
	.ideas {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		font-size: 13px;
	}
	.ideas li {
		display: grid;
		grid-template-columns: 34px minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--s-2);
	}
	.votes {
		font-weight: 600;
		text-align: right;
		color: var(--teal);
	}
	.ideas .t {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-2);
	}
	.themes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.themes li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--s-2);
	}
	table.plain {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
		font-variant-numeric: tabular-nums;
	}
	table.plain th {
		text-align: left;
		font-size: 12px;
		color: var(--text-3);
		padding: var(--s-2) 0;
		border-bottom: 1px solid var(--border);
	}
	table.plain td {
		padding: var(--s-2) 0;
		border-bottom: 1px solid var(--border);
		color: var(--text-2);
	}
	@media (max-width: 1200px) {
		.kpis {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	@media (max-width: 760px) {
		.kpis {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
