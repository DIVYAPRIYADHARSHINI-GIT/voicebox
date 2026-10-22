<script lang="ts">
	// Simple hand-written SVG bar chart (no chart library).
	import type { Point } from '$lib/core/stats.ts';

	interface Props {
		data: Point[];
		height?: number;
		color?: string;
		horizontal?: boolean;
		testid?: string;
		valueSuffix?: string;
	}
	const { data, height = 180, color = 'var(--teal)', horizontal = false, testid, valueSuffix = '' }: Props = $props();

	const max = $derived(Math.max(1, ...data.map((d) => d.value)));
	const W = 600;
</script>

{#if horizontal}
	<div class="hbars" data-testid={testid}>
		{#each data as d (d.key ?? d.label)}
			<div class="hrow">
				<span class="hlabel" title={d.label}>{d.label}</span>
				<span class="htrack"><span class="hfill" style="width:{(d.value / max) * 100}%; background:{color}"></span></span>
				<span class="hval num">{d.value}{valueSuffix}</span>
			</div>
		{/each}
	</div>
{:else}
	<svg class="chart" viewBox="0 0 {W} {height}" role="img" aria-label="Bar chart" data-testid={testid} preserveAspectRatio="none">
		<line class="axis" x1="0" y1={height - 20} x2={W} y2={height - 20} />
		{#each data as d, i (d.key ?? d.label)}
			{@const bw = Math.max(2, W / Math.max(data.length, 1) - 4)}
			{@const h = ((height - 32) * d.value) / max}
			{@const x = (W / Math.max(data.length, 1)) * i + 2}
			<rect x={x} y={height - 20 - h} width={bw} height={Math.max(h, d.value > 0 ? 2 : 0)} fill={color} rx="2">
				<title>{d.label}: {d.value}{valueSuffix}</title>
			</rect>
			{#if data.length <= 14 || i % Math.ceil(data.length / 10) === 0}
				<text x={x + bw / 2} y={height - 6} text-anchor="middle">{d.label}</text>
			{/if}
		{/each}
	</svg>
{/if}

<style>
	.hbars {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.hrow {
		display: grid;
		grid-template-columns: minmax(84px, 30%) 1fr 44px;
		align-items: center;
		gap: var(--s-3);
		font-size: 13px;
	}
	.hlabel {
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.htrack {
		height: 8px;
		border-radius: 999px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		overflow: hidden;
	}
	.hfill {
		display: block;
		height: 100%;
		border-radius: 999px;
	}
	.hval {
		text-align: right;
		color: var(--text);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
</style>
