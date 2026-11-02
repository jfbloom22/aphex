<section class="signup-aside" aria-labelledby="signup-heading">
	<h2 id="signup-heading">Get Lab Notes</h2>
	<p>The latest AI adoption news, and a prompt you can use today.</p>
	<form class="kit-form" onsubmit={(e) => e.preventDefault()}>
		<div class="row">
			<label>
				First name
				<input type="text" name="fields[first_name]" autocomplete="given-name" />
			</label>
			<label>
				Email
				<input type="email" name="email_address" autocomplete="email" required />
			</label>
		</div>
		<button type="submit" disabled>Subscribe (disabled in local eval)</button>
		<p class="fine">
			This is a local preview.
			<a href="https://www.workplacelabs.io/blog/">Subscribe on the live Lab Notes site.</a>
		</p>
	</form>
</section>

<style>
	.kit-form {
		margin-top: 1rem;
		display: grid;
		gap: 0.75rem;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	@media (min-width: 640px) {
		.row {
			flex-direction: row;
		}
		.row label {
			flex: 1;
		}
	}
	label {
		display: grid;
		gap: 0.35rem;
		font-size: 0.875rem;
		font-weight: 500;
	}
	input {
		border: 1px solid #cbd5e1;
		border-radius: 0.375rem;
		padding: 0.5rem 0.75rem;
	}
	button {
		justify-self: start;
		background: var(--wl-navy);
		color: white;
		border: 0;
		border-radius: 0.375rem;
		padding: 0.5rem 1.5rem;
		font-weight: 600;
	}
	button:disabled {
		opacity: 0.7;
	}
	.fine {
		font-size: 0.75rem;
		color: var(--wl-muted);
		margin: 0;
	}
</style>
