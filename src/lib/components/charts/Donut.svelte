<script lang="ts">
	// SVG donut built from stroke-dasharray segments (no chart library).
	import type { Point } from '$lib/core/stats.ts';

	interface Props {
		data: Point[];
		colors?: Record<string, string>;
		size?: number;
		testid?: string;
		centerLabel?: string;
	}
	const { data, colors = {}, size = 160, testid, centerLabel }: Props = $props();

	const DEFAULT_COLORS = ['var(--navy-500)', 'var(--amber)', 'var(--teal)', 'var(--green)', 'var(--text-3)', 'var(--red)'];
	const total = $derived(data.reduce((s, d) => s + d.value, 0));
	const R = 54;
	const C = 2 * Math.PI * R;

	const segments = $derived(
		data.reduce<Array<{ point: Point; color: string; dash: number; offset: number }>>((acc, d, i) => {
			const prev = acc.reduce((s, x) => s + x.dash, 0);
			acc.push({
				point: d,
				color: colors[d.key ?? d.label] ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
				dash: total ? (d.value / total) * C : 0,
				offset: -prev
			});
			return acc;
		}, [])
	);
</script>

<div class="donut-wrap" data-testid={testid}>
	<svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label="Donut chart">
		<circle cx="70" cy="70" r={R} fill="none" stroke="var(--border)" stroke-width="16" />
		{#each segments as s (s.point.key ?? s.point.label)}
			{#if s.dash > 0}
				<circle
					cx="70"
					cy="70"
					r={R}
					fill="none"
					stroke={s.color}
					stroke-width="16"
					stroke-dasharray="{s.dash.toFixed(2)} {(C - s.dash).toFixed(2)}"
					stroke-dashoffset={s.offset.toFixed(2)}
					transform="rotate(-90 70 70)"
				>
					<title>{s.point.label}: {s.point.value}</title>
				</circle>
			{/if}
		{/each}
		<text x="70" y="68" text-anchor="middle" class="big">{total}</text>
		<text x="70" y="84" text-anchor="middle">{centerLabel ?? 'items'}</text>
	</svg>
	<ul class="legend">
		{#each segments as s (s.point.key ?? s.point.label)}
			<li>
				<span class="swatch" style="background:{s.color}"></span>
				<span class="name">{s.point.label}</span>
				<span class="val num">{s.point.value}</span>
			</li>
		{/each}
	</ul>
</div>

<style>
	.donut-wrap {
		display: flex;
		align-items: center;
		gap: var(--s-5);
		flex-wrap: wrap;
	}
	svg {
		flex: none;
	}
	svg text {
		font-family: var(--sans);
		font-size: 10px;
		fill: var(--text-3);
	}
	svg text.big {
		font-size: 20px;
		font-weight: 600;
		fill: var(--text);
		font-variant-numeric: tabular-nums;
	}
	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		min-width: 150px;
		flex: 1;
	}
	.legend li {
		display: grid;
		grid-template-columns: 10px 1fr auto;
		align-items: center;
		gap: var(--s-2);
	}
	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 2px;
	}
	.name {
		color: var(--text-2);
	}
	.val {
		color: var(--text);
		font-weight: 500;
	}
</style>
