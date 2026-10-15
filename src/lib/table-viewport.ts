/** Prioritize selected repositories and rows intersecting the table viewport. */
export function getVisibleRepositoryIds(container: HTMLElement, selectedIds: string[]): string[] {
	const bounds = container.getBoundingClientRect()
	const rows = [...container.querySelectorAll<HTMLElement>('tr[data-repository-id]')]
	const inView = rows
		.filter((row) => {
			const position = row.getBoundingClientRect()
			return position.bottom >= bounds.top && position.top <= bounds.bottom
		})
		.map((row) => row.dataset.repositoryId ?? '')
	return [...new Set([...selectedIds, ...inView])]
}
