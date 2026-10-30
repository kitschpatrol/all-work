<script lang="ts">
	import { authorUrl, homepageUrl, metascopeUrl } from '#lib/app-links.js'
	import type { PageProps } from './$types'
	import appIcon from '../../../electron/resources/icons/png/1024x1024.png'

	const { data }: PageProps = $props()
	const version = $derived(data.version)
</script>

<svelte:head>
	<title>About All Work</title>
</svelte:head>

<main class="about-window">
	<img alt="" height="80" src={appIcon} width="80" />
	<h1>All Work</h1>
	{#if version !== ''}<p class="about-detail">Version {version}</p>{/if}
	<p class="about-links">
		Open source on
		<a href={homepageUrl} rel="external noopener noreferrer" target="_blank">GitHub</a><br />Powered
		by
		<a href={metascopeUrl} rel="external noopener noreferrer" target="_blank">Metascope</a>
	</p>
	<p class="about-detail">
		© 2024–2026 <a href={authorUrl} rel="external noopener noreferrer" target="_blank">Eric Mika</a>
	</p>
</main>
