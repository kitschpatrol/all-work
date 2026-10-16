<script lang="ts">
	const { onPreferences }: { onPreferences: () => void } = $props()
</script>

<div class="app-identity">
	<h1>AllWork</h1>
	<button
		class="button icon-button"
		aria-label="Preferences"
		onclick={onPreferences}
		title="Preferences… (⌘,)"
		type="button"
		><svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16"
			><path
				d="M6.90 3.23L7.10 1.56L8.90 1.56L9.10 3.23A4.9 4.9 0 0 1 10.60 3.84L11.91 2.81L13.19 4.09L12.16 5.40A4.9 4.9 0 0 1 12.77 6.90L14.44 7.10L14.44 8.90L12.77 9.10A4.9 4.9 0 0 1 12.16 10.60L13.19 11.91L11.91 13.19L10.60 12.16A4.9 4.9 0 0 1 9.10 12.77L8.90 14.44L7.10 14.44L6.90 12.77A4.9 4.9 0 0 1 5.40 12.16L4.09 13.19L2.81 11.91L3.84 10.60A4.9 4.9 0 0 1 3.23 9.10L1.56 8.90L1.56 7.10L3.23 6.90A4.9 4.9 0 0 1 3.84 5.40L2.81 4.09L4.09 2.81L5.40 3.84A4.9 4.9 0 0 1 6.90 3.23Z"
				stroke="currentColor"
				stroke-linejoin="round"
			/><circle cx="8" cy="8" r="2" stroke="currentColor" /></svg
		></button
	>
</div>
