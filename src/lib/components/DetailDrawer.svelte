<script lang="ts">
	// Item detail: right-side drawer on desktop, full page on mobile.
	// Shows full text, status controls, priority, owner, due date, tags, the
	// public response box, internal notes (never visible to employees) and the
	// status history timeline.
	import { app } from '$lib/app.svelte.ts';
	import { PRIORITIES, SENTIMENTS, type Feedback, type Priority, type Sentiment, type Status } from '$lib/core/types.ts';
	import { isConfidential, nextStatuses, submitterLabel } from '$lib/core/rules.ts';
	import { formatDate, formatDateTime, isoDate, parseDateInput, relative } from '$lib/core/time.ts';
	import Icon from './Icon.svelte';
	import Pill from './Pill.svelte';
	import FeedbackTimeline from './FeedbackTimeline.svelte';
	import Modal from './Modal.svelte';

	interface Props {
		item: Feedback;
		onclose: () => void;
	}
	const { item, onclose }: Props = $props();

	const QUICK_REPLIES = [
		'Thanks, we are looking into this.',
		'We have fixed this.',
		'Thank you for raising this - we have shared it with the team.',
		'We are not able to act on this right now, but it is recorded.'
	];

	let response = $state('');
	let note = $state('');
	let tag = $state('');
	let declineOpen = $state(false);
	let declineReason = $state('');
	let sensitiveAck = $state(false);
	let busy = $state(false);

	// Reset editor state whenever a different item is opened.
	let lastId = $state('');
	$effect(() => {
		if (item.id !== lastId) {
			lastId = item.id;
			response = '';
			note = '';
			tag = '';
			declineReason = '';
			sensitiveAck = !isConfidential(item);
		}
	});

	const confidential = $derived(isConfidential(item));
	const overdue = $derived(app.overdue(item));

	async function changeStatus(to: Status) {
		if (to === 'Declined') {
			declineOpen = true;
			return;
		}
		busy = true;
		const res = await app.setStatus(item.id, to);
		busy = false;
		if (!res.ok) app.toast(res.error ?? 'Could not change the status.', 'error');
		else app.toast(`Status changed to ${to}.`, 'success');
	}

	async function decline() {
		const res = await app.setStatus(item.id, 'Declined', declineReason);
		if (!res.ok) {
			app.toast(res.error ?? 'A reason is required to decline.', 'error');
			return;
		}
		declineOpen = false;
		declineReason = '';
		app.toast('Feedback declined with a reason.', 'success');
	}

	async function sendResponse() {
		if (!response.trim()) return;
		busy = true;
		await app.addResponse(item.id, response);
		busy = false;
		response = '';
		app.toast('Public response added. The submitter was notified.', 'success');
	}

	async function addNote() {
		if (!note.trim()) return;
		busy = true;
		await app.addNote(item.id, note);
		busy = false;
		note = '';
		app.toast('Internal note saved. Employees never see it.', 'success');
	}

	async function addTag() {
		if (!tag.trim()) return;
		const value = tag;
		tag = '';
		await app.addTag(item.id, value);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="drawer-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
	<div class="drawer" role="dialog" aria-modal="true" aria-label="Feedback detail" data-testid="detail-drawer">
		<header>
			<div class="row" style="gap:var(--s-2)">
				<Pill kind="status" value={item.status} />
				{#if overdue}<Pill kind="overdue" value="Overdue" />{/if}
				{#if confidential}<Pill kind="sensitive" value="Sensitive" />{/if}
			</div>
			<button class="btn ghost icon" onclick={onclose} aria-label="Close detail" data-testid="close-detail"><Icon name="close" size={18} /></button>
		</header>

		{#if confidential && !sensitiveAck}
			<div class="body">
				<div class="notice danger" data-testid="sensitive-gate">
					<Icon name="shield" size={18} />
					<div>
						<strong>Confidential report</strong>
						<p style="margin:var(--s-2) 0; color:inherit">
							This report is visible to Admin/HR only. It is never public, never shown to department managers, and is
							excluded from exports unless you explicitly include confidential reports. Handle it through the official
							process; this app is only the intake channel.
						</p>
						<button class="btn danger" onclick={() => (sensitiveAck = true)} data-testid="sensitive-continue">I understand - open the report</button>
					</div>
				</div>
			</div>
		{:else}
			<div class="body">
				<h2>{item.title}</h2>
				<div class="meta-row">
					<Pill kind="type" value={item.type} />
					<Pill kind="plain" value={item.category} />
					<Pill kind="plain" value={item.department} />
					<span class="pill {item.anonymous ? 'anon' : ''}">
						<Icon name={item.anonymous ? 'lock' : 'user'} size={12} />
						{submitterLabel(item)}
					</span>
					<span class="caption">Submitted {formatDateTime(item.createdAt)}</span>
				</div>

				<p class="desc">{item.description}</p>

				<div class="controls">
					<div class="ctl">
						<span class="label">Status</span>
						<div class="row" style="gap:6px">
							{#each nextStatuses(item.status) as s}
								<button class="btn sm" class:danger={s === 'Declined'} onclick={() => void changeStatus(s)} data-testid="status-{s.toLowerCase().replace(/ /g, '-')}">{s}</button>
							{/each}
						</div>
					</div>

					<div class="grid-2">
						<div class="ctl">
							<label class="label" for="d-priority">Priority</label>
							<select id="d-priority" class="input" value={item.priority} onchange={(e) => void app.setPriority(item.id, e.currentTarget.value as Priority)} data-testid="set-priority">
								{#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
							</select>
						</div>
						<div class="ctl">
							<label class="label" for="d-owner">Owner</label>
							<select id="d-owner" class="input" value={item.ownerId ?? ''} onchange={(e) => void app.setOwner(item.id, e.currentTarget.value)} data-testid="set-owner">
								<option value="">Unassigned</option>
								{#each app.owners as o (o.id)}<option value={o.id}>{o.name} ({o.department})</option>{/each}
							</select>
						</div>
					</div>

					<div class="grid-2">
						<div class="ctl">
							<label class="label" for="d-due">Due date</label>
							<input
								id="d-due"
								class="input"
								type="date"
								value={item.dueDate ? isoDate(item.dueDate) : ''}
								onchange={(e) => void app.setDueDate(item.id, parseDateInput(e.currentTarget.value))}
								data-testid="set-due"
							/>
							<span class="hint">SLA target: {formatDate(app.due(item))} ({relative(app.due(item))})</span>
						</div>
						<div class="ctl">
							<label class="label" for="d-sentiment">Sentiment <span class="hint">(auto-estimated)</span></label>
							<select id="d-sentiment" class="input" value={item.sentiment} onchange={(e) => void app.setSentiment(item.id, e.currentTarget.value as Sentiment)} data-testid="set-sentiment">
								{#each SENTIMENTS as s}<option value={s}>{s}</option>{/each}
							</select>
							{#if item.sentimentOverridden}<span class="hint">Overridden by a manager</span>{/if}
						</div>
					</div>

					<div class="ctl">
						<span class="label">Tags</span>
						<div class="tags">
							{#each item.tags as t (t)}
								<span class="pill">
									{t}
									<button class="tagx" onclick={() => void app.removeTag(item.id, t)} aria-label="Remove tag {t}"><Icon name="close" size={11} /></button>
								</span>
							{/each}
						</div>
						<div class="row" style="margin-top:var(--s-2)">
							<input class="input" style="flex:1; min-width:140px" bind:value={tag} placeholder="Add a tag" aria-label="Add a tag" data-testid="tag-input" onkeydown={(e) => e.key === 'Enter' && void addTag()} />
							<button class="btn sm" onclick={() => void addTag()} data-testid="add-tag">Add</button>
						</div>
					</div>
				</div>

				<section>
					<h3>Public response <span class="hint">visible to the submitter</span></h3>
					{#if item.responses.length}
						<div class="stack" style="gap:var(--s-2); margin-bottom:var(--s-3)">
							{#each item.responses as r (r.id)}
								<div class="response">
									<div class="caption">{r.authorName} &middot; {formatDateTime(r.at)}</div>
									<p style="margin:4px 0 0; color:var(--text)">{r.text}</p>
								</div>
							{/each}
						</div>
					{/if}
					<div class="quick">
						{#each QUICK_REPLIES as q}
							<button class="btn sm ghost" onclick={() => (response = q)} data-testid="quick-reply">{q}</button>
						{/each}
					</div>
					<textarea class="input" rows="3" bind:value={response} placeholder="Write a response the submitter will see" aria-label="Public response" data-testid="response-box"></textarea>
					<button class="btn primary sm" style="margin-top:var(--s-2)" onclick={() => void sendResponse()} disabled={!response.trim()} data-testid="send-response">Send response</button>
				</section>

				<section>
					<h3>Internal notes <span class="hint">never visible to employees</span></h3>
					{#if item.notes.length}
						<div class="stack" style="gap:var(--s-2); margin-bottom:var(--s-3)">
							{#each item.notes as n (n.id)}
								<div class="note" data-testid="internal-note">
									<div class="caption">{n.authorName} &middot; {formatDateTime(n.at)}</div>
									<p style="margin:4px 0 0">{n.text}</p>
								</div>
							{/each}
						</div>
					{/if}
					<textarea class="input" rows="2" bind:value={note} placeholder="Add a private note for the triage team" aria-label="Internal note" data-testid="note-box"></textarea>
					<button class="btn sm" style="margin-top:var(--s-2)" onclick={() => void addNote()} disabled={!note.trim()} data-testid="add-note">Add note</button>
				</section>

				<section>
					<h3>Status history</h3>
					<FeedbackTimeline {item} />
				</section>

				<div class="row foot-actions">
					<button class="btn sm" onclick={() => void app.markRead(item.id, app.isUnread(item))} data-testid="mark-read">
						<Icon name="check" size={14} />
						{app.isUnread(item) ? 'Mark as read' : 'Mark as unread'}
					</button>
					{#if item.isPublic}<span class="pill"><Icon name="idea" size={12} /> On the ideas board &middot; {item.upvotes.length} upvotes</span>{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<Modal
	open={declineOpen}
	title="Decline this feedback"
	description="A reason is required. It is shown to the submitter and recorded in the status history."
	onclose={() => (declineOpen = false)}
	testid="decline-dialog"
>
	<div class="field">
		<label for="decline-reason">Reason</label>
		<textarea
			id="decline-reason"
			class="input"
			rows="4"
			bind:value={declineReason}
			data-testid="decline-reason"
			placeholder="Explain why this cannot be taken forward"
			data-autofocus
		></textarea>
	</div>
	{#snippet footer()}
		<button class="btn" onclick={() => (declineOpen = false)}>Cancel</button>
		<button class="btn danger" onclick={() => void decline()} disabled={!declineReason.trim()} data-testid="decline-confirm">Decline</button>
	{/snippet}
</Modal>

<style>
	.drawer-scrim {
		position: fixed;
		inset: 0;
		background: rgba(20, 33, 61, 0.35);
		z-index: 50;
		display: flex;
		justify-content: flex-end;
	}
	.drawer {
		width: min(560px, 100%);
		background: var(--surface);
		border-left: 1px solid var(--border);
		box-shadow: var(--shadow-3);
		display: flex;
		flex-direction: column;
		animation: slide 0.16s ease;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		padding: var(--s-3) var(--s-4);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		background: var(--surface);
		z-index: 2;
	}
	.body {
		padding: var(--s-5);
		overflow-y: auto;
		flex: 1;
	}
	.body h2 {
		margin-bottom: var(--s-3);
	}
	.meta-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		align-items: center;
		margin-bottom: var(--s-4);
	}
	.desc {
		white-space: pre-wrap;
		padding-bottom: var(--s-4);
		border-bottom: 1px solid var(--border);
	}
	.controls {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
		padding: var(--s-4) 0;
		border-bottom: 1px solid var(--border);
	}
	.ctl {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	section {
		padding: var(--s-4) 0;
		border-bottom: 1px solid var(--border);
	}
	section h3 {
		margin-bottom: var(--s-3);
	}
	section h3 .hint {
		font-weight: 400;
	}
	.quick {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: var(--s-2);
	}
	.quick .btn {
		border: 1px dashed var(--border-strong);
		font-size: 12px;
	}
	.response {
		border-left: 2px solid var(--teal);
		background: var(--surface-2);
		padding: var(--s-3);
		border-radius: 0 var(--r) var(--r) 0;
	}
	.note {
		border-left: 2px solid var(--amber);
		background: var(--amber-050);
		padding: var(--s-3);
		border-radius: 0 var(--r) var(--r) 0;
		font-size: 13px;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tagx {
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		color: var(--text-3);
		display: flex;
	}
	.foot-actions {
		padding-top: var(--s-4);
	}
	@keyframes slide {
		from {
			transform: translateX(16px);
			opacity: 0.6;
		}
	}
	@media (max-width: 700px) {
		.drawer {
			width: 100%;
			border-left: 0;
		}
		.body {
			padding: var(--s-4) var(--s-3);
		}
	}
</style>
