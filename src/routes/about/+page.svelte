<script lang="ts">
	// About / privacy: explains demo mode honestly, including what anonymity
	// does and does not protect in a browser-only build.
	import { app } from '$lib/app.svelte.ts';
	import Icon from '$lib/components/Icon.svelte';
</script>

<svelte:head><title>About and privacy - VoiceBox</title></svelte:head>

<div class="public-page">
	<header class="bar">
		<a class="brand" href="/">
			<span class="logo" aria-hidden="true"><Icon name="voice" size={18} /></span>
			<span><span class="wordmark">VoiceBox</span><span class="caption">Speak up. See it through.</span></span>
		</a>
		<span class="spacer"></span>
		<button class="btn ghost icon" onclick={() => app.toggleTheme()} aria-label="Switch between light and dark theme">
			<Icon name={app.settings.theme === 'dark' ? 'sun' : 'moon'} size={16} />
		</button>
		<a class="btn sm" href="/login">Employee sign-in</a>
	</header>

	<main id="main" class="wrap">
		<h1 data-testid="page-title">About VoiceBox</h1>
		<p class="lead">
			VoiceBox is an office feedback system: employees share praise, concerns and ideas - named or anonymous - and can
			follow exactly what happens to them. Managers triage in a separate portal, respond publicly, and report on what
			changed.
		</p>

		<section class="card">
			<h2><Icon name="info" size={17} /> Demo mode</h2>
			<p>
				This deployment runs entirely on free services with <strong>no database, no API keys and no paid tiers</strong>.
				All data - accounts, feedback, pulse answers, notifications and settings - is stored in your browser's local
				storage.
			</p>
			<ul>
				<li>Opening VoiceBox in another browser, another device or a private window shows a separate, empty dataset.</li>
				<li>Clearing site data removes everything. There is no backup on a server because there is no server database.</li>
				<li>Use <strong>JSON backup export/import</strong> in Settings or Reports to move data between browsers.</li>
				<li>Server routes exist only for PDF report generation and CSV export; they receive the data from your browser, render the file, and keep nothing.</li>
			</ul>
		</section>

		<section class="card">
			<h2><Icon name="lock" size={17} /> How anonymity works, and its limits</h2>
			<p>When you tick "Submit anonymously" (or use the public anonymous page), VoiceBox stores:</p>
			<ul>
				<li>the title, description, type, category, urgency and (optionally) the department;</li>
				<li>a random 10-character tracking code;</li>
				<li><strong>no name, no email, no account id</strong> - these fields are never written for an anonymous item.</li>
			</ul>
			<p>
				The anonymous item does not appear under "My feedback", even for you, because nothing links it to your account.
				The tracking code is the only way to follow it, and it cannot be recovered. Exports and PDF reports show
				"Anonymous" and the anonymity rule is enforced again in the export code, not just in the interface.
			</p>
			<p><strong>Limits you should know about:</strong></p>
			<ul>
				<li>
					Anyone with access to this browser profile can open the developer tools and read the stored data, including
					anonymous items. In demo mode the data is not encrypted.
				</li>
				<li>
					Content can still identify you. If you describe a situation only one person could be in, the text itself is
					identifying - no system can fix that.
				</li>
				<li>
					A production deployment would need a server, a database with access controls, audit logging and proper
					key management.
				</li>
			</ul>
		</section>

		<section class="card">
			<h2><Icon name="shield" size={17} /> How sign-in works</h2>
			<p>
				Sign-in is verified on the server. Passwords are hashed with PBKDF2-SHA256 (120,000 iterations and a per-user
				random salt) and only the hash is stored; the session is a signed, HttpOnly cookie the browser cannot read or
				forge. The 5-attempt lockout, the 8-hour session expiry and the 15-minute inactivity sign-out are all enforced
				server-side, and role checks happen in the database query rather than in the interface.
			</p>
			<p>
				It is still a <strong>demo</strong>, not a hardened deployment: the accounts are public, there is no email
				verification or password-reset flow, no rate limiting beyond the lockout, and no audit log.
			</p>
		</section>

		<section class="card">
			<h2><Icon name="people" size={17} /> Roles</h2>
			<ul>
				<li><strong>Employee</strong> - submits feedback, tracks their own named items, upvotes ideas, answers the pulse. Never sees internal notes, other people's named feedback or any manager page.</li>
				<li><strong>Manager</strong> - sees feedback for their own department only, never confidential reports. Triages, assigns, responds and reports.</li>
				<li><strong>Admin/HR</strong> - sees every department and the confidential reports, and manages settings, accounts and exports.</li>
			</ul>
			<p>There is no role switcher: each account has one role, and the two portals have separate sign-in pages.</p>
		</section>

		<section class="card">
			<h2><Icon name="warn" size={17} /> Confidential reports are not an emergency channel</h2>
			<p>
				The "Confidential report" category reaches the Admin/HR role inside this app and nothing more. It is not a
				replacement for emergency services, your organisation's official HR or legal channels, or company policy. If
				anyone is at risk, contact the emergency services first.
			</p>
		</section>

		<section class="card">
			<h2>Sample data</h2>
			<p>
				VoiceBox opens with sample data for a fictional company, <strong>Northwind Studio</strong>: five departments, 19
				demo accounts, about 44 feedback items across every category, status and priority (including overdue and
				anonymous ones), eight weeks of pulse responses and two sample confidential reports. Every person, name and
				incident is invented. No real company, person or event is referenced.
			</p>
		</section>

		<p class="caption">
			<a href="/login">Employee sign-in</a> &middot; <a href="/manager/login">Manager portal</a> &middot;
			<a href="/anonymous">Anonymous feedback</a> &middot; <a href="/track">Track by code</a>
		</p>
	</main>
</div>

<style>
	.public-page {
		min-height: 100vh;
		background: var(--bg);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-3) var(--s-5);
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		color: var(--text);
		text-decoration: none;
	}
	.logo {
		width: 32px;
		height: 32px;
		border-radius: var(--r);
		background: var(--teal);
		color: #fff;
		display: grid;
		place-items: center;
	}
	.wordmark {
		display: block;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.brand .caption {
		display: block;
		font-size: 11px;
	}
	.wrap {
		max-width: 780px;
		margin: 0 auto;
		padding: var(--s-6) var(--s-4) var(--s-7);
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	h1 {
		margin-bottom: 0;
	}
	.lead {
		font-size: 15px;
		margin: 0;
	}
	.card h2 {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		margin-bottom: var(--s-3);
	}
	.card ul {
		margin: 0 0 var(--s-3);
		padding-left: var(--s-5);
		font-size: 13px;
		color: var(--text-2);
	}
	.card li {
		margin-bottom: 6px;
	}
	.card p:last-child {
		margin-bottom: 0;
	}
	@media (max-width: 700px) {
		.bar {
			padding: var(--s-3);
		}
		.wrap {
			padding: var(--s-4) var(--s-3) var(--s-7);
		}
	}
</style>
