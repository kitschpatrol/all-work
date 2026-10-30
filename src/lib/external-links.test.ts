import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openExternalUrl } from '../../electron/open-url.js'
import { parseExternalUrl } from './external-links.js'

const { openExternal, openPath } = vi.hoisted(() => ({
	openExternal: vi.fn<(url: string) => Promise<void>>(),
	openPath: vi.fn<(file: string) => Promise<string>>(),
}))

vi.mock('electron', () => ({ shell: { openExternal, openPath } }))

describe('external links in table cells', () => {
	it.each([
		'https://example.com/docs?version=1#install',
		'file:///workspace/project%20with%20spaces/readme.md',
		'vscode://file/workspace/project%20with%20spaces',
		'vscode-insiders://file/workspace/project',
		'obsidian://open?vault=Projects',
		'mailto:person@example.com',
	])('recognizes %s as an external link', (value) => {
		expect(parseExternalUrl(value)?.href).toBe(value)
	})

	it('encodes spaces in file and app URLs without changing the displayed value', () => {
		expect(parseExternalUrl(' file:///workspace/project with spaces/readme.md ')?.href).toBe(
			'file:///workspace/project%20with%20spaces/readme.md',
		)
		expect(parseExternalUrl('vscode://file/workspace/project with spaces')?.href).toBe(
			'vscode://file/workspace/project%20with%20spaces',
		)
	})

	it.each([
		undefined,
		42,
		'',
		'—',
		'Not scanned',
		'/workspace/project',
		'1.2.3',
		'https://',
		'data:text/html,test',
		'chrome://settings',
		// eslint-disable-next-line no-script-url -- Verify that script URLs remain plain text and cannot be opened.
		'javascript://alert(1)',
	])('keeps non-links and browser-internal URLs as plain text: %s', (value) => {
		expect(parseExternalUrl(value)).toBeUndefined()
	})
})

describe('opening links in the desktop app', () => {
	beforeEach(() => {
		openExternal.mockReset().mockResolvedValue()
		openPath.mockReset().mockResolvedValue('')
	})

	it('opens local files with their decoded path', async () => {
		const file = path.join(os.tmpdir(), 'project #1', 'café', 'readme.md')
		await openExternalUrl(pathToFileURL(file).href)
		expect(openPath).toHaveBeenCalledWith(file)
		expect(openExternal).not.toHaveBeenCalled()
	})

	it.each(['https://example.com/', 'vscode://file/workspace/project'])(
		'opens %s with its system URL handler',
		async (value) => {
			await openExternalUrl(value)
			expect(openExternal).toHaveBeenCalledWith(value)
			expect(openPath).not.toHaveBeenCalled()
		},
	)

	it('reports file-open failures and rejects invalid URLs without opening anything', async () => {
		openPath.mockResolvedValue('File not found')
		await expect(openExternalUrl(pathToFileURL('/missing').href)).rejects.toThrow('File not found')
		openPath.mockClear()
		await expect(openExternalUrl('not a URL')).rejects.toThrow('Invalid external URL')
		expect(openPath).not.toHaveBeenCalled()
		expect(openExternal).not.toHaveBeenCalled()
	})
})
