<script lang="ts">
	// Simple SVG line chart with optional stacked series (sentiment trend).
	interface Series {
		name: string;
		color: string;
		values: number[];
	}
	interface Props {
		labels: string[];
		series: Series[];
		height?: number;
		height2?: number;
		suffix?: string;
		minY?: number;
		maxY?: number;
		testid?: string;
	}
	const { labels, series, height = 190, suffix = '', minY, maxY, testid }: Props = $props();

	const W = 600;
	const PAD_L = 34;
	const PAD_B = 22;
	const PAD_T = 10;

	const allValues = $derived(series.flatMap((s) => s.values));
	const hi = $derived(maxY ?? Math.max(1, ...allValues));
	const lo = $derived(minY ?? Math.min(0, ...allValues));
	const plotH = $derived(height - PAD_B - PAD_T);
	const x = (i: number) => PAD_L + (labels.length <= 1 ? (W - PAD_L) / 2 : ((W - PAD_L - 8) * i) / (labels.length - 1));
	const y = (v: number) => PAD_T + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
	const path = (values: number[]) => values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
	const ticks = $derived([lo, lo + (hi - lo) / 2, hi]);
</script>

<svg class="chart" viewBox="0 0 {W} {height}" role="img" aria-label="Trend chart" data-testid={testid} preserveAspectRatio="none">
	{#each ticks as t}
		<line class="axis" x1={PAD_L} y1={y(t)} x2={W} y2={y(t)} stroke-dasharray="2 4" />
		<text x={PAD_L - 6} y={y(t) + 3} text-anchor="end">{Math.round(t * 10) / 10}{suffix}</text>
	{/each}
	{#each series as s (s.name)}
		<path d={path(s.values)} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
		{#each s.values as v, i}
			<circle cx={x(i)} cy={y(v)} r="2.6" fill={s.color}>
				<title>{labels[i]} - {s.name}: {v}{suffix}</title>
			</circle>
		{/each}
	{/each}
	{#each labels as l, i}
		{#if labels.length <= 12 || i % Math.ceil(labels.length / 8) === 0}
			<text x={x(i)} y={height - 6} text-anchor="middle">{l}</text>
		{/if}
	{/each}
</svg>

{#if series.length > 1}
	<div class="legend">
		{#each series as s (s.name)}
			<span class="item"><span class="swatch" style="background:{s.color}"></span>{s.name}</span>
		{/each}
	</div>
{/if}

<style>
	.legend {
		display: flex;
		gap: var(--s-4);
		flex-wrap: wrap;
		margin-top: var(--s-2);
		font-size: 12px;
		color: var(--text-3);
	}
	.item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.swatch {
		width: 10px;
		height: 3px;
		border-radius: 2px;
	}
</style>
