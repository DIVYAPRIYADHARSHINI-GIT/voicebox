<script lang="ts">
	// Pulse results: overall + per-department scores, weekly trend, eNPS and
	// comment themes. Any group below the anonymity threshold shows the
	// protective message instead of numbers.
	import { app } from '$lib/app.svelte.ts';
	import { pulseByDepartment, summarizePulse } from '$lib/core/stats.ts';
	import { THRESHOLD_MESSAGE } from '$lib/core/rules.ts';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import Icon from '$lib/components/Icon.svelte';

	// Managers see their own department's responses only.
	const responses = $derived(app.isAdmin ? app.db.pulse : app.db.pulse.filter((p) => p.department === app.account?.department));
	const overall = $derived(summarizePulse(responses, app.settings));
	const departments = $derived(app.isAdmin ? app.settings.departments : [app.account?.department ?? '']);
	const perDept = $derived(pulseByDepartment(responses, app.settings, departments));
	const shownTrend = $derived(overall.trend.filter((t) => t.shown));
</script>

<svelte:head><title>Pulse results - VoiceBox</title></svelte:head>

<h1 data-testid="page-title">Pulse results</h1>
<p style="max-width:66ch">
	{app.isAdmin ? 'All departments.' : `${app.account?.department} only.`}
	Results are hidden for any group with fewer than {app.settings.anonymityThreshold} responses, so individual answers can never be
	inferred. The threshold is editable in Settings.
</p>

{#if !overall.shown}
	<div class="card notice warn" data-testid="pulse-threshold">
		<Icon name="shield" size={18} />
		<div>
			<strong>{THRESHOLD_MESSAGE}</strong>
			<p style="margin:4px 0 0; color:inherit">
				This group has {overall.responses} response(s); at least {app.settings.anonymityThreshold} are needed.
			</p>
		</div>
	</div>
{:else}
	<div class="grid-4" style="margin:var(--s-4) 0">
		<div class="card tight kpi"><span class="l">Responses</span><span class="v num" data-testid="pulse-responses">{overall.responses}</span></div>
		<div class="card tight kpi">
			<span class="l">eNPS</span>
			<span class="v num" data-testid="pulse-enps">{overall.enps.score}</span>
			<span class="caption">{overall.enps.promoters} promoters / {overall.enps.detractors} detractors</span>
		</div>
		{#each overall.scores.slice(0, 2) as s (s.questionId)}
			<div class="card tight kpi">
				<span class="l">{s.text}</span>
				<span class="v num">{s.average ?? '-'}<span class="of">/5</span></span>
			</div>
		{/each}
	</div>

	<div class="grid-2">
		<div class="card">
			<div class="card-head"><h2>Scores by question</h2><span class="caption">1-5 scale</span></div>
			<BarChart data={overall.scores.map((s) => ({ label: s.text, value: s.average ?? 0 }))} horizontal valueSuffix="" testid="pulse-scores" />
		</div>
		<div class="card">
			<div class="card-head"><h2>Weekly trend</h2><span class="caption">average of the 1-5 questions</span></div>
			{#if shownTrend.length}
				<LineChart labels={shownTrend.map((t) => t.label)} series={[{ name: 'Average', color: 'var(--teal)', values: shownTrend.map((t) => t.value) }]} minY={1} maxY={5} testid="pulse-trend" />
			{:else}
				<p class="caption">{THRESHOLD_MESSAGE} for every week in this view.</p>
			{/if}
		</div>
	</div>

	<div class="grid-2" style="margin-top:var(--s-4)">
		<div class="card">
			<div class="card-head"><h2>By department</h2></div>
			<table class="plain" data-testid="pulse-departments">
				<thead><tr><th scope="col">Department</th><th scope="col">Responses</th><th scope="col">Avg. score</th><th scope="col">eNPS</th></tr></thead>
				<tbody>
					{#each perDept as row (row.department)}
						<tr>
							<td>{row.department}</td>
							{#if row.summary.shown}
								<td class="num">{row.summary.responses}</td>
								<td class="num">{Math.round((row.summary.scores.reduce((s, x) => s + (x.average ?? 0), 0) / Math.max(row.summary.scores.length, 1)) * 10) / 10}</td>
								<td class="num">{row.summary.enps.score}</td>
							{:else}
								<td colspan="3" class="caption" data-testid="dept-threshold">{THRESHOLD_MESSAGE}</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="card">
			<div class="card-head"><h2>Comment themes</h2><span class="caption">most frequent words in comments</span></div>
			{#if overall.themes.length}
				<ul class="themes" data-testid="pulse-themes">
					{#each overall.themes as t (t.label)}
						<li><span class="pill">{t.label}</span><span class="caption num">{t.count}</span></li>
					{/each}
				</ul>
				<h3 style="margin:var(--s-4) 0 var(--s-2)">Recent comments</h3>
				<ul class="comments">
					{#each overall.comments.slice(-6).reverse() as c, i (i)}<li>{c}</li>{/each}
				</ul>
			{:else}
				<p class="caption">No comments yet.</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	h1 {
		margin-bottom: var(--s-2);
	}
	.kpi {
		display: flex;
		flex-direction: column;
		gap: 2px;
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
	}
	.kpi .of {
		font-size: 13px;
		color: var(--text-3);
		font-weight: 400;
	}
	.kpi .caption {
		font-size: 11px;
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
		gap: var(--s-2);
	}
	.comments {
		margin: 0;
		padding-left: var(--s-4);
		font-size: 13px;
		color: var(--text-2);
	}
	.comments li {
		margin-bottom: 4px;
	}
</style>
