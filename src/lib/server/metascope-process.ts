import type { getMetadata } from 'metascope'
// eslint-disable-next-line depend/ban-dependencies -- Execa provides process-tree cancellation, timeouts, and bounded output.
import { execa } from 'execa'

// An independent Node process keeps repository walking, WASM parsers, and
// large Git histories off the HTTP server's event loop. Stdin carries options
// so credentials never become command-line arguments.
const scanner = `
import { readFileSync } from 'node:fs'
const { moduleUrl, options } = JSON.parse(readFileSync(0, 'utf8'))
try {
  const { getMetadata, setLogger } = await import(moduleUrl)
  setLogger({ log() {}, info() {}, warn() {}, error() {}, debug() {} })
  const data = await getMetadata(options) ?? {}
  const records = Array.isArray(data.codeStats) ? data.codeStats : [data.codeStats]
  for (const record of records) {
    if (record?.data) delete record.data.perLanguage
  }
  process.stdout.write(JSON.stringify({ data }))
} catch (error) {
  process.stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
}
`

/** Extract Metascope sources in a cancellable process with a bounded lifetime. */
export async function extractMetadata(
	options: Parameters<typeof getMetadata>[0],
	cancelSignal?: AbortSignal,
): Promise<unknown> {
	const result = await execa(process.execPath, ['--input-type=module', '--eval', scanner], {
		cancelSignal,
		// eslint-disable-next-line ts/naming-convention -- Electron and Git recognize these exact environment names.
		env: { ELECTRON_RUN_AS_NODE: '1', GIT_OPTIONAL_LOCKS: '0' },
		forceKillAfterDelay: 1000,
		input: JSON.stringify({ moduleUrl: import.meta.resolve('metascope'), options }),
		killDescendants: true,
		maxBuffer: 8 * 1024 * 1024,
		reject: false,
		timeout: 120_000,
	})
	if (result.failed) {
		throw new Error(
			result.timedOut ? 'Metadata scan timed out.' : 'Metadata scanner stopped before completing.',
		)
	}

	const response: unknown = JSON.parse(result.stdout)
	if (typeof response !== 'object' || response === null) {
		throw new Error('Metadata scanner returned an invalid result.')
	}

	if ('error' in response && typeof response.error === 'string') {
		throw new Error(response.error)
	}

	return 'data' in response ? response.data : undefined
}
