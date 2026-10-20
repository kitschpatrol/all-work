import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ColumnMenuRequest } from './electron-api.js'
import type { CommandRun } from './workspace.js'
import { createColumnMenu } from './column-menu.js'

const writeText = vi.fn<(text: string) => Promise<void>>()
const showColumnMenu = vi.fn<(request: ColumnMenuRequest) => Promise<void>>()
const runs: CommandRun[] = [
	{
		command: 'git status',
		concurrency: 1,
		createdAt: '',
		finished: true,
		id: 'run-id',
		results: {},
	},
]

function menu(onError = vi.fn<(error: unknown) => void>()) {
	return createColumnMenu({
		beforeSort: vi.fn<() => void>(),
		getColumn: (id) => ({
			getCanFilter: () => true,
			getCanHide: () => true,
			getCanSort: () => true,
			id,
			toggleSorting: vi.fn<(descending: boolean, multiple: boolean) => void>(),
		}),
		getRows: () => [],
		getRuns: () => runs,
		onError,
		onFilter: vi.fn<(id: string) => void>(),
		onHide: vi.fn<(id: string) => Promise<void>>(),
		onSort: vi.fn<() => void>(),
		pinned: () => ({ start: ['select'], end: [] }),
	})
}

beforeEach(() => {
	writeText.mockResolvedValue()
	showColumnMenu.mockResolvedValue()
	vi.stubGlobal('navigator', { clipboard: { writeText } })
	vi.stubGlobal('_allwork', { showColumnMenu })
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.clearAllMocks()
})

describe('copying a column variable', () => {
	it.each([
		['branch', '$ALLWORK_COLUMN_BRANCH'],
		['run-id', '$ALLWORK_COLUMN_RUN_1'],
	])('copies the %s column as %s, ready to paste into a command', async (id, expected) => {
		menu().actions['column.copyVariable'](id)
		await vi.waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(expected))
	})

	it('copies nothing for a column without a variable', async () => {
		menu().actions['column.copyVariable']('select')
		await Promise.resolve()
		expect(writeText).not.toHaveBeenCalled()
	})

	it('reports a clipboard failure', async () => {
		const onError = vi.fn<(error: unknown) => void>()
		writeText.mockRejectedValueOnce(new Error('Clipboard denied'))
		menu(onError).actions['column.copyVariable']('branch')
		await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('Clipboard denied')))
	})

	it.each([
		['branch', true],
		['select', false],
	])('enables Copy Variable for the %s column: %s', async (id, hasVariable) => {
		await menu().show({ preventDefault: vi.fn() } as unknown as MouseEvent, id)
		expect(showColumnMenu).toHaveBeenCalledWith(expect.objectContaining({ hasVariable }))
	})
})
