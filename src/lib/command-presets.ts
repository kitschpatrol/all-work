export const commandPresets = [
	{ command: 'git status --short', label: 'Show working tree changes' },
	{ command: 'git diff --stat', label: 'Summarize file changes' },
	{ command: 'git branch --show-current', label: 'Show current branch' },
	{ command: 'git log -1 --oneline', label: 'Show latest commit' },
	{ command: 'git log -10 --oneline', label: 'Show recent commits' },
	{ command: 'git remote -v', label: 'Show remote URLs' },
	{ command: 'git fetch --all --prune', label: 'Fetch remote updates' },
	{
		command: 'git push origin "$ALL_WORK_COLUMN_BRANCH" --force-with-lease',
		label: 'Force push branch (with lease)',
	},
	{
		command: 'git add --all && git commit --amend --no-edit',
		label: 'Amend commit (keep message)',
	},
	{
		command: 'git add --all && git commit --amend -m "New commit message"',
		label: 'Amend commit (new message)',
	},
	{ command: 'git ls-files', label: 'List tracked files' },
	{
		command: 'gh secret list --repo $ALL_WORK_COLUMN_REPO_OWNER/$ALL_WORK_COLUMN_REPO_NAME',
		label: 'List GitHub Secrets',
	},
] as const
