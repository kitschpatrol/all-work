/**
 * Propose a name for a new preset: the lowest "Custom N" not already in use,
 * compared case-insensitively.
 *
 * @param labels Names of the existing presets.
 *
 * @returns A name such as "Custom 1" or "Custom 3".
 */
export function nextCustomName(labels: Iterable<string>): string {
	const taken = new Set(Array.from(labels, (label) => label.trim().toLowerCase()))
	let number = 1
	while (taken.has(`custom ${number}`)) {
		number++
	}

	return `Custom ${number}`
}
