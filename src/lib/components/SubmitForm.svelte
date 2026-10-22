<script lang="ts">
	import { untrack } from 'svelte';
	// Submit feedback. Used by the employee portal (/app) and the public
	// anonymous page (/anonymous, forced anonymous, no sign-in).
	import { app } from '$lib/app.svelte.ts';
	import { CONFIDENTIAL_CATEGORY, TYPES, URGENCIES, type FeedbackType, type Urgency, type Feedback } from '$lib/core/types.ts';
	import { DESCRIPTION_MAX, TITLE_MAX, canBePublic, estimateSentiment, findSimilar, validateDraft } from '$lib/core/rules.ts';
	import Icon from './Icon.svelte';
	import Pill from './Pill.svelte';
	import TrackingCode from './TrackingCode.svelte';

	interface Props {
		/** Public page: anonymous is forced on and cannot be switched off. */
		forceAnonymous?: boolean;
	}
	const { forceAnonymous = false }: Props = $props();

	let title = $state('');
	let description = $state('');
	let type = $state<FeedbackType>('Suggestion');
	let category = $state('Culture');
	let department = $state('');
	let urgency = $state<Urgency>('Medium');
	// The public page forces anonymous; the portal form starts opted out.
	let anonymous = $state(untrack(() => forceAnonymous));
	let makePublic = $state(true);
	let confidentialAck = $state(false);
	let errors = $state<Record<string, string>>({});
	let submitted = $state<Feedback | null>(null);
	let busy = $state(false);

	// Prefill the department from the account (optional for anonymous).
	$effect(() => {
		if (!department && app.account?.department) department = app.account.department;
	});

	const isConfidential = $derived(category === CONFIDENTIAL_CATEGORY);
	const sentiment = $derived(
		title.trim().length + description.trim().length > 12
			? estimateSentiment(`${title} ${description}`, app.settings.sentimentPositive, app.settings.sentimentNegative)
			: null
	);
	// Matched against the public ideas the server returned for this portal.
	const similar = $derived(title.trim().length >= 8 ? findSimilar(app.ideas, title) : []);
	const publicAllowed = $derived(canBePublic({ category, type }));

	$effect(() => {
		if (isConfidential) {
			anonymous = anonymous || forceAnonymous;
			makePublic = false;
		}
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		const draft = { title, description, category, department, urgency, confidentialAck };
		const result = validateDraft(draft);
		errors = result.errors;
		if (!result.ok) {
			document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			return;
		}

		// Goes to the shared store, so it is visible to managers on every device.
		busy = true;
		const res = await app.submitFeedback({
			title,
			description,
			type,
			category,
			department,
			urgency,
			anonymous: forceAnonymous || anonymous,
			makePublic: makePublic && publicAllowed,
			confidentialAck
		});
		busy = false;

		if (!res.ok) {
			errors = res.errors ?? {};
			app.toast(res.error ?? 'Could not submit your feedback.', 'error');
			return;
		}
		submitted = res.item ?? null;
		app.toast('Feedback submitted.', 'success');
	}

	function reset() {
		submitted = null;
		title = '';
		description = '';
		confidentialAck = false;
		errors = {};
	}
</script>

{#if submitted}
	<div class="card success" data-testid="submit-success">
		<div class="success-head">
			<span class="tickmark" aria-hidden="true"><Icon name="check" size={22} /></span>
			<div>
				<h2>Thank you - your feedback was received</h2>
				<p style="margin:4px 0 0">
					{submitted.anonymous
						? 'It was submitted anonymously. No name or account id was stored with it.'
						: 'You can follow it under "My feedback" and you will be notified when the status changes.'}
				</p>
			</div>
		</div>

		{#if submitted.trackingCode}
			<TrackingCode code={submitted.trackingCode} />
		{/if}

		<div class="recap">
			<div><span class="caption">Type</span><Pill kind="type" value={submitted.type} /></div>
			<div><span class="caption">Category</span><Pill kind="plain" value={submitted.category} /></div>
			<div><span class="caption">Status</span><Pill kind="status" value={submitted.status} /></div>
			<div><span class="caption">Sentiment (auto-estimated)</span><Pill kind="sentiment" value={submitted.sentiment} /></div>
		</div>

		<div class="row" style="margin-top:var(--s-4)">
			<button class="btn primary" onclick={reset} data-testid="submit-another">Submit more feedback</button>
			{#if !submitted.anonymous}<a class="btn" href="/app/my-feedback">Go to My feedback</a>{/if}
			{#if submitted.trackingCode}<a class="btn" href="/track">Track by code</a>{/if}
		</div>
	</div>
{:else}
	<form class="card" onsubmit={submit} novalidate data-testid="submit-form">
		<div class="field">
			<label for="f-title">Title</label>
			<input
				id="f-title"
				class="input"
				bind:value={title}
				maxlength={TITLE_MAX}
				placeholder="One line that sums it up"
				data-testid="f-title"
				aria-invalid={errors.title ? 'true' : undefined}
				aria-describedby="title-count"
			/>
			<div class="row" style="justify-content:space-between">
				{#if errors.title}<span class="error-text" role="alert">{errors.title}</span>{:else}<span class="hint">A clear title helps it reach the right person.</span>{/if}
				<span class="hint num" id="title-count" data-testid="title-count">{title.length}/{TITLE_MAX}</span>
			</div>
		</div>

		{#if similar.length > 0}
			<div class="notice info" data-testid="similar-notice">
				<Icon name="idea" size={16} />
				<div>
					<strong>Similar feedback already exists.</strong> You can upvote it instead of adding a duplicate:
					<ul class="similar">
						{#each similar as s (s.id)}
							<li><a href="/app/ideas?item={s.id}">{s.title}</a> <span class="caption">({s.upvotes.length} upvotes, {s.status})</span></li>
						{/each}
					</ul>
				</div>
			</div>
		{/if}

		<div class="field">
			<label for="f-desc">Description</label>
			<textarea
				id="f-desc"
				class="input"
				bind:value={description}
				maxlength={DESCRIPTION_MAX}
				rows="7"
				placeholder="What happened, what would help, and anything that makes it easier to act on."
				data-testid="f-description"
				aria-invalid={errors.description ? 'true' : undefined}
				aria-describedby="desc-count"
			></textarea>
			<div class="row" style="justify-content:space-between">
				{#if errors.description}<span class="error-text" role="alert">{errors.description}</span>{:else}<span class="hint">At least 20 characters.</span>{/if}
				<span class="hint num" id="desc-count" data-testid="desc-count">{description.length}/{DESCRIPTION_MAX}</span>
			</div>
		</div>

		<div class="grid-2">
			<div class="field">
				<label for="f-type">Type</label>
				<select id="f-type" class="input" bind:value={type} data-testid="f-type">
					{#each TYPES as t}<option value={t}>{t}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="f-category">Category</label>
				<select id="f-category" class="input" bind:value={category} data-testid="f-category" aria-invalid={errors.category ? 'true' : undefined}>
					{#each app.settings.categories as c}<option value={c}>{c}</option>{/each}
				</select>
			</div>
		</div>

		<div class="grid-2">
			<div class="field">
				<label for="f-dept">Department {#if !app.account}<span class="hint">(optional)</span>{/if}</label>
				<select id="f-dept" class="input" bind:value={department} data-testid="f-department">
					<option value="">Not specified</option>
					{#each app.settings.departments as d}<option value={d}>{d}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="f-urgency">How urgent is this, in your view?</label>
				<select id="f-urgency" class="input" bind:value={urgency} data-testid="f-urgency">
					{#each URGENCIES as u}<option value={u}>{u}</option>{/each}
				</select>
			</div>
		</div>

		{#if isConfidential}
			<div class="notice danger" data-testid="confidential-notice">
				<Icon name="shield" size={18} />
				<div>
					<strong>Before you send a confidential report</strong>
					<p style="margin:var(--s-2) 0; color:inherit">
						This is not a replacement for emergency services, your official HR or legal channels, or company policy. It is
						only a way to reach the Admin/HR role inside this app. If anyone is in danger, contact the emergency services
						first. For formal grievances, use the official process in the employee handbook.
					</p>
					<label class="check" style="color:inherit">
						<input type="checkbox" bind:checked={confidentialAck} data-testid="confidential-ack" />
						I have read this notice and still want to send a confidential report.
					</label>
					{#if errors.confidentialAck}<p class="error-text" role="alert" style="margin:var(--s-2) 0 0">{errors.confidentialAck}</p>{/if}
				</div>
			</div>
		{/if}

		<div class="anon-block">
			<div class="anon-main">
				{#if forceAnonymous}
					<div class="row">
						<Pill kind="anon" value="Anonymous submission" />
					</div>
					<p class="hint" style="margin:var(--s-2) 0 0">
						This public page always submits anonymously. No name, email or account id is stored with your feedback.
					</p>
				{:else}
					<label class="check">
						<input type="checkbox" bind:checked={anonymous} disabled={isConfidential && anonymous} data-testid="f-anonymous" />
						<span>
							<strong>Submit anonymously</strong>
							<span class="hint" style="display:block">Your name and account id are not stored with the feedback.</span>
						</span>
					</label>
				{/if}
			</div>
			<div class="privacy">
				<strong>What anonymous means here</strong>
				<p>
					{#if anonymous || forceAnonymous}
						Nothing identifying is saved: no name, no email, no account id. In exchange, it will not appear under
						"My feedback" - you get a tracking code instead, and that code is the only way to follow it.
					{:else}
						Your name is attached so managers can follow up with you directly, and the item appears under "My feedback".
						Internal notes written by managers are never shown to you.
					{/if}
				</p>
			</div>
		</div>

		{#if publicAllowed}
			<label class="check" style="margin-bottom:var(--s-4)">
				<input type="checkbox" bind:checked={makePublic} data-testid="f-public" />
				<span>
					Show this on the public ideas board so colleagues can upvote it
					<span class="hint" style="display:block">Concerns about individuals and confidential reports are never made public.</span>
				</span>
			</label>
		{/if}

		{#if sentiment}
			<div class="row" style="margin-bottom:var(--s-4)" data-testid="sentiment-preview">
				<span class="caption">Auto-estimated sentiment</span>
				<Pill kind="sentiment" value={sentiment} />
				<span class="caption">from a bundled keyword list - no AI. A manager can correct it.</span>
			</div>
		{/if}

		<button class="btn primary" type="submit" disabled={busy} data-testid="submit-feedback">{busy ? 'Submitting...' : 'Submit feedback'}</button>
	</form>
{/if}

<style>
	.success-head {
		display: flex;
		gap: var(--s-4);
		align-items: flex-start;
		margin-bottom: var(--s-4);
	}
	.tickmark {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--green-050);
		color: var(--green);
		display: grid;
		place-items: center;
		flex: none;
	}
	.recap {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-5);
		padding-top: var(--s-4);
		border-top: 1px solid var(--border);
	}
	.recap > div {
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-start;
	}
	.similar {
		margin: var(--s-2) 0 0;
		padding-left: var(--s-4);
		font-size: 13px;
	}
	.anon-block {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--s-4);
		align-items: start;
		border: 1px solid var(--border);
		border-radius: var(--r);
		background: var(--surface-2);
		padding: var(--s-4);
		margin-bottom: var(--s-4);
	}
	.privacy {
		border-left: 2px solid var(--teal);
		padding-left: var(--s-3);
		font-size: 12px;
	}
	.privacy strong {
		font-size: 12px;
		display: block;
		margin-bottom: 4px;
	}
	.privacy p {
		margin: 0;
		font-size: 12px;
		color: var(--text-3);
	}
	@media (max-width: 700px) {
		.anon-block {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
