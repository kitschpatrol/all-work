export const commandPresets = [
	{ command: 'git status --short', label: 'Show working tree changes' },
	{ command: 'git diff --stat', label: 'Summarize file changes' },
	{ command: 'git branch --show-current', label: 'Show current branch' },
	{ command: 'git log -1 --oneline', label: 'Show latest commit' },
	{ command: 'git log -10 --oneline', label: 'Show recent commits' },
	{ command: 'git remote -v', label: 'Show remote URLs' },
	{ command: 'git fetch --all --prune', label: 'Fetch remote updates' },
	{ command: 'git ls-files', label: 'List tracked files' },
] as const
