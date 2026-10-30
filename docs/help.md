# All Work Help

_The [readme](../readme.md) is handwritten, but this file provides some AI-generated documentation that might be helpful in a pinch. Apologies for its tortured prose._

## Contents

- [Overview](#overview)
- [Quick start](#quick-start)
- [Workspaces and discovery](#workspaces-and-discovery)
- [Selecting and searching repositories](#selecting-and-searching-repositories)
- [Columns and presets](#columns-and-presets)
- [Filters](#filters)
- [Metadata](#metadata)
- [Running commands](#running-commands)
- [Column variables](#column-variables)
- [Preferences and saved state](#preferences-and-saved-state)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Example workflows](#example-workflows)
- [Troubleshooting](#troubleshooting)
- [Development and packaging](#development-and-packaging)

## Overview

All Work displays your local Git repositories and their project metadata in one searchable, filterable table. Select the repositories you want to work on, run shell commands across them in parallel, and compare the results in the table.

The macOS desktop app includes native menus, a folder picker, and separate output windows. You can also run the interface in a browser from a local checkout. See the [readme](../readme.md) for installation instructions.

## Quick start

1. Open **All Work → Preferences…** (⌘,) and replace the prefilled **Author names** and **GitHub accounts** with your own. These settings identify your projects; they do not authenticate with GitHub.
2. Click **Browse…** to choose a workspace folder. Alternatively, enter a path under **Workspace** and click **Load**. Enable **Recursive** to include nested repositories.
3. Wait for repository discovery to finish. Rows appear with cached metadata when available, then refresh in the background.
4. Check a few repository rows. Enter `git status --short` under **Command**, choose a **Jobs** limit, and click **Run in N**.
5. Inspect the new output column. Click a result to see its full captured output and exit status. A clean repository can successfully produce no output for this command.
6. Use **Columns** to show more metadata and **Filter** to narrow the table. The **Run in N** count always reflects the selected repositories that currently match the table's search and filters, including matching rows below the viewport.

## Workspaces and discovery

A workspace is a folder to search for Git repositories. It can contain many repositories, or be a repository itself. `~` and `~/…` are accepted in the path field.

**Recursive** is off by default. With it enabled, All Work searches nested folders, including nested repositories. With it disabled, it checks only the chosen folder and its immediate children. Repositories with a `.git` directory and worktrees with a `.git` file are recognized; bare repositories are not discovered by this check.

Common dependency, build, and cache folders are skipped, including `node_modules`, `vendor`, `build`, `dist`, `coverage`, `.git`, `.cache`, and Python virtual environments. These directory-name exclusions are separate from each repository's ignore rules.

Symlinks are followed only when they point directly to a repository or worktree. A symlink to a general collection of folders is not traversed. Repositories are deduplicated by their resolved paths, with a directly discovered path preferred over a symlink. A repository found through a link is displayed using the link's path, while commands run in the target directory.

Unreadable folders appear in a warning above the table. Other readable repositories can still load.

**Reload** discovers repositories again and refreshes local metadata. Reloading the same workspace preserves output columns and selections for repositories still present. Loading a different workspace clears the displayed runs, selection, search, and filter rules. Stop active command runs before reloading or switching workspaces; these controls are disabled while commands are active.

## Selecting and searching repositories

All matching repositories share one scrollable table; there is no pagination. Click anywhere in a row's checkbox cell to toggle it. Shift-click extends the last plain click's checked or unchecked state across a range; further Shift-clicks resize the range. Drag down the checkbox column to apply the same state to a range, with scrolling at the edges.

The header checkbox selects or deselects every matching repository, including rows outside the viewport. Sorting and filtering preserve stored selections, but hidden selections are excluded from the current action targets. The footer's selected count also counts only matching selections.

**Selected only** hides unchecked repositories while keeping search and filter rules in effect. If you uncheck the last visible repository, turn off **Selected only** to see other rows again. **Repositories → Deselect All** clears selections even for rows hidden by filters. **Select Repositories with Changes** adds matching repositories with known working-tree changes to the selection.

The search field performs a case-insensitive text search across searchable repository column values, including hidden repository columns. It does not search command output or automatically request remote metadata just because a search term might match it. Use a filter rule on a run column to search command output, or show the relevant metadata columns first.

Search, filter rules, and **Selected only** combine: a repository must pass all three to appear. Changing these controls after starting a run does not change that run's targets.

## Columns and presets

The **Repository** column shows the path relative to the workspace (`.` for the workspace itself). **Repo name** and **Repo owner** come from the origin remote's repository name and owner or namespace, including nested groups. Without a supported remote, Repo name falls back to the local folder name and Repo owner is empty. **Name** and **Description** describe the project using its extracted metadata and can differ from the repository name.

Choose **Columns** to select a preset, or open its disclosure control to search for individual columns. Fields are grouped by category. Category checkboxes toggle a whole group; they are disabled while searching the column list.

### Column presets

Every preset keeps the mandatory Repository column. The table lists the optional repository columns selected by each built-in preset; applying a preset keeps the current column order and output-column visibility.

| Preset          | Optional repository columns                                                              | Purpose and metadata requirements                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default         | Repo name, Repo owner, Name, Description, Version, Branch, Working tree, Last commit     | Everyday local repository work; the initial selection and Reset View default.                                                                                            |
| All             | Every optional repository column                                                         | Explore all available metadata. Requests remote metadata; dependency updates still require an explicit check.                                                            |
| None            | None                                                                                     | Keep Repository and existing output columns for a compact command-running view.                                                                                          |
| Adoption        | Stars, Forks, Downloads Monthly, Downloads Total, Latest Release Date                    | Compare public interest and downloads using GitHub and registry metadata. Download totals can have different meanings by source.                                         |
| CI Triage       | CI, CI URL, Branch, Last commit                                                          | Inspect completed default-branch CI results alongside local branch activity. Requests CI metadata.                                                                       |
| Codebase Size   | Language, Secondary Language, Lines of Code, Total Files, Total Size MB, Tracked Size MB | Compare code and file statistics, which refresh automatically on workspace load. Language also requests GitHub metadata.                                                 |
| Dependencies    | Package manager, Total Updates, Major Updates, Minor Updates, Patch Updates, Libyears    | Compare update counts and dependency lag. Run **Repositories → Check Dependencies for Selected** to populate the update fields.                                          |
| Fork Sync       | Repo owner, Forked From, Fork Ahead, Fork Behind, Branch                                 | Compare forks with their parents through GitHub metadata. Local upstream Ahead/Behind are separate fields.                                                               |
| Git Work        | Branch, Working tree, Ahead, Behind, Last commit                                         | Review local changes and commits to push or pull. Upstream comparisons use locally cached refs and do not fetch.                                                         |
| GitHub          | Repo owner, Public, Fork, Language, Stars, PRs Open, Issues Open                         | Review visibility, ownership, and activity. Requests GitHub metadata.                                                                                                    |
| Maintenance     | Status, CI, PRs Open, Issues Open, Vulnerability Alerts, Total Updates                   | Review authorship, builds, open work, alerts, and updates. Uses GitHub and CI metadata; alerts need suitable access and update counts need an explicit dependency check. |
| Ownership       | Repo owner, Author, Maintainer, Status, Public, License                                  | Review authorship, maintenance, visibility, and licensing. Uses your identity preferences and GitHub metadata.                                                           |
| Platform        | Language, Runtime, Operating System, Package manager, Monorepo                           | Review project platforms and workspace structure. Uses local metadata and requests GitHub metadata for Language.                                                         |
| Project Catalog | Name, Description, Language, Tags, Status, Last commit                                   | Browse project descriptions, classifications, and recent activity. Uses local/Git data and requests GitHub metadata for Language.                                        |
| Publishing      | Name, Version, Published, Latest Release Version, Latest Release Date, Package URL, CI   | Compare local and published versions. Requests registry, GitHub, and CI metadata.                                                                                        |

**New column set…** starts a custom set with Repo name visible alongside Repository. It is a starting point for editing, rather than a saved preset.

**Save…** stores the current repository-column visibility as a named preset. Editing a saved preset adds an asterisk: **Save** keeps the edits and **Revert** restores the saved selection. **Rename…** changes its name. **Delete** removes the preset while leaving the current columns visible. Editing a built-in preset starts a custom selection instead; built-in presets cannot be overwritten. Saving under an existing user preset's name offers to replace it. You can save up to 100 column presets, with names up to 80 characters.

Column presets affect repository-column visibility, leaving output-column visibility alone. They do not store a separate sort order, column order, or set of widths; those belong to the current saved view. The column list's **Select all** and **Deselect all** buttons also affect output columns.

### Sorting, sizing, and copying

Click a column heading to change its sort order. Shift-click a heading to add it to the current sort. Run columns sort by their output text, including while output streams. To group successes and failures instead, right-click a run header and choose **Sort Exit Code Ascending** or **Sort Exit Code Descending**; repositories without an exit code yet, or omitted from the run, stay last. Clicking the heading returns to sorting by output.

Drag headers to reorder movable columns. The selection and Repository columns stay at the left, and the newest run column stays at the right when visible. Drag a column edge to resize it; double-click the edge to fit that column to its contents. **View → Fit Columns to Contents** recalculates the visible widths. Manual widths are otherwise preserved as metadata arrives.

In the desktop app, right-click a header for sorting (run headers offer **Sort Output** and **Sort Exit Code**, each ascending or descending), **Hide Column** where allowed, **Filter By…**, **Copy**, **Copy Selected**, and **Copy Variable**. Copy actions use matching rows in table order; **Copy Selected** restricts them to selected matches. Run headers also offer **Clear Finished to Left** and **Clear Finished to Right**. Right-click unused header space to show a hidden column at the end of the movable columns.

Hiding an output column through **Columns** keeps its run. The × in its header clears the run's displayed output instead; see [clearing and retaining output](#clearing-and-retaining-output).

### Repository shortcuts

The GitHub, Finder, terminal, and refresh shortcut buttons show by default. Choose which to show under **Preferences → Repo shortcut buttons**, or use **View → Show Repo Shortcut Buttons** to toggle all of them together. The desktop Repository context menu offers the actions even when the buttons are hidden:

- Open a readme in the preferred app.
- Open in Tower or VS Code.
- Open the origin repository on GitHub.
- Open the separate website configured on GitHub.
- Reveal the folder in Finder, copy its absolute path, or open it in a terminal.
- Refresh that repository's metadata.

The GitHub shortcut requires a recognized `github.com` origin remote; other hosts and GitHub Enterprise hosts do not get this shortcut. The website shortcut uses GitHub's website field and excludes a link back to the same GitHub repository. Enabling it can trigger GitHub metadata loading even with GitHub columns hidden.

The readme shortcut checks the repository root, preferring Markdown files such as `readme.md` over other readme formats. Symlinked readmes and names such as `readme.ja.md` are not selected. Readme and terminal app choices live in Preferences. **System default** for a terminal means the app macOS associates with shell scripts; choose a specific terminal if that opens an unexpected application.

**Repositories → Open Selected In** and **Reveal Selected in Finder** apply to all selected matching repositories. Missing readmes and unsupported GitHub remotes are skipped for their respective actions. Finder, Tower, terminal, and readme launching currently require macOS; VS Code uses its registered URL handler.

## Filters

The **Filter** preset selector applies a preset directly. Open its adjacent disclosure control to edit rules. Choose a column, comparison, and value, then combine rules with **all**, **any**, or **none**. **+** adds a rule; Option-click **+** to add a nested group with its own match mode. The minus button removes a rule or group. Closing the editor keeps the filter applied.

Rules can reference hidden columns. The value field suggests values already loaded from repositories. Blank, incomplete, and invalid rules are ignored, so an unfinished rule does not restrict the table. Invalid regular expressions are also ignored.

| Column kind                     | Comparisons and behavior                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text                            | Contains, exact equality, begins/ends with, their available negative forms, pattern matching, and empty/not empty. Text comparisons are case-insensitive. |
| Repo owner                      | Text comparisons plus **is me** and **is not me**, using your GitHub accounts in Preferences.                                                             |
| Numbers                         | Equality, inequality, greater/less than, inclusive bounds, inclusive ranges, and empty/not empty. Missing numbers do not count as zero.                   |
| Dates                           | Within/not within the last N days, weeks, months, or years; before/after a date; empty/not empty. Before/after excludes the chosen local calendar day.    |
| Yes/no                          | **is Yes**, **is No**, and empty/not empty. Missing values do not count as No.                                                                            |
| Lists                           | Includes/does not include an exact list item, case-insensitively, and empty/not empty. This is not a substring search.                                    |
| Author, Contributor, Maintainer | List comparisons plus **is me** (every listed name is one of yours), **includes me**, and **does not include me**, using your author names.               |
| Run output                      | Status is/is not, output contains/does not contain, pattern matching, and empty/not empty. Queued jobs count as running for status rules.                 |

**Matches pattern** takes a regular expression without `/…/` delimiters. Matching is case-insensitive and multiline, so `^` and `$` can match individual output lines.

A row whose required value has not loaded can remain hidden until the filter can decide whether it matches. Existing cached values can still be used while their group refreshes. Once a source is unavailable, a missing value is treated as empty. The footer's metadata progress reports queued and loading metadata across the workspace.

For output text rules, All Work waits until that repository's command finishes before deciding the match; partial output is not treated as final. Status rules work while the run is active. A repository omitted from a run has **not included** status and empty output for that run.

### Filter presets

The selector offers **None** plus these built-in presets. Presets replace the current rules while keeping search and Selected only in effect.

| Preset             | Repositories shown                                                                          | Data and qualifications                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| None               | All repositories allowed by search and Selected only                                        | Clears filter rules.                                                                                                      |
| Clean              | Working tree equals 0                                                                       | Requires known local Git status; an unavailable count is not clean.                                                       |
| Dirty              | Working tree is greater than 0                                                              | Local Git status, including untracked files.                                                                              |
| Diverged           | Ahead or Behind is nonzero                                                                  | Either direction is enough; both do not need to be nonzero. Requires a known upstream comparison.                         |
| Failing CI         | CI equals Failure                                                                           | Latest completed default-branch run of a workflow named CI. Requests CI metadata.                                         |
| GitHub             | Origin remote URL contains `github`, case-insensitively                                     | Uses local remote metadata. This is a text match and does not validate the hostname or request GitHub metadata by itself. |
| Mine               | Author includes one of your author names, or Repo owner matches one of your GitHub accounts | Uses Identity preferences. Either authorship or ownership is enough.                                                      |
| Needs Attention    | Working tree, Ahead, or Behind is greater than 0, or CI equals Failure                      | Uses local Git and requests CI metadata. A known local match can appear before CI finishes loading.                       |
| No Remote          | Origin remote is empty                                                                      | Other named remotes can still exist.                                                                                      |
| Open PRs           | PRs Open is greater than 0                                                                  | Requests GitHub metadata.                                                                                                 |
| Published Packages | Published is Yes                                                                            | Requests package-registry metadata.                                                                                       |
| Ready to Pull      | Working tree equals 0, Ahead equals 0, and Behind is greater than 0                         | All three conditions must hold; requires a known upstream comparison.                                                     |
| Ready to Push      | Working tree equals 0, Ahead is greater than 0, and Behind equals 0                         | All three conditions must hold; requires a known upstream comparison.                                                     |
| Recently Active    | Last commit is within the last 30 days                                                      | Uses the latest local commit timestamp.                                                                                   |

Upstream-based presets use locally cached refs and do not fetch. Missing upstream counts do not match numeric conditions. For remote fields, rows can remain hidden until enough metadata loads to decide the filter.

**New filter…** starts a custom filter. **Save…** names its rules, proposing the next free **Custom N**. Editing a saved preset marks it with an asterisk until **Save** or **Revert**; **Rename…** changes its name. Deleting a preset leaves its rules applied as a custom filter. Built-in presets cannot be overwritten; editing one starts a custom filter. As with column presets, names can have up to 80 characters and up to 100 saved presets are supported.

Choose **None** to remove all rules. This leaves the text search and **Selected only** setting in effect. Current rules are saved with the view; named presets are saved with preferences.

## Metadata

### Loading and refreshing

Rows first show available cached data. On every workspace load, local metadata, Git statistics, code statistics, and file statistics refresh automatically, including when their columns are hidden. Code statistics use Tokei through Metascope.

GitHub, CI, and package-registry data load when their columns are visible or filter rules need them. Selected and onscreen rows are prioritized; the remaining repositories, including rows hidden by filters, queue in the background. A rule on a remote field prioritizes that source for all rows. Enabling the website shortcut also requests GitHub metadata.

| Metadata                                             | Refresh behavior                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Local manifests, licenses, readme metadata, identity | Refreshes when the workspace loads and on an explicit metadata refresh. Changing identity preferences also requests a local refresh. |
| Git status and statistics                            | Refreshes when the workspace loads, after each repository's command finishes, and on an explicit metadata refresh.                   |
| Code and file statistics                             | Refreshes when the workspace loads and on an explicit metadata refresh.                                                              |
| GitHub                                               | Requested as needed; cached data is eligible for refresh after 15 minutes.                                                           |
| CI                                                   | Requested as needed; cached data is eligible for refresh after 2 minutes.                                                            |
| Package registries                                   | Requested as needed; cached data is eligible for refresh after 24 hours.                                                             |
| Dependency updates                                   | Runs only through **Repositories → Check Dependencies for Selected**. Cached results remain until another explicit check.            |

The cache ages are checked when a source is requested; they are not continuous polling intervals. To force a refresh, select repositories and choose **Repositories → Refresh Metadata for Selected** (⇧⌘R), or use a repository's refresh shortcut or context-menu action. This refreshes local, Git, GitHub, registry, CI, code, and file data, including hidden columns. It does not run dependency-update checks. A group already loading or queued is not duplicated.

Showing dependency-update columns alone does not perform a check. Choose the **Dependencies** column preset, select repositories, and run **Check Dependencies for Selected** to populate them. The check reports available updates; it does not install them or rewrite dependency files.

Successful metadata is cached on disk. A failed refresh can retain the previous values; hover a cell to inspect its source, last update, cache status, and error. To discover newly added repositories, reload the workspace; refreshing metadata does not repeat discovery.

### GitHub authentication

All Work resolves a token in this order:

1. Nonempty `GITHUB_TOKEN` in the application server's environment.
2. Nonempty `GH_TOKEN` in that environment.
3. `gh auth token`, executed through your login shell from your home directory.

The CLI lookup runs at most once per workspace load, when the first network metadata source needs it, and has a 10-second timeout. After changing CLI accounts or credentials, reload the workspace. Environment changes require restarting the process that runs All Work.

For Finder launches, install the [GitHub CLI](https://cli.github.com/) and authenticate in a terminal with `gh auth login`. `gh auth status` helps confirm which account is signed in. Merely exporting a token in another terminal does not add it to an already running app's environment. Preferences identity fields do not provide authentication.

The token must be able to read the repositories and fields being requested. Private repositories, CI information, and vulnerability alerts can require additional access; an unavailable value is not evidence that there are no alerts or failures. GitHub authentication for metadata is separate from the credentials used by shell commands such as `git fetch` or `git push`.

### Reading values correctly

A missing value is not the same as zero, false, or an empty successful command result. Most metadata cells use **…** for queued/loading values, **Not scanned** for dependency updates not yet requested, and **—** for absent or unavailable values. Known booleans display **Yes** or **No**. Cached values may remain visible during a refresh.

| Field                      | Meaning or limitation                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Working tree               | Changed-file count; includes untracked files, excludes ignored files. Clean means a known count of zero.                                                                               |
| Ahead / Behind             | Commits relative to the current branch's configured upstream, using its locally cached ref. Empty without an upstream, with a missing upstream ref, or when Git status is unavailable. |
| Sync                       | Combined display of upstream counts; zero/zero displays a dash. Its command variable is the numeric sum of Ahead and Behind when available.                                            |
| Git Remotes Ahead / Behind | Metascope's totals against locally cached `main`/`master` refs across remotes, distinct from the current branch's upstream.                                                            |
| Fork Ahead / Behind        | GitHub's comparison with the fork's parent, distinct from local upstream counts.                                                                                                       |
| Status                     | Your authorship/maintenance relationship to the project; provisional until fork metadata loads. It is not Git working-tree status.                                                     |
| Contributors               | Contributor count; local Git data counts unique author emails, while GitHub can supply its own count. **Contributor** is a separate list of names.                                     |
| CI                         | Latest completed default-branch run of a workflow named `CI`; not every workflow or branch.                                                                                            |
| Homebrew                   | A detected dependency on `brewpub`; does not verify a published formula or cask.                                                                                                       |
| Monorepo                   | Inferred from root workspace configuration. Child packages are not extracted as separate table rows unless they are Git repositories discovered by the workspace scan.                 |
| Releases                   | GitHub release count, with local version-tag count as a fallback.                                                                                                                      |
| Latest Release Version     | Can come from an Obsidian manifest, package registry, GitHub release, or local version tag. It is not always a GitHub release.                                                         |
| Downloads Total            | Source-dependent: npm lifetime downloads, Obsidian community downloads, PyPI's last 180 days, or asset downloads of the latest GitHub release.                                         |
| Downloads Monthly          | Monthly npm or PyPI downloads, when available.                                                                                                                                         |
| Git LFS                    | Detection of LFS files; a missing detection result is not necessarily No.                                                                                                              |
| Libyears                   | Aggregate dependency lag measured in years, from the dependency-update source. It requires an explicit dependency check.                                                               |

Local ahead/behind statistics never fetch. Run `git fetch --all --prune` to update remote refs, then inspect the refreshed Git metadata. Commands refresh Git fields when they finish, but edits to manifests or other project metadata may need an explicit metadata refresh.

## Running commands

Enter a shell command, set **Jobs** between 1 and 32 (default 6), and click **Run in N**. Pressing Enter in the command field also submits the form when a variable-completion menu is not consuming the key. Commands can contain up to 16,000 characters.

Each submission creates a run with its own concurrency limit. Multiple runs can overlap, so their combined running-job count can exceed the **Jobs** setting. A failure in one repository does not stop the others. The repository targets and column-variable values are captured at submission; later selection, sort, or filter changes do not alter queued jobs.

**Presets** fills in common commands without executing them. Review the command before choosing Run: presets include read-only queries, fetching, amending commits, and force-pushing with a lease. Presets are provided by the application; there is currently no editor for saving custom command presets.

Choose **Presets → Fetch remote updates** to insert `git fetch --all --prune`, or use **Command → Presets → Fetch remote updates** in the desktop menu. Click **Run in N** to execute it in the selected matching repositories. Git metadata refreshes as each repository's command finishes.

Use Up and Down in the command field to browse submitted commands. Down past the latest history entry restores your draft. The last 100 entries are remembered; consecutive identical submissions share one history entry. Clearing output does not clear history.

### Shell behavior

On macOS and other UNIX systems, commands use `$SHELL`, then your account's configured shell, then `/bin/sh`, in login and interactive mode. This loads startup files such as `.zprofile` and `.zshrc`, making their PATH additions, aliases, and functions available. The command runs in the repository's resolved directory. Startup messages are excluded from the captured command output.

Each repository gets a fresh shell. Variables, aliases, working-directory changes, or shell state created only in another terminal session or an earlier run are not shared. Pipes, redirection, command substitution, and shell operators work normally.

Despite the shell's interactive startup mode, commands have no terminal attached and stdin is closed. Password prompts, interactive editors, REPLs, pagers, and commands that require a TTY cannot be used as in a terminal. Configure authentication first or open the repository in a terminal for interactive work. All Work sets `GIT_TERMINAL_PROMPT=0` and `NO_COLOR=1` and removes `FORCE_COLOR`.

Some tools change behavior when stdin is not a terminal. If a directory-listing alias returns no output, try an explicit path such as `ls .`. Shell startup code that assumes a terminal can also affect execution; configure it to tolerate this environment.

The Windows runner uses `ComSpec` or `cmd.exe` with `/d /s /c`, rather than UNIX login-shell syntax. Native macOS repository actions remain unavailable there; macOS is the maintained desktop platform.

### Inspecting output

Every run adds an output column with its run number, command, progress, and success/failure counts. Each repository's result shows its status, exit code when available, duration, and captured text. **Output lines** changes only the table preview height.

Output combines stdout and stderr and strips terminal control sequences. All Work retains up to 128,000 characters per repository per run. Reaching the capture limit does not stop the command. A preview shortened by **Output lines** can still have more captured text; the capture-limit message identifies actual truncation.

Click a result to open a separate output window in the desktop app, or a dialog in browser mode. **Copy output** copies its captured text. **Previous result** and **Next result** follow the current filtered table order and skip repositories omitted from the run.

The displayed command substitutes simple column-variable references with their captured values. It leaves other shell variables and more complex shell expansions as typed; this display is not a complete shell execution trace.

### Stopping commands

The ■ button in a run header stops that run: queued jobs are cancelled and active command processes are terminated, including descendant processes. **Command → Stop All** (⌘.) stops every displayed active run. Finished results keep their success or failure status. Stopping cannot undo file or remote changes a command has already made.

Clearing a running output column also stops its commands. Hiding its column through **Columns** does not stop it. Commands continue while an output dialog is closed; closing the main window on macOS does not by itself quit the application.

### Clearing and retaining output

The × in a run header clears its displayed column. **Clear finished runs** clears all finished displayed runs. **Auto clear**, in the table toolbar, associates each new run with the preceding run and clears that preceding column once both have finished. Turning Auto clear on does not immediately delete existing output.

When no filter rule references a cleared run, its retained output and disk cache are deleted. If a current rule still references it, the run is stopped if necessary and retained under **Cleared runs** in the filter editor. The rule continues to work after the column disappears. Removing the last rule that references it releases the retained run. This also applies to columns removed by Auto clear and Clear finished runs.

Run numbers count upward and are not reused simply because a column is cleared. A header, filter rule, and variable such as `$ALL_WORK_COLUMN_RUN_3` continue to identify the same run. **Reset View** resets numbering after the highest run still kept in the view, including hidden columns, or to 1 if none remain.

Output is saved to disk and can be restored with the last workspace. Restoring output never reruns commands. If the server remains alive, a restored view can reconnect to an active run. If the server restarted, previously queued or running results are marked cancelled with an interruption note. Restored output is a saved snapshot, not a fresh repository check.

## Column variables

Commands receive an environment variable for every repository column, including hidden columns, plus the current runs' output columns. The reference below lists all 86 repository variables, grouped by the categories in the Variables picker, followed by the numbered run variables. Repository variable names use `ALL_WORK_COLUMN_` followed by the uppercase column heading with spaces replaced by underscores.

**Hover a column heading and wait for its tooltip to see the exact variable name**, such as `$ALL_WORK_COLUMN_BRANCH` or `$ALL_WORK_COLUMN_RUN_3`. This works for repository and run headers in both desktop and browser modes. In the desktop app, right-click the header and choose **Copy Variable** to copy that reference. Hovering a repository metadata cell shows its value, source, freshness, and field notes.

**Variables** inserts a reference at the command cursor. Type `$` or `${` for autocomplete; Up/Down selects a suggestion, Tab or Enter accepts it, and Escape dismisses it. While suggestions are open, those keys control completion rather than history or submission. Neither insertion method adds quotes automatically; use double quotes around values that should be a single argument.

The variable picker previews the first selected matching repository, or the first matching repository if none is selected. Its tooltip names that repository. Each target repository receives its own values when the run is submitted.

### Identity variables

| Column          | Variable                           | Value                                                                                                   |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Repository      | `$ALL_WORK_COLUMN_REPOSITORY`      | Repository path relative to the workspace; `$PWD` gives the absolute working directory.                 |
| Repo name       | `$ALL_WORK_COLUMN_REPO_NAME`       | Origin repository name, falling back to the local folder name.                                          |
| Repo owner      | `$ALL_WORK_COLUMN_REPO_OWNER`      | Origin owner or namespace, including nested groups; empty without a supported remote.                   |
| Name            | `$ALL_WORK_COLUMN_NAME`            | Extracted project name.                                                                                 |
| Description     | `$ALL_WORK_COLUMN_DESCRIPTION`     | Extracted project description.                                                                          |
| Version         | `$ALL_WORK_COLUMN_VERSION`         | Project version from extracted metadata.                                                                |
| Package manager | `$ALL_WORK_COLUMN_PACKAGE_MANAGER` | Package manager and version from the root package metadata, when supplied.                              |
| Remote          | `$ALL_WORK_COLUMN_REMOTE`          | Origin remote URL, in its configured clone-URL form.                                                    |
| ID              | `$ALL_WORK_COLUMN_ID`              | Project identifier, falling back to its raw project name.                                               |
| Author          | `$ALL_WORK_COLUMN_AUTHOR`          | Author names from project metadata, as comma-separated text.                                            |
| Contributor     | `$ALL_WORK_COLUMN_CONTRIBUTOR`     | Contributor names from project metadata, as comma-separated text; separate from the Contributors count. |
| Maintainer      | `$ALL_WORK_COLUMN_MAINTAINER`      | Maintainer names from project metadata, as comma-separated text.                                        |
| Status          | `$ALL_WORK_COLUMN_STATUS`          | Raw authorship/maintenance relationship keyword, based on Identity preferences and fork metadata.       |
| Tags            | `$ALL_WORK_COLUMN_TAGS`            | Project keywords or tags, as comma-separated text.                                                      |
| License         | `$ALL_WORK_COLUMN_LICENSE`         | Normalized project license identifiers, as comma-separated text.                                        |

### Paths and links variables

| Column       | Variable                        | Value                                                                                              |
| ------------ | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| Repo Path    | `$ALL_WORK_COLUMN_REPO_PATH`    | Local `file:` URL for the repository directory, rather than a bare filesystem path.                |
| VS Code Path | `$ALL_WORK_COLUMN_VS_CODE_PATH` | `vscode:` URL for opening the repository in VS Code.                                               |
| Readme Path  | `$ALL_WORK_COLUMN_README_PATH`  | Local `file:` URL derived from the project readme metadata.                                        |
| Folder Name  | `$ALL_WORK_COLUMN_FOLDER_NAME`  | Repository directory basename.                                                                     |
| Homepage URL | `$ALL_WORK_COLUMN_HOMEPAGE_URL` | Project homepage URL from metadata; the website shortcut separately uses the GitHub website field. |
| Repo URL     | `$ALL_WORK_COLUMN_REPO_URL`     | Normalized project repository URL; can differ from the configured origin clone URL in Remote.      |
| Issues URL   | `$ALL_WORK_COLUMN_ISSUES_URL`   | Project issue-tracker URL from metadata.                                                           |
| Readme URL   | `$ALL_WORK_COLUMN_README_URL`   | Remote readme URL, when identified in project metadata.                                            |

### Dependencies and platform variables

| Column           | Variable                            | Value                                                                                              |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Dependencies     | `$ALL_WORK_COLUMN_DEPENDENCIES`     | Production/runtime dependency names, as comma-separated text.                                      |
| Dev Dependencies | `$ALL_WORK_COLUMN_DEV_DEPENDENCIES` | Development dependency names, as comma-separated text.                                             |
| Runtime          | `$ALL_WORK_COLUMN_RUNTIME`          | Declared runtime platforms or requirements, as comma-separated text.                               |
| Operating System | `$ALL_WORK_COLUMN_OPERATING_SYSTEM` | Declared supported operating systems, as comma-separated text.                                     |
| Homebrew         | `$ALL_WORK_COLUMN_HOMEBREW`         | `true` when extracted dependencies include `brewpub`; does not verify a published formula or cask. |
| Monorepo         | `$ALL_WORK_COLUMN_MONOREPO`         | `true` when root workspace configuration is detected.                                              |

### Git variables

Upstream comparisons use locally cached refs. Ahead, Behind, and Sync are empty when no upstream comparison is available.

| Column             | Variable                              | Value                                                                                                          |
| ------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Branch             | `$ALL_WORK_COLUMN_BRANCH`             | Current Git branch.                                                                                            |
| Working tree       | `$ALL_WORK_COLUMN_WORKING_TREE`       | Changed-file count; `0` when clean, empty when Git status is unavailable.                                      |
| Ahead              | `$ALL_WORK_COLUMN_AHEAD`              | Commits ahead of the configured upstream using its locally cached ref; empty if unavailable.                   |
| Behind             | `$ALL_WORK_COLUMN_BEHIND`             | Commits behind the configured upstream using its locally cached ref; empty if unavailable.                     |
| Sync               | `$ALL_WORK_COLUMN_SYNC`               | Numeric sum of Ahead and Behind when available.                                                                |
| Last commit        | `$ALL_WORK_COLUMN_LAST_COMMIT`        | Latest commit timestamp in ISO format, not the commit subject; empty without a commit.                         |
| Created            | `$ALL_WORK_COLUMN_CREATED`            | Normalized project creation date, with source-specific fallbacks.                                              |
| First Commit Date  | `$ALL_WORK_COLUMN_FIRST_COMMIT_DATE`  | First local Git commit timestamp.                                                                              |
| Contributors       | `$ALL_WORK_COLUMN_CONTRIBUTORS`       | Contributor count; local Git data counts unique author email addresses, while GitHub can supply its own count. |
| Tracked Files      | `$ALL_WORK_COLUMN_TRACKED_FILES`      | Tracked-file count from Git statistics.                                                                        |
| Tracked Size MB    | `$ALL_WORK_COLUMN_TRACKED_SIZE_MB`    | Total tracked-file size in decimal megabytes.                                                                  |
| Git Commits        | `$ALL_WORK_COLUMN_GIT_COMMITS`        | Number of commits reachable from HEAD in local Git history.                                                    |
| Git Remotes Ahead  | `$ALL_WORK_COLUMN_GIT_REMOTES_AHEAD`  | Total commits ahead of locally cached remote `main`/`master` refs across remotes; does not fetch.              |
| Git Remotes Behind | `$ALL_WORK_COLUMN_GIT_REMOTES_BEHIND` | Total commits behind locally cached remote `main`/`master` refs across remotes; does not fetch.                |
| Git LFS            | `$ALL_WORK_COLUMN_GIT_LFS`            | `true` when LFS files are detected; an unavailable detection result can be empty.                              |
| Git Tags           | `$ALL_WORK_COLUMN_GIT_TAGS`           | Local Git tag count, including tags that are not version tags.                                                 |
| Git Branches       | `$ALL_WORK_COLUMN_GIT_BRANCHES`       | Branch count from local Git statistics.                                                                        |
| Git Remotes        | `$ALL_WORK_COLUMN_GIT_REMOTES`        | Number of configured Git remotes.                                                                              |
| Git Submodules     | `$ALL_WORK_COLUMN_GIT_SUBMODULES`     | Submodule count from Git statistics.                                                                           |

### GitHub and releases variables

GitHub fields require applicable remote metadata; release fields can also have local or registry fallbacks.

| Column                 | Variable                                  | Value                                                                                                       |
| ---------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Account                | `$ALL_WORK_COLUMN_ACCOUNT`                | Repository owner login reported by GitHub.                                                                  |
| Public                 | `$ALL_WORK_COLUMN_PUBLIC`                 | Whether GitHub reports the repository as non-private, as `true` or `false`.                                 |
| Fork                   | `$ALL_WORK_COLUMN_FORK`                   | Whether GitHub reports the repository as a fork, as `true` or `false`.                                      |
| Language               | `$ALL_WORK_COLUMN_LANGUAGE`               | Primary project languages from available metadata, as comma-separated text.                                 |
| Latest Push Date       | `$ALL_WORK_COLUMN_LATEST_PUSH_DATE`       | Latest repository push timestamp reported by GitHub.                                                        |
| Stars                  | `$ALL_WORK_COLUMN_STARS`                  | GitHub stargazer count.                                                                                     |
| Watchers               | `$ALL_WORK_COLUMN_WATCHERS`               | GitHub watcher count.                                                                                       |
| Forks                  | `$ALL_WORK_COLUMN_FORKS`                  | GitHub fork count.                                                                                          |
| Issues Open            | `$ALL_WORK_COLUMN_ISSUES_OPEN`            | Open GitHub issue count.                                                                                    |
| Issues Closed          | `$ALL_WORK_COLUMN_ISSUES_CLOSED`          | Closed GitHub issue count.                                                                                  |
| PRs Open               | `$ALL_WORK_COLUMN_PRS_OPEN`               | Open GitHub pull-request count.                                                                             |
| PRs Merged             | `$ALL_WORK_COLUMN_PRS_MERGED`             | Merged GitHub pull-request count.                                                                           |
| PRs Closed             | `$ALL_WORK_COLUMN_PRS_CLOSED`             | Closed GitHub pull-request count.                                                                           |
| Vulnerability Alerts   | `$ALL_WORK_COLUMN_VULNERABILITY_ALERTS`   | GitHub vulnerability-alert count; unavailable without suitable permissions, rather than automatically zero. |
| GitHub Size MB         | `$ALL_WORK_COLUMN_GITHUB_SIZE_MB`         | Repository disk usage reported by GitHub, converted to decimal megabytes.                                   |
| Forked From            | `$ALL_WORK_COLUMN_FORKED_FROM`            | GitHub URL of the fork's parent repository.                                                                 |
| Fork Ahead             | `$ALL_WORK_COLUMN_FORK_AHEAD`             | Commits ahead of the parent repository in the GitHub fork comparison.                                       |
| Fork Behind            | `$ALL_WORK_COLUMN_FORK_BEHIND`            | Commits behind the parent repository in the GitHub fork comparison.                                         |
| Template From          | `$ALL_WORK_COLUMN_TEMPLATE_FROM`          | GitHub URL of the template repository, when available.                                                      |
| Organization           | `$ALL_WORK_COLUMN_ORGANIZATION`           | Whether the GitHub owner is an organization, as `true` or `false`.                                          |
| Latest Release Date    | `$ALL_WORK_COLUMN_LATEST_RELEASE_DATE`    | Latest release date from GitHub, registry metadata, or a local version tag, depending on available sources. |
| Latest Release Version | `$ALL_WORK_COLUMN_LATEST_RELEASE_VERSION` | Version from an Obsidian manifest, package registry, GitHub release, or local version tag.                  |
| Releases               | `$ALL_WORK_COLUMN_RELEASES`               | GitHub release count, falling back to the local version-tag count.                                          |

### Packages variables

| Column            | Variable                             | Value                                                                                                                |
| ----------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Published         | `$ALL_WORK_COLUMN_PUBLISHED`         | Whether a supported package publication was found, as `true` or `false`.                                             |
| Package URL       | `$ALL_WORK_COLUMN_PACKAGE_URL`       | Published Obsidian, npm, or PyPI package URL, when available.                                                        |
| Downloads Total   | `$ALL_WORK_COLUMN_DOWNLOADS_TOTAL`   | Source-dependent total: npm lifetime, Obsidian community count, PyPI last 180 days, or latest GitHub release assets. |
| Downloads Monthly | `$ALL_WORK_COLUMN_DOWNLOADS_MONTHLY` | Monthly npm or PyPI download count, when available.                                                                  |

### CI variables

| Column | Variable                  | Value                                                                                                         |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| CI     | `$ALL_WORK_COLUMN_CI`     | Conclusion of the latest completed default-branch run of a workflow named CI, such as `Success` or `Failure`. |
| CI URL | `$ALL_WORK_COLUMN_CI_URL` | URL of that CI run.                                                                                           |

### Codebase scans variables

Code and file scans refresh automatically when the workspace loads. Size fields ending in MB use decimal megabytes (1 MB = 1,000,000 bytes).

| Column             | Variable                              | Value                                                                                                  |
| ------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Secondary Language | `$ALL_WORK_COLUMN_SECONDARY_LANGUAGE` | Languages detected by the code scan, excluding the primary project languages, as comma-separated text. |
| Lines of Code      | `$ALL_WORK_COLUMN_LINES_OF_CODE`      | Code lines reported by Tokei, excluding blank lines and comments.                                      |
| Total Files        | `$ALL_WORK_COLUMN_TOTAL_FILES`        | File count from the filesystem scan.                                                                   |
| Total Size MB      | `$ALL_WORK_COLUMN_TOTAL_SIZE_MB`      | Total size from the filesystem scan, in decimal megabytes.                                             |

### Dependency updates variables

These variables require **Repositories → Check Dependencies for Selected** when no cached check exists. Showing their columns or inserting a variable does not start the check.

| Column        | Variable                         | Value                                              |
| ------------- | -------------------------------- | -------------------------------------------------- |
| Major Updates | `$ALL_WORK_COLUMN_MAJOR_UPDATES` | Number of reported major dependency updates.       |
| Minor Updates | `$ALL_WORK_COLUMN_MINOR_UPDATES` | Number of reported minor dependency updates.       |
| Patch Updates | `$ALL_WORK_COLUMN_PATCH_UPDATES` | Number of reported patch dependency updates.       |
| Total Updates | `$ALL_WORK_COLUMN_TOTAL_UPDATES` | Total reported dependency-update count.            |
| Libyears      | `$ALL_WORK_COLUMN_LIBYEARS`      | Aggregate dependency update lag measured in years. |

### Run output variables

Each current run column supplies a variable using its stable run number, even when the column is hidden. These contain the captured result text; status, exit code, and duration do not have separate column variables.

| Variable                                              | Value                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `$ALL_WORK_COLUMN_RUN_1`                              | Captured output from Run 1 for this repository; empty if it was omitted from that run.                |
| `$ALL_WORK_COLUMN_RUN_2`, `$ALL_WORK_COLUMN_RUN_3`, … | The same mapping for the corresponding run number; numbering can have gaps after columns are cleared. |

### Using captured values

Values are raw strings: booleans become `true`/`false`, numeric zero remains `0`, lists are comma-separated text, and absent values become an empty string. A display label such as **Clean**, **Yes**, or a formatted date is not necessarily the variable's value.

```sh
printf '%s: %s\n' "$ALL_WORK_COLUMN_NAME" "$ALL_WORK_COLUMN_BRANCH"
```

Quote references to preserve spaces and newlines. Cell contents are passed as data; shell syntax inside a value is not executed merely by expanding the variable. Explicitly evaluating a value as shell code changes that behavior.

If a referenced column is still pending, or a cached value is refreshing, the submission can be rejected with a list of columns to wait for. Show the relevant columns or refresh metadata for the selected repositories, then submit again. Referencing a variable does not itself trigger its metadata source. Dependency-update variables require a dependency check if no result exists. Once a source has settled as unavailable, its value can be empty.

Previous output is captured at submission, including partial output from an active source run. It is not a live pipe and does not wait for the source run to finish. Queued commands keep that captured value even if its source column is later cleared. A run kept only under **Cleared runs** remains available to filter rules, but is no longer offered as a variable source for new commands.

## Preferences and saved state

Open **All Work → Preferences…** (⌘,) in the macOS desktop app, or use the gear button in browser mode. Preferences apply across workspaces; they are not separate settings for each repository.

### Saving and cancelling

Edit the fields and choose **Save** to write preferences, apply them to the main view, and close Preferences. **Cancel** closes Preferences without saving draft field changes. Saving an identity change requests a local metadata refresh for every repository in the current workspace, so classifications and identity-based filters can update without restarting.

The **Storage** reset and cache buttons execute immediately. Cancel does not undo them. After a successful reset or cache action, the form reloads its fields from the current saved preferences, replacing unsaved field edits; save changes before using those actions if you want to keep them.

Saving a named filter or column preset, or toggling **View → Show Repo Shortcut Buttons**, writes that change directly. Those actions do not need a later Save in Preferences.

### Identity

The two identity fields have different roles:

| Field           | What to enter                                                                                         | Where it is used                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Author names    | Your names or aliases as they appear in extracted project author, contributor, or maintainer metadata | People-column **is me**, **includes me**, and **does not include me** rules; the author part of **Mine**; project Status classification. |
| GitHub accounts | GitHub usernames and organization account names that you want treated as yours                        | Repo owner **is me** and **is not me** rules; the ownership part of **Mine**; project Status classification.                             |

Use one entry per line or separate entries with commas. Leading/trailing whitespace and empty entries are removed, duplicate entries are collapsed, and a leading `@` is removed from GitHub accounts. Each field accepts up to 100 entries of up to 200 characters. Both lists can be empty.

The identity-specific filter comparisons ignore case and match complete names or owner values. For people columns, **is me** requires a nonempty list containing only your aliases; **includes me** also allows other people. If a Repo owner contains a nested namespace, its entire owner value is compared with your configured accounts.

These fields do not sign in to GitHub, change Git's `user.name` or `user.email`, or change a repository's remote URL. They describe your relationship to the metadata. For example, adding an organization's account makes its repositories count as yours for owner rules; it does not grant access to private repositories. Configure credentials separately as described under [GitHub authentication](#github-authentication).

Current defaults contain the developer's author aliases and GitHub accounts. Replace them before relying on **Mine**, identity rules, or Status. **Reset All Settings** restores those defaults.

### Repo shortcut buttons

Each checkbox controls one button in every Repository cell. Open in GitHub, Reveal in Finder, Open in Terminal, and Refresh Metadata start enabled; the other five start disabled. Enabling a checkbox adds its button; readme, GitHub, and website actions appear disabled when their target is unavailable. The desktop context menu remains available independently of the buttons.

| Preference       | Button behavior and requirements                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open Readme      | Opens the detected root readme using **Readmes → Open with**. Disabled when there is no supported readme file.                                                          |
| Open in Tower    | Opens the repository folder in Tower. Requires the application to be installed on macOS.                                                                                |
| Open in VS Code  | Opens the repository folder through the `vscode:` URL handler. This editor choice is fixed; the readme-app preference does not change it.                               |
| Open in GitHub   | Opens the recognized `github.com` origin remote in your browser. Disabled without a supported GitHub origin.                                                            |
| Open Website     | Opens the separate website configured on GitHub. Enabling it requests GitHub metadata even when its columns are hidden. Disabled when no separate website is available. |
| Reveal in Finder | Reveals the repository folder in Finder on macOS.                                                                                                                       |
| Copy Path        | Copies the resolved absolute repository path, including a symlink's target path.                                                                                        |
| Open in Terminal | Opens the repository folder using **Terminal → Open with** on macOS.                                                                                                    |
| Refresh Metadata | Refreshes local, Git, GitHub, registry, CI, code, and file metadata for that repository. Does not run dependency checks.                                                |

**View → Show Repo Shortcut Buttons** switches all buttons off when any are enabled, and switches all on when none are enabled. It does not remember a previous partial selection; use the individual checkboxes to restore a particular set.

### Readmes and terminal applications

**Readmes → Open with** lists applications macOS offers for Markdown files. Choose **System default** to let macOS use the normal handler for the actual readme file, or choose an application to use for discovered readmes. The choice applies to the readme shortcut, its context-menu action, and **Repositories → Open Selected In → Readme**. It does not change VS Code launching or macOS's global file associations.

**Terminal → Open with** lists detected installed copies of Terminal, WezTerm, iTerm, Ghostty, Warp, and kitty. **System default** uses macOS's shell-script handler; the menu shows the detected default app's name when available. A shell-script handler can be an editor rather than a terminal, so select a specific terminal when necessary.

The terminal choice controls repository-opening actions, including **Repositories → Open Selected In → Terminal**. It does not change the shell used by All Work's command runner or the GitHub CLI lookup; those use the server's `SHELL`/account configuration.

Application lists load when Preferences opens. Reopen Preferences after installing an app or changing system associations. A saved app that is no longer installed can remain listed under its bundle identifier; choose another app or System default if opening fails. On other operating systems these macOS application lists are empty, and the corresponding native launch actions are unsupported.

### Defaults

| Preference                           | Initial value and Reset All Settings value |
| ------------------------------------ | ------------------------------------------ |
| Author names                         | Developer author aliases.                  |
| GitHub accounts                      | Developer account names.                   |
| Repo shortcut buttons                | GitHub, Finder, Terminal, and Refresh.     |
| Readmes → Open with                  | System default.                            |
| Terminal → Open with                 | System default.                            |
| Restore the last workspace on launch | Enabled.                                   |
| User filter and column presets       | None; built-in presets remain available.   |

### Saved view and workspace restoration

Named filter and column presets, identity, shortcut choices, preferred apps, and the workspace-restoration setting are saved in preferences. The current view separately remembers the workspace path, recursive setting, command draft and history, Jobs, Output lines, Auto clear, search and filter rules, selections, column visibility/order/widths, sorting, scroll position, and run references.

**Storage → Restore the last workspace on launch** is enabled by default. On startup, it loads the last workspace, restores its current view and available run output, and starts normal metadata refreshes. It never reruns saved commands; interrupted runs restore as cancelled snapshots after a server restart.

Turning restoration off stops automatic workspace loading while retaining saved settings. It does not close the current workspace or stop active commands. Loading the same saved workspace manually can still restore its runs and view. This is a single last-workspace snapshot, not a collection of independent saved workspaces. Desktop and browser sessions use the same settings directory unless overridden.

### Storage locations

| Data                                    | Default macOS location                                    |
| --------------------------------------- | --------------------------------------------------------- |
| Preferences and named presets           | `~/Library/Application Support/All Work/preferences.json` |
| View, history, and references to output | `~/Library/Application Support/All Work/view.json`        |
| Repository metadata cache               | `~/Library/Caches/All Work/metadata/`                     |
| Captured commands and output            | `~/Library/Caches/All Work/runs/`                         |

Settings and caches are JSON files, separate from browser storage. They can contain private repository paths, command text, expanded command values, and printed output. Metadata extraction runs locally without uploading source files, but GitHub, registry, and dependency lookups contact their upstream services and can disclose the identifiers being queried. Commands have their own local and network effects. See the [readme's privacy section](../readme.md#privacy).

### Reset and cleanup controls

| Action                                         | Effect                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reset View** in Preferences or the View menu | Restores toolbar and table defaults, clears current rules/selection/search, and resets column layout. Keeps identity, named presets, command history, and displayed runs. Retained cleared runs are released.                               |
| **Clear Metadata Cache** in Preferences        | Deletes metadata cache files. Does not clear command history or output, or immediately replace values already in memory. Refresh or reload afterward.                                                                                       |
| **Reset All Settings** in Preferences          | Restores preference defaults, removes saved user presets, resets the view, and clears command history. Displayed runs and repository metadata caches remain. Identity returns to the current developer defaults rather than becoming empty. |
| Clear a run's output column                    | Stops it if active and removes its output cache unless a current filter rule retains it.                                                                                                                                                    |

Resetting settings or clearing output does not undo commands or modify repository files.

## Keyboard shortcuts

These shortcuts refer to the macOS desktop app:

| Shortcut                           | Action                                                                |
| ---------------------------------- | --------------------------------------------------------------------- |
| ⌘,                                 | Preferences                                                           |
| ⌘O                                 | Open workspace                                                        |
| ⌘R                                 | Reload workspace                                                      |
| ⌘↩                                 | Run the current command                                               |
| ⌘.                                 | Stop all active runs                                                  |
| ⌘K                                 | Clear finished runs                                                   |
| ⌘L                                 | Focus and select the command field                                    |
| ⌘F                                 | Focus and select the repository search field                          |
| ⌥⌘F                                | Show filter rules                                                     |
| ⌘A                                 | Select all matching repositories, or text when a text field has focus |
| ⌥⌘A                                | Deselect every repository                                             |
| ⇧⌘R                                | Refresh metadata for selected matching repositories                   |
| Shift-click a column heading       | Add or change a secondary sort                                        |
| Option-click **+** in filter rules | Add a nested rule group                                               |

Browser mode provides Preferences through the gear button or its shortcut (⌘, on macOS or Ctrl+, elsewhere), and repository selection through ⌘A/Ctrl+A and ⌥⌘A/Alt+Ctrl+A outside text fields. Other application menu shortcuts are not installed there and may retain their browser meanings. Preferences and output use dialogs, **Browse…** is absent, and native repository/header context menus are absent. Enter workspace paths manually. Dependency checking is currently exposed through the desktop Repositories menu.

## Example workflows

### Inspect repositories that need attention

Choose the **Git Work** column preset, then **Dirty** or **Needs Attention** under Filter. **Needs Attention** can also request CI metadata, since it includes failing CI. Select all matching rows and run `git status --short`. Click a result for details or open that repository in your terminal.

### Refresh remote comparisons

Select the repositories to check and choose the **Fetch remote updates** command preset (`git fetch --all --prune`). Run it, inspect failures, and wait for the automatic Git refresh after each command. **Ahead**, **Behind**, and the **Ready to Push/Pull** filters now use the updated refs. Fetching does not merge or rebase branches.

### Check dependency lag

Choose the **Dependencies** column preset, select repositories, and use **Repositories → Check Dependencies for Selected**. Wait for results, then add a filter such as **Total Updates is greater than 0**. A zero is a completed check with no reported updates; **Not scanned** means no result has been loaded.

### Use output to choose the next working set

Run a query, then add a rule on that run's output or status. For example, filter a `git status --short` run with **output is not empty**. Select the remaining rows for a follow-up command. Clearing the first output column keeps the rule and its data under **Cleared runs** until you remove that rule.

To pass previous output as an argument, reference its numbered variable in a new command:

```sh
printf '%s\n' "$ALL_WORK_COLUMN_RUN_1"
```

Use the actual run number in your table, and wait for the source run if you need its complete output.

## Troubleshooting

| Symptom                                            | What to check                                                                                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No repositories found                              | Confirm the path contains `.git` roots or worktrees. Enable Recursive for deeper folders. Excluded dependency/build folders and symlinked collection folders are not traversed.                                            |
| No matching repositories, or Run in 0              | Clear the search, choose Filter → None, and disable Selected only. Then select rows. Hidden selections are not action targets.                                                                                             |
| Missing shortcut buttons                           | Enable individual buttons in Preferences, or use View → Show Repo Shortcut Buttons.                                                                                                                                        |
| GitHub metadata missing                            | Verify `gh auth status`, repository access, and field permissions. Reload after authentication changes; an environment token takes precedence over CLI credentials. GitHub-specific metadata may not apply to other hosts. |
| Metadata shows … or an old value                   | Wait for the queue, hover for status and timestamps, or force Refresh Metadata for Selected. Cached data can remain visible during a refresh.                                                                              |
| Dependency fields show Not scanned                 | Select repositories and run Check Dependencies for Selected in the desktop app. Showing the columns or referencing variables does not perform the check.                                                                   |
| A variable reports metadata still loading          | Show its metadata columns, wait for loading to settle, or refresh the selected rows. If the error mentions a Metadata menu, the current control is Repositories → Refresh Metadata for Selected.                           |
| Command missing, alias different, or blank listing | Check the login shell configuration, executable PATH, and non-TTY behavior. Try `command -v git` in All Work or an explicit directory argument such as `ls .`. A live terminal session's state is not shared.              |
| Authentication prompt or editor cannot open        | Run the interactive step in a terminal first. Commands have no usable stdin or TTY; Git terminal prompts are disabled.                                                                                                     |
| Command succeeded but printed nothing              | Inspect its exit code. Some commands, including `git status --short` on a clean tree, succeed silently.                                                                                                                    |
| Output is shortened                                | Increase Output lines or open the result. If the 128,000-character capture limit was reached, more text was not retained; use command redirection to a file if you need a complete log.                                    |
| Ahead/Behind looks stale or empty                  | Fetch to update refs. Check that the current branch has an upstream whose ref exists locally. Hover the cell to see the compared upstream.                                                                                 |
| Cleared output still affects the filter            | Open Filter and inspect Cleared runs. Remove its rule to release that run.                                                                                                                                                 |
| Reload is disabled                                 | Stop active displayed runs and wait for them to finish cancelling. A hidden active output column can still keep a run active.                                                                                              |
| Settings do not save                               | Check write access to the settings directory and any ALL_WORK_SETTINGS_DIRECTORY override. Settings are disk-backed, so clearing browser storage does not reset them.                                                      |
| Metadata or command stream disconnected            | After active work settles, reload the workspace or reopen the app. A restarted server restores captured output but does not resume interrupted commands.                                                                   |
| Packaged app cannot start its local server         | Its server expects `127.0.0.1:4173`. Check whether another All Work/browser production server is already using that port.                                                                                                  |

## Development and packaging

A source checkout requires Git, Node.js satisfying the `engines` field in [package.json](../package.json), and the pnpm version declared there. Start with `pnpm install`.

| Command                  | Purpose                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`               | Runs Poptab to close stale local development tabs, then starts Vite on `127.0.0.1` and opens the browser interface. |
| `pnpm dev:electron`      | Starts the Electron app with its SvelteKit development server through the electron-vite fork.                       |
| `pnpm build`             | Builds the SvelteKit app into `build/` and Electron main/preload/server code into `out/`.                           |
| `pnpm start`             | Runs the built local server; build first, then open `http://127.0.0.1:4173`.                                        |
| `pnpm build:electron`    | Builds and packages a desktop application into `dist/` using electron-builder.                                      |
| `pnpm check`             | Runs Svelte and TypeScript checks.                                                                                  |
| `pnpm test`              | Runs Vitest tests.                                                                                                  |
| `pnpm lint` / `pnpm fix` | Runs shared-config checks or applies their automatic fixes.                                                         |

The current macOS packaging target is a ZIP archive. Windows and Linux targets exist in the builder configuration, but the maintained desktop platform is macOS and native repository actions are macOS-specific.

### Environment variables

Set these in the environment of the process launching the server or app:

| Variable                      | Purpose                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ALL_WORK_DIRECTORY`          | Initial workspace-path suggestion; saved view state can override it. Otherwise the suggestion is the parent of the server's working directory.                  |
| `ALL_WORK_SETTINGS_DIRECTORY` | Overrides the folder containing `preferences.json` and `view.json`; useful for isolating development settings from the desktop app.                             |
| `ALL_WORK_CACHE_DIRECTORY`    | Overrides the metadata cache directory directly. Run caches then live in its `runs/` subfolder; it is not a parent containing a separate `metadata/` subfolder. |
| `GITHUB_TOKEN` / `GH_TOKEN`   | GitHub metadata credentials, in priority order.                                                                                                                 |
| `SHELL`                       | UNIX shell used for commands and the GitHub CLI token lookup.                                                                                                   |
| `HOST` / `PORT`               | Built browser-server address; defaults to `127.0.0.1:4173`. The packaged app supplies its own fixed loopback address.                                           |

The action API accepts loopback hostnames and same-origin application requests. Changing HOST does not turn All Work into a supported remote dashboard. For a separate local browser production instance, choose another PORT. Development and packaged instances otherwise share settings/caches by default.

### Implementation notes

The interface uses SvelteKit 3, Svelte 5, and TanStack Table's Svelte adapter. Electron provides the application menu, folder picker, native context menus, and secondary windows. Execa manages command processes, streaming, and cancellation; Metascope extracts project metadata.

Metadata extraction uses up to four isolated scanner processes. They are reused between repositories, exit after 30 idle seconds, and have a two-minute extraction timeout. Local scans take priority over background network requests, and one repository's source groups run sequentially. These limits are independent of command **Jobs**.

Reloading or replacing a workspace cancels its outstanding metadata work. Linked worktrees and repositories without commits receive supplemental Git status queries when Metascope has no Git statistics. No separate package rows are created from monorepo workspace manifests.

For implementation details, see the [metadata loader](../src/lib/server/repository-metadata.ts), [command runner](../src/lib/server/commands.ts), [run history](../src/lib/run-history.svelte.ts), and [saved-view schema](../src/lib/view-storage.ts).

### Maintainer release scripts

`pnpm release1` uses Bumpp to bump the version and create a release commit, then builds. `pnpm release2` packages and publishes artifacts to GitHub; it uses the maintainer's 1Password CLI token lookup and sets `APPLE_KEYCHAIN_PROFILE=notarytool`. These scripts require the corresponding maintainer credentials and macOS signing setup and are not needed for ordinary development.

To save notarization credentials in that Keychain profile:

```sh
xcrun notarytool store-credentials notarytool --apple-id <apple-id-email> --team-id <team-id>
```

With the Apple ID and team ID supplied, `notarytool` prompts securely for the app-specific password. The profile is then available to the packaging tool's notarization step when signing/notarization requirements are met.
