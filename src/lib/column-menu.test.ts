import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ColumnMenuRequest, HiddenColumnsMenuRequest } from './electron-api.js'
import type { CommandRun } from './workspace.js'
import { createColumnMenu } from './column-menu.js'

const writeText = vi.fn<(text: string) => Promise<void>>()
const showColumnMenu = vi.fn<(request: ColumnMenuRequest) => Promise<void>>()
const showHiddenColumnsMenu = vi.fn<(request: HiddenColumnsMenuRequest) => Promise<void>>()
const onShow = vi.fn<(id: string) => Promise<void>>()
const optionalColumns = [
	{ category: 'Identity', header: 'Repo owner', id: 'repoOwner', onDemand: false, visible: false },
	{ category: 'Identity', header: 'Name', id: 'name', onDemand: false, visible: true },
	{ category: 'Git', header: 'Sync', id: 'sync', onDemand: false, visible: false },
	{ category: 'Identity', header: 'Remote', id: 'remote', onDemand: false, visible: false },
	{ category: 'Updates', header: 'Outdated', id: 'outdated', onDemand: true, visible: false },
	{ category: 'Runs', header: 'git status', id: 'run-id', onDemand: false, visible: false },
	{ category: 'Runs', header: 'git fetch', id: 'run-2', onDemand: false, visible: true },
]
const runs: CommandRun[] = [
	{
		command: 'git status',
		concurrency: 1,
		createdAt: '',
		finished: true,
		id: 'run-id',
		number: 1,
		results: {},
	},
]

function menu(
	onError = vi.fn<(error: unknown) => void>(),
	overrides: Partial<Parameters<typeof createColumnMenu>[0]> = {},
) {
	return createColumnMenu({
		beforeSort: vi.fn<() => void>(),
		getColumn: (id) => ({
			getCanFilter: () => true,
			getCanHide: () => id !== 'select',
			getCanSort: () => true,
			id,
			toggleSorting: vi.fn<(descending: boolean, multiple: boolean) => void>(),
		}),
		getColumnOrder: () => ['select', 'branch', 'run-id'],
		getOptionalColumns: () => optionalColumns,
		getRows: () => [],
		getRuns: () => runs,
		onError,
		onFilter: vi.fn<(id: string) => void>(),
		onHide: vi.fn<(id: string) => Promise<void>>(),
		onRemoveRuns: vi.fn<(ids: readonly string[]) => void>(),
		onShow,
		onSort: vi.fn<() => void>(),
		pinned: () => ({ start: ['select'], end: [] }),
		sortByExitCode: vi.fn<(runId: string, byExitCode: boolean) => void>(),
		...overrides,
	})
}

beforeEach(() => {
	writeText.mockResolvedValue()
	showColumnMenu.mockResolvedValue()
	showHiddenColumnsMenu.mockResolvedValue()
	onShow.mockResolvedValue()
	vi.stubGlobal('navigator', { clipboard: { writeText } })
	vi.stubGlobal('_allWork', { showColumnMenu, showHiddenColumnsMenu })
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.clearAllMocks()
})

describe('copying a column variable', () => {
	it.each([
		['branch', '$ALL_WORK_COLUMN_BRANCH'],
		['run-id', '$ALL_WORK_COLUMN_RUN_1'],
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

describe('clearing finished runs beside a run column', () => {
	function run(id: string, finished: boolean): CommandRun {
		return { command: id, concurrency: 1, createdAt: '', finished, id, number: 1, results: {} }
	}

	const besideRuns = [run('a', true), run('b', false), run('c', true), run('d', true)]
	// Columns are in display order, which can differ from the order the runs started
	const order = ['select', 'd', 'branch', 'b', 'c', 'a']

	function besideMenu(onRemoveRuns = vi.fn<(ids: readonly string[]) => void>()) {
		return menu(undefined, { getColumnOrder: () => order, getRuns: () => besideRuns, onRemoveRuns })
	}

	it('clears only finished runs on the chosen side, in display order', () => {
		const onRemoveRuns = vi.fn<(ids: readonly string[]) => void>()
		besideMenu(onRemoveRuns).actions['column.clearFinishedLeft']('c')
		besideMenu(onRemoveRuns).actions['column.clearFinishedRight']('b')
		expect(onRemoveRuns.mock.calls).toEqual([[['d']], [['c', 'a']]])
	})

	it('clears nothing past the table edge or for an unknown column', () => {
		const onRemoveRuns = vi.fn<(ids: readonly string[]) => void>()
		besideMenu(onRemoveRuns).actions['column.clearFinishedRight']('a')
		besideMenu(onRemoveRuns).actions['column.clearFinishedLeft']('missing')
		besideMenu(onRemoveRuns).actions['column.clearFinishedLeft']()
		expect(onRemoveRuns).not.toHaveBeenCalled()
	})

	it('offers the actions only for run columns, enabled when finished runs are beside it', async () => {
		const rightClick = { preventDefault: vi.fn() } as unknown as MouseEvent
		await besideMenu().show(rightClick, 'b')
		await besideMenu().show(rightClick, 'a')
		await besideMenu().show(rightClick, 'branch')
		expect(showColumnMenu.mock.calls.map(([request]) => request)).toMatchObject([
			{ hasFinishedRunsLeft: true, hasFinishedRunsRight: true, isRun: true },
			{ hasFinishedRunsLeft: true, hasFinishedRunsRight: false, isRun: true },
			{ isRun: false },
		])
	})
})

describe('showing hidden columns from the empty header space', () => {
	const preventDefault = vi.fn<() => void>()
	const rightClick = { preventDefault } as unknown as MouseEvent

	it('lists only hidden columns, grouped by category in column order', async () => {
		await menu().showHidden(rightClick)
		expect(preventDefault).toHaveBeenCalled()
		expect(showHiddenColumnsMenu).toHaveBeenCalledExactlyOnceWith({
			groups: [
				{
					category: 'Identity',
					columns: [
						{ id: 'repoOwner', label: 'Repo owner' },
						{ id: 'remote', label: 'Remote' },
					],
				},
				{ category: 'Git', columns: [{ id: 'sync', label: 'Sync' }] },
				{ category: 'Updates', columns: [{ id: 'outdated', label: 'Outdated · on demand' }] },
				{ category: 'Runs', columns: [{ id: 'run-id', label: 'git status' }] },
			],
		})
	})

	it('leaves the browser context menu alone outside Electron', async () => {
		vi.stubGlobal('_allWork', undefined)
		await menu().showHidden(rightClick)
		expect(preventDefault).not.toHaveBeenCalled()
	})

	it('reports a menu failure', async () => {
		const onError = vi.fn<(error: unknown) => void>()
		showHiddenColumnsMenu.mockRejectedValueOnce(new Error('Invalid hidden columns menu request.'))
		await menu(onError).showHidden(rightClick)
		expect(onError).toHaveBeenCalledWith(new Error('Invalid hidden columns menu request.'))
	})

	it('shows the chosen column', async () => {
		menu().actions['column.show']('sync')
		await vi.waitFor(() => expect(onShow).toHaveBeenCalledExactlyOnceWith('sync'))
	})

	it.each([undefined, 'select'])('ignores a column that cannot be shown or hidden: %s', (id) => {
		menu().actions['column.show'](id)
		expect(onShow).not.toHaveBeenCalled()
	})

	it('reports a failure to show the column', async () => {
		const onError = vi.fn<(error: unknown) => void>()
		onShow.mockRejectedValueOnce(new Error('Could not show column'))
		menu(onError).actions['column.show']('sync')
		await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('Could not show column')))
	})
})

describe('sorting from a column menu', () => {
	function sortable() {
		const toggleSorting = vi.fn<(descending: boolean, multiple: boolean) => void>()
		const sortByExitCode = vi.fn<(runId: string, byExitCode: boolean) => void>()
		const { actions } = menu(undefined, {
			getColumn: (id) => ({
				getCanFilter: () => true,
				getCanHide: () => true,
				getCanSort: () => true,
				id,
				toggleSorting,
			}),
			sortByExitCode,
		})
		return { actions, sortByExitCode, toggleSorting }
	}

	it.each([
		['column.sortExitCodeAscending', true, false],
		['column.sortExitCodeDescending', true, true],
		['column.sortAscending', false, false],
		['column.sortDescending', false, true],
	] as const)(
		'%s sorts a run column by exit code: %s, descending: %s',
		(action, byExitCode, descending) => {
			const { actions, sortByExitCode, toggleSorting } = sortable()
			actions[action]('run-id')
			expect(sortByExitCode).toHaveBeenCalledExactlyOnceWith('run-id', byExitCode)
			expect(toggleSorting).toHaveBeenCalledExactlyOnceWith(descending, false)
		},
	)

	it('sorts other columns by their values, and never by exit code', () => {
		const { actions, sortByExitCode, toggleSorting } = sortable()
		actions['column.sortDescending']('branch')
		expect(toggleSorting).toHaveBeenCalledExactlyOnceWith(true, false)
		actions['column.sortExitCodeAscending']('branch')
		expect(toggleSorting).toHaveBeenCalledOnce()
		expect(sortByExitCode).not.toHaveBeenCalled()
	})

	it('offers the run sort items only on run columns', async () => {
		const columnMenu = menu()
		const event = { preventDefault: vi.fn<() => void>() } as unknown as MouseEvent
		await columnMenu.show(event, 'run-id')
		await columnMenu.show(event, 'branch')
		expect(showColumnMenu.mock.calls.map(([request]) => request.isRun)).toEqual([true, false])
	})
})
