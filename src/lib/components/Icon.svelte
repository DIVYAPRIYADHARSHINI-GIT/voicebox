<script lang="ts">
	// Original line-art SVG icon set (no icon library, no emoji).
	// All icons are 24x24, 1.6 stroke, round caps - drawn for VoiceBox.
	interface Props {
		name: string;
		size?: number;
		title?: string;
	}
	const { name, size = 18, title }: Props = $props();

	const paths: Record<string, string> = {
		inbox: 'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5l2-8Z',
		board: 'M4 4h5v16H4zM10.5 4h5v10h-5zM17 4h3v13h-3z',
		dashboard: 'M4 13h6v7H4zM4 4h6v6H4zM14 4h6v9h-6zM14 16h6v4h-6z',
		pulse: 'M3 12h3.5l2-6 3 12 2.5-8 1.6 2H21',
		idea: 'M9 18h6M10 21h4M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.9 1-.9 1.7H9.3c0-.7-.3-1.2-.9-1.7A6 6 0 0 1 12 3Z',
		report: 'M8 3h6l4 4v14H6V5a2 2 0 0 1 2-2ZM14 3v4h4M9 13h6M9 17h6',
		settings: 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM19.4 12a7.4 7.4 0 0 0-.1-1.2l1.8-1.3-1.8-3.1-2.1.8a7 7 0 0 0-2-1.2L14.8 3H9.2l-.4 2a7 7 0 0 0-2 1.2l-2.1-.8-1.8 3.1 1.8 1.3a7.4 7.4 0 0 0 0 2.4l-1.8 1.3 1.8 3.1 2.1-.8c.6.5 1.3.9 2 1.2l.4 2h5.6l.4-2c.7-.3 1.4-.7 2-1.2l2.1.8 1.8-3.1-1.8-1.3c.1-.4.1-.8.1-1.2Z',
		people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M17 7.5a3 3 0 1 1 0 6M18 20a6 6 0 0 0-2-4.4',
		bell: 'M12 3a5.5 5.5 0 0 1 5.5 5.5v4l1.5 3H5l1.5-3v-4A5.5 5.5 0 0 1 12 3ZM10 19a2 2 0 0 0 4 0',
		plus: 'M12 5v14M5 12h14',
		check: 'M4 12.5 9.5 18 20 6.5',
		close: 'M6 6l12 12M18 6 6 18',
		search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM16.2 16.2 21 21',
		filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z',
		chevron: 'm9 6 6 6-6 6',
		chevronDown: 'm6 9 6 6 6-6',
		arrowLeft: 'M20 12H4M10 6l-6 6 6 6',
		upvote: 'm12 4 7 8h-4v8H9v-8H5l7-8Z',
		comment: 'M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z',
		lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5zM12 15v2',
		shield: 'M12 3 20 6v6c0 4.4-3.3 7.8-8 9-4.7-1.2-8-4.6-8-9V6l8-3ZM9 12l2 2 4-4',
		user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0',
		logout: 'M15 5h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h11',
		download: 'M12 4v10M8 11l4 4 4-4M4 19h16',
		upload: 'M12 16V6M8 9l4-4 4 4M4 19h16',
		copy: 'M9 9h10v12H9zM5 15V3h10v2',
		trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
		clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 8v4.5l3 1.8',
		warn: 'M12 4 2.5 20h19L12 4ZM12 10v5M12 17.5v.5',
		info: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 11v5M12 8v.5',
		tag: 'M4 4h7l9 9-7 7-9-9V4ZM8 8h.01',
		sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
		moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
		menu: 'M4 7h16M4 12h16M4 17h16',
		voice: 'M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3ZM6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6',
		link: 'M10 13a4 4 0 0 0 6 .5l2-2a4 4 0 1 0-5.7-5.7l-1 1M14 11a4 4 0 0 0-6-.5l-2 2A4 4 0 1 0 11.7 18l1-1'
	};
</script>

<svg
	class="icon"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden={title ? undefined : 'true'}
	role={title ? 'img' : undefined}
	focusable="false"
>
	{#if title}<title>{title}</title>{/if}
	<path d={paths[name] ?? paths.info} />
</svg>

<style>
	.icon {
		flex: none;
		display: block;
	}
</style>
