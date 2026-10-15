# AllWork

<!-- badges -->

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/license/mit)

<!-- /badges -->

<!-- short-description -->

**A parallel command line for all your Git repositories.**

<!-- /short-description -->

## Overview

AllWork is a local desktop and browser workspace for running one shell command across many Git repositories. A fixed toolbar keeps the workspace field on the left and the command field on the right. The table fills the remaining window and scrolls through every matching repository without pagination.

- Discovers Git repositories and worktrees, including projects without `package.json`. Choose recursive discovery or scan only one level down.
- Uses [Metascope](https://github.com/kitschpatrol/metascope) for local project metadata and Git for current branch, working tree, and cached upstream status.
- Uses [TanStack Table](https://tanstack.com/table/latest/docs/framework/svelte) for sorting, filtering, selection, column visibility, and resizing.
- Runs commands in each selected repository with configurable parallelism (1–32 jobs per run), live output, exit codes, and cancellation.
- Adds a column for every run. Open a result for full output, delete individual columns, or clear finished runs.

## Getting started

Requires Git, Node.js satisfying `package.json` engines, and pnpm.

```sh
pnpm install
pnpm dev
```

Open the localhost URL printed by Vite. For the Electron app, run `pnpm electron` in a second terminal while the development server is running. Electron also provides a native folder picker.

To run the production build in a browser, use `pnpm build` followed by `pnpm start`, then open `http://127.0.0.1:4173`. The local server wrapper is also used by the packaged Electron app.

## Usage

1. Enter a directory path, choose **Recursive**, and select **Load**. With recursion enabled, nested repositories are included. With it disabled, only the selected folder and its immediate children are checked. Symlinks and common dependency, build, and cache directories are skipped.
2. Use the Tower, VS Code, GitHub, and Finder buttons beside each repository name. GitHub opens the repository's origin remote in your browser and is disabled for other hosts or missing remotes. Search or filter by working tree status. Select individual rows, all matching rows, or the first N matches. Selection is preserved while sorting and filtering; **Run in N** targets only selected repositories in the entire filtered table.
3. Enter a command and choose the maximum number of parallel jobs. Commands run with each repository as the working directory, through your login shell. Pipes and shell operators work; interactive input is unavailable.
4. Inspect the output cells. Enable **Auto clear** to delete the preceding output column after each new run finishes. Active commands finish before their columns are cleared. **Stop** cancels queued jobs and terminates running process groups. Deleting a running output column also stops its commands.
5. Reload the folder to refresh metadata. Stop active runs first. Reloading the same folder keeps command history and selection; loading another folder clears them.

Output combines stdout and stderr, removes terminal control sequences, and retains up to 128,000 characters per repository per run. Commands continue after that capture limit. Output and history live in memory for the current page/server session. The chosen directory, recursive preference, and auto clear preference are remembered locally. Set `ALLWORK_DIRECTORY` to change the initial directory suggestion.

Git sync counts use cached upstream references; scanning does not fetch remotes. Metascope runs offline with local manifest sources so loading projects does not require credentials or network access.

## Development

The app uses SvelteKit 3, Svelte 5, the official TanStack Svelte adapter, and an Electron wrapper. Filesystem access and command execution stay in the local Node server. The development server and packaged server bind to `127.0.0.1`.

```sh
pnpm check
pnpm test
pnpm lint
pnpm build
```

<!-- contributing -->

## Contributing

[Issues](https://github.com/kitschpatrol/allwork/issues) are welcome and appreciated.

Please open an issue to discuss changes before submitting a pull request. Unsolicited PRs (especially AI-generated ones) are unlikely to be merged.

This repository uses [@kitschpatrol/shared-config](https://github.com/kitschpatrol/shared-config) (via its `ksc` CLI) for linting and formatting, plus [MDAT](https://github.com/kitschpatrol/mdat) for readme placeholder expansion.

<!-- /contributing -->

<!-- license -->

## License

[MIT](license.txt) © [Eric Mika](https://ericmika.com)

<!-- /license -->
