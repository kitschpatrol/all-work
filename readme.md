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
- Uses [Metascope](https://github.com/kitschpatrol/metascope) for local project metadata, current branch, working tree status, and cached remote comparisons.
- Uses [TanStack Table](https://tanstack.com/table/latest/docs/framework/svelte) for sorting, filtering, selection, column visibility, and resizing.
- Columns initially fit their contents. Drag a column divider to resize it, or double-click the divider to fit its contents again.
- Runs commands in each selected repository with configurable parallelism (1–32 jobs per run), live output, exit codes, and cancellation.
- Adds a column for every run. Open a result in its own window for full, live output, delete individual columns, or clear finished runs.
- Preferences and run output open in separate windows: native windows in the Electron app, pop-ups in a browser.

## Getting started

Requires Git, Node.js satisfying `package.json` engines, and pnpm.

```sh
pnpm install
pnpm dev
```

The dev command runs [Poptab](https://github.com/kitschpatrol/poptab) to close stale local development tabs, then starts Vite and opens the app in your browser. For the Electron app, run `pnpm dev:electron` instead. It builds the main and preload scripts with [electron-vite](https://electron-vite.org) (via the [@kitschpatrol/electron-vite](https://github.com/kitschpatrol/electron-vite) fork), starts the SvelteKit dev server, and opens the Electron window against it. Electron also provides a native folder picker.

To run the production build in a browser, use `pnpm build` followed by `pnpm start`, then open `http://127.0.0.1:4173`. The build writes the SvelteKit app to `build/` and the Electron main, preload, and local server wrapper to `out/`. The packaged Electron app starts the same server wrapper. Run `pnpm electron:build` to package the app with [electron-builder](https://www.electron.build/).

## Usage

1. Enter a directory path, choose **Recursive**, and select **Load**. With recursion enabled, nested repositories are included. With it disabled, only the selected folder and its immediate children are checked. Symlinks and common dependency, build, and cache directories are skipped.
2. The **Repository** column shows the folder path and buttons for Tower, VS Code, GitHub, Finder, and Terminal. Terminal opens a shell in that repository's folder. **Repo name** and **Repo owner** follow, using the origin remote's repository name and owner or namespace. Without a supported remote, Repo name uses the local folder name and Repo owner is empty. The **Name** and **Description** columns show the project name and description. GitHub opens the repository's origin remote in your browser and is disabled for other hosts or missing remotes. Search or filter by working tree status. Select individual rows, all matching rows, or the first N matches. Selection is preserved while sorting and filtering; **Run in N** targets only selected repositories in the entire filtered table.
3. Enter a command and choose the maximum number of parallel jobs. The arrow at the right of the command field offers presets for status, change summaries, branches, commits, remotes, fetching, and tracked files. Choosing a preset fills the field; select **Run** to execute it. Use **Up** and **Down** in the command field to browse previously submitted commands; Down past the newest entry restores your draft. Commands run with each repository as the working directory, through your user shell in login and interactive mode. This loads startup files such as `.zprofile` and `.zshrc`, making their PATH additions, aliases, and functions available. Shell startup messages are excluded from command output. Pipes and shell operators work; interactive input is unavailable. Each command starts a fresh shell; aliases or variables set only in another terminal session are not shared.
4. Inspect the output cells. Click a run's column header to sort its output alphabetically, including while it streams. Enable **Auto clear**, after **Clear** in the table toolbar, to delete the preceding output column after each new run finishes. Active commands finish before their columns are cleared. **Stop** cancels queued jobs and terminates running process groups. Deleting a running output column also stops its commands.
5. Rows appear as soon as discovery finishes. Local metadata loads first, followed by Git statistics; GitHub, CI, and registry fields load for selected rows and rows on screen. Stop active runs before reloading the folder. Reloading the same folder keeps output columns and selection; loading another folder clears them.

The Electron app adds a menu bar. Every toolbar action is available from the **File**, **Command**, **Repositories**, and **View** menus with keyboard shortcuts, including Open Workspace (⌘O), Reload Workspace (⌘R), Run (⌘↩), Stop All (⌘.), Clear Finished Runs (⌘K), Go to Command Field (⌘L), Filter Repositories (⌘F), Select All Matching (⇧⌘A), Deselect All (⌥⌘A), and Refresh Metadata for Selected (⇧⌘R). The menus also offer commands kept out of the toolbar: Select Repositories with Changes, Open Selected In for Tower, VS Code, GitHub, Finder, or Terminal (up to 10 repositories), a Presets submenu, column visibility presets, Fit Columns to Contents, and Reset View. Menu items enable and disable to match the current selection and running commands.

Output combines stdout and stderr, removes terminal control sequences, and retains up to 128,000 characters per repository per run. Commands continue after that capture limit. Output columns live in memory for the current page/server session. The latest 100 submitted commands, chosen directory, recursive preference, and auto clear preference are remembered locally. Clearing output columns does not clear command recall. Set `ALLWORK_DIRECTORY` to change the initial directory suggestion.

A custom Metascope template exposes all 78 fields from the Obsidian frontmatter workflow, including the derived Homebrew flag (a dependency on `brewpub`). **Columns** groups fields by category and provides a search field. Existing repository, project, package-manager, and app-launch columns remain available; **Ahead** and **Behind** show separate cached-remote totals. The combined Sync column remains available in Columns for compatibility.

Loading is progressive, with up to four isolated scanner processes at once. Repository walks, parsers, and Git history processing run outside the HTTP server. Reloading cancels the previous scan and its child processes. Row updates are batched, and automatic sizing measures text without cloning the table. The first pass reads local manifests, licenses, README metadata, and workspace configuration. Git statistics follow. GitHub, CI, and package-registry sources load lazily for selected rows and rows on screen when their columns are visible. Network requests never block discovery or ordinary commands. GitHub authentication follows Metascope's credential discovery, including `GITHUB_TOKEN`, `GH_TOKEN`, and the signed-in GitHub CLI.

Choose **Metadata → Refresh selected metadata** to refresh local, Git, GitHub, registry, and CI information. **Scan selected codebases** explicitly runs file totals and Tokei code statistics. **Check selected dependency updates** explicitly runs Metascope's dependency-update source. These expensive scans do not run automatically when their columns are enabled. Select the relevant columns to view their results. Unloaded, loading, unavailable, false, and zero remain distinct. Hover a cell for its raw variable value, source group, update time, cache status, and field-specific meaning.

Successful enrichment and explicit scans persist in the user cache directory (`~/Library/Caches/AllWork/metadata` on macOS). GitHub data is refreshed when requested after 15 minutes, CI after 2 minutes, and registry data after a day. Codebase scans and dependency checks retain their last results until explicitly requested again; their timestamps identify the snapshot. A failed refresh retains previous values. Set `ALLWORK_CACHE_DIRECTORY` to override the cache location.

Branch, changed-file count, latest commit date, and remote comparisons come from Metascope's `gitStats`. Ahead and Behind total comparisons against locally cached main/master refs across remotes; scans do not fetch. Metascope 0.13 returns no Git statistics for linked worktrees or repositories without commits, so a narrow Git fallback fills those missing fields. A direct Git query supplies commit subjects for date tooltips. Metascope currently builds a recursive file tree for each source-group call, and its Git statistics source also reads history and tracked-file sizes; these costs remain in the background.

Some fields inherit source-specific meanings: Status describes authorship/maintenance, CI is the latest completed default-branch run of a workflow named CI, Releases can fall back to version-tag count, and Downloads Total may represent npm lifetime downloads, Obsidian community downloads, PyPI's last 180 days, or the latest GitHub release's asset downloads. Column hovers explain these distinctions.

Commands receive a variable for each column, including hidden columns. Choose **Variables…** to insert a quoted reference at the command field's cursor. Hover a cell to see its variable and row value, such as `$ALLWORK_COLUMN_VERSION = 0.1.1`. Column headers and the variable picker preview the first selected repository, or the first visible repository when none are selected; the tooltip identifies that repository. Each repository supplies its own values, captured when you click **Run**. New columns receive variables using the same naming scheme, such as `$ALLWORK_COLUMN_LICENSE`, `$ALLWORK_COLUMN_STARS`, and `$ALLWORK_COLUMN_AHEAD`. A command referencing metadata that is still pending reports the columns that need loading instead of silently supplying empty values:

| Variable                                            | Value                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `$ALLWORK_COLUMN_REPOSITORY`                        | Repository path relative to the workspace; `$PWD` gives the absolute working directory                 |
| `$ALLWORK_COLUMN_REPO_NAME`                         | Origin repository name; falls back to the local folder name                                            |
| `$ALLWORK_COLUMN_REPO_OWNER`                        | Origin owner or namespace, including nested groups; empty without a supported remote                   |
| `$ALLWORK_COLUMN_NAME`                              | Project name                                                                                           |
| `$ALLWORK_COLUMN_DESCRIPTION`                       | Project description                                                                                    |
| `$ALLWORK_COLUMN_BRANCH`                            | Git branch                                                                                             |
| `$ALLWORK_COLUMN_WORKING_TREE`                      | Number of changed files, or empty when Git status is unavailable                                       |
| `$ALLWORK_COLUMN_SYNC`                              | Total commits ahead and behind, or empty when Git status is unavailable                                |
| `$ALLWORK_COLUMN_LAST_COMMIT`                       | ISO timestamp of the latest commit, or empty for no commits                                            |
| `$ALLWORK_COLUMN_VERSION`                           | Project version                                                                                        |
| `$ALLWORK_COLUMN_PACKAGE_MANAGER`                   | Package manager and version                                                                            |
| `$ALLWORK_COLUMN_REMOTE`                            | Origin remote URL                                                                                      |
| `$ALLWORK_COLUMN_RUN_1`, `$ALLWORK_COLUMN_RUN_2`, … | Raw output of existing run columns, numbered as shown in the table; empty if that row was not included |

For example, `printf '%s: %s\n' "$ALLWORK_COLUMN_NAME" "$ALLWORK_COLUMN_BRANCH"` prints each project's name and branch. Quote references to preserve spaces and newlines. Values remain literal data, so shell syntax inside a cell is not executed. Existing output is captured at submission, including partial output from active runs, and remains available to queued commands if the source column is deleted. Run numbering follows the columns currently in the table.

## Development

The app uses SvelteKit 3, Svelte 5, the official TanStack Svelte adapter, and an Electron wrapper. Execa manages command processes, output streaming, and process tree cancellation. Filesystem access and command execution stay in the local Node server. The development server and packaged server bind to `127.0.0.1`.

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
