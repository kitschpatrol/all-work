<script lang="ts">
	const iconId = $props.id()
</script>

<svg class="repo-symbol" aria-hidden="true" fill="none" height="18" viewBox="0 0 32 32" width="18">
	<defs>
		<linearGradient
			id="{iconId}-back"
			gradientUnits="userSpaceOnUse"
			x1="16"
			x2="16"
			y1="5"
			y2="27"
		>
			<stop stop-color="#91d5f5" />
			<stop offset="1" stop-color="#469dd1" />
		</linearGradient>
		<linearGradient
			id="{iconId}-front"
			gradientUnits="userSpaceOnUse"
			x1="16"
			x2="16"
			y1="12"
			y2="27"
		>
			<stop stop-color="#c5edfc" />
			<stop offset=".45" stop-color="#91d5f4" />
			<stop offset="1" stop-color="#6bb8e5" />
		</linearGradient>
	</defs>
	<path d="M6 27h20" opacity=".12" stroke="#194766" stroke-linecap="round" stroke-width="2" />
	<path
		d="M3.5 8A2.5 2.5 0 0 1 6 5.5h6.5c.7 0 1.3.3 1.7.8L16 8.5h10a2.5 2.5 0 0 1 2.5 2.5v13a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 24Z"
		fill="url(#{iconId}-back)"
		stroke="#468cbb"
		stroke-width="1.25"
	/>
	<path d="M5 8a1 1 0 0 1 1-1h6.3" stroke="#e2f7ff" stroke-linecap="round" />
	<rect
		fill="url(#{iconId}-front)"
		height="15"
		rx="2.5"
		stroke="#4a91bf"
		stroke-width="1.25"
		width="25"
		x="3.5"
		y="11.5"
	/>
	<path d="M6 12.5h20M4.75 15v8" stroke="#e3f7ff" stroke-linecap="round" stroke-opacity=".7" />
</svg>
