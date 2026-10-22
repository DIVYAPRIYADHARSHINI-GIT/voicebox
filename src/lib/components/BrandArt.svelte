<script lang="ts">
	// Original line-art illustrations for the sign-in brand panels.
	// Employee: a voice reaching a tracked path. Manager: a triage board.
	// Drawn as plain strokes, no gradients, no stock art.
	interface Props {
		variant: 'employee' | 'manager';
	}
	const { variant }: Props = $props();
</script>

{#if variant === 'employee'}
	<svg viewBox="0 0 260 200" width="100%" height="auto" role="img" aria-label="Line illustration: a message travelling from a person to a tracked outcome" style="max-height:230px">
		<g fill="none" stroke="rgba(255,255,255,0.78)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
			<!-- speech card -->
			<path d="M24 36h86a6 6 0 0 1 6 6v44a6 6 0 0 1-6 6H52l-14 14V92h-14a6 6 0 0 1-6-6V42a6 6 0 0 1 6-6Z" />
			<path d="M36 54h62M36 66h46M36 78h30" stroke="rgba(255,255,255,0.4)" />
			<!-- path of travel -->
			<path d="M124 76c24 0 24 34 48 34s24-34 48-34" stroke="#2aa198" stroke-dasharray="4 5" />
			<!-- milestone nodes -->
			<circle cx="124" cy="76" r="5" stroke="#2aa198" />
			<circle cx="172" cy="110" r="5" stroke="#2aa198" />
			<circle cx="220" cy="76" r="5" stroke="#2aa198" />
			<!-- resolved panel -->
			<path d="M176 128h62a6 6 0 0 1 6 6v34a6 6 0 0 1-6 6h-62a6 6 0 0 1-6-6v-34a6 6 0 0 1 6-6Z" />
			<path d="M186 151l7 7 14-15" stroke="#2aa198" stroke-width="1.8" />
			<path d="M214 145h18M214 158h12" stroke="rgba(255,255,255,0.4)" />
			<!-- person -->
			<circle cx="52" cy="140" r="12" />
			<path d="M30 176a22 22 0 0 1 44 0" />
		</g>
	</svg>
{:else}
	<svg viewBox="0 0 260 200" width="100%" height="auto" role="img" aria-label="Line illustration: a triage board with columns and priority markers" style="max-height:230px">
		<g fill="none" stroke="rgba(255,255,255,0.78)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
			<!-- board frame -->
			<path d="M20 28h220a6 6 0 0 1 6 6v132a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V34a6 6 0 0 1 6-6Z" />
			<path d="M14 52h232" stroke="rgba(255,255,255,0.4)" />
			<!-- columns -->
			<path d="M90 52v120M170 52v120" stroke="rgba(255,255,255,0.3)" stroke-dasharray="3 5" />
			<!-- cards -->
			<path d="M28 66h52v24H28zM28 98h52v24H28zM28 130h52v22H28z" />
			<path d="M108 66h52v24h-52zM108 98h52v30h-52z" />
			<path d="M188 66h44v28h-44zM188 102h44v22h-44z" />
			<!-- priority marks -->
			<path d="M34 78h18M34 110h26M34 141h14" stroke="rgba(255,255,255,0.4)" />
			<path d="M114 78h30M114 110h34M114 120h22" stroke="rgba(255,255,255,0.4)" />
			<path d="M196 80h26" stroke="#d98324" stroke-width="2" />
			<path d="M196 113h20" stroke="#2aa198" stroke-width="2" />
			<!-- check on a resolved card -->
			<path d="M196 94l5 5 9-10" stroke="#2aa198" stroke-width="1.8" />
		</g>
	</svg>
{/if}
