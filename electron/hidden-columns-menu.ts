import type { MenuItemConstructorOptions } from 'electron'
import type { HiddenColumnsMenuRequest } from '../src/lib/electron-api.js'

/** Build the same grouped column list for an empty header or Add Column submenu. */
export function hiddenColumnsMenuItems(
	request: HiddenColumnsMenuRequest,
	onChoose: (id: string) => void,
): MenuItemConstructorOptions[] {
	// Section headers need macOS 14; elsewhere a disabled item labels each category
	const items = request.groups.flatMap(({ category, columns }, index) => [
		...(index > 0 ? [{ type: 'separator' } as const] : []),
		process.platform === 'darwin'
			? ({ label: category, type: 'header' } as const)
			: { enabled: false, label: category },
		...columns.map(({ id, label }): MenuItemConstructorOptions => ({
			click() {
				onChoose(id)
			},
			label,
		})),
	])
	return items.length > 0 ? items : [{ enabled: false, label: 'All Columns Shown' }]
}
