import type { Dirent } from 'node:fs'

const readmePattern = /^readme(?:\.[^.]+)?$/iv
const markdownPattern = /\.(?:md|markdown)$/iv

/**
 * Choose the readme from a repository root listing, preferring Markdown over
 * other formats. Symlinks are ignored so the opened file stays inside the
 * repository.
 *
 * @returns The readme file name, or an empty string when there is none.
 */
export function findReadme(entries: readonly Dirent[]): string {
	const names = entries
		.filter((entry) => entry.isFile() && readmePattern.test(entry.name))
		.map((entry) => entry.name)
		.toSorted()
	return names.find((name) => markdownPattern.test(name)) ?? names[0] ?? ''
}
