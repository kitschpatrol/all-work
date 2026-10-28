import { userInfo } from 'node:os'
import path from 'node:path'

/**
 * Build an invocation that loads the user's shell configuration before running
 * a command.
 */
export function userShellCommand(command: string, directory: string) {
	if (process.platform === 'win32') {
		return {
			args: ['/d', '/s', '/c', command],
			file: process.env.ComSpec ?? 'cmd.exe',
		}
	}

	const file = process.env.SHELL ?? userInfo().shell ?? '/bin/sh'
	// Startup output stays on stdout/stderr. Only the requested command uses fd 3,
	// so terminal themes and other interactive initialization do not pollute results.
	// Passing the command and directory as arguments avoids interpolating shell code.
	const script =
		path.basename(file) === 'fish'
			? `begin
builtin cd -- $argv[2]; or exit
eval "set --local argv; "$argv[1]
end 1>&3 2>&3 3>&-`
			: String.raw`exec 1>&3 2>&3 3>&-
\cd -- "$2" || exit
\eval '\set --; '"$1"`
	return {
		args: [
			'-lic',
			script,
			...(path.basename(file) === 'fish' ? [] : ['all-work']),
			command,
			directory,
		],
		file,
	}
}
