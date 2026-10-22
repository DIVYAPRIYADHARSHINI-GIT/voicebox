import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Server routes are used only for PDF report generation and CSV export;
		// all app data lives in the browser (localStorage), so there is no DB.
		// Runtime pinned explicitly (the adapter refuses to infer one from newer local Node versions).
		adapter: adapter({ runtime: 'nodejs22.x' })
	}
};

export default config;
