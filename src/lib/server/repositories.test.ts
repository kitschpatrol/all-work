import { describe, expect, it } from 'vitest'
import { parseGitStatus } from './repositories.js'

const hashes = '100644 100644 100644 1111111 2222222'

function status(...entries: string[]) {
	return `${entries.join('\0')}\0`
}

describe('Git status parsing', () => {
	it('reads the branch and its upstream comparison', () => {
		expect(
			parseGitStatus(
				status(
					'# branch.oid 1111111',
					'# branch.head main',
					'# branch.upstream origin/main',
					'# branch.ab +2 -1',
				),
			),
		).toEqual({
			ahead: 2,
			behind: 1,
			branch: 'main',
			changedFiles: 0,
			upstream: 'origin/main',
			upstreamGone: false,
		})
	})

	it('flags an upstream whose ref is missing locally', () => {
		expect(
			parseGitStatus(status('# branch.head feature', '# branch.upstream origin/deleted')),
		).toMatchObject({ ahead: 0, behind: 0, upstream: 'origin/deleted', upstreamGone: true })
	})

	it('counts changed, renamed, unmerged, and untracked files once each', () => {
		expect(
			parseGitStatus(
				status(
					'# branch.head main',
					`1 .M N... ${hashes} changed.txt`,
					`2 R. N... ${hashes} R100 renamed.txt`,
					'1 .M N... looks-like-an-entry.txt',
					`u UU N... 100644 100644 100644 100644 1111111 2222222 3333333 conflict.txt`,
					'? untracked.txt',
					'! ignored.txt',
				),
			).changedFiles,
		).toBe(4)
	})

	it('describes each status on its own, without values from an earlier one', () => {
		const changed = status('# branch.head main', `1 .M N... ${hashes} changed.txt`)
		expect(parseGitStatus(changed).changedFiles).toBe(1)
		expect(parseGitStatus(changed).changedFiles).toBe(1)
		expect(parseGitStatus(status('# branch.head main'))).toMatchObject({
			changedFiles: 0,
			upstream: '',
		})
	})
})
