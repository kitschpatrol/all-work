# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-11-11

### Added

- Add a History dropdown to recall submitted commands newest first, with Clear history to erase saved history while keeping the current command draft.
- Add “Add Column” to every desktop column header’s context menu, inserting hidden columns immediately to the right in the same dock or scrolling area.
- Add “VS Code Workspace” to “Open Selected In” to open selected repositories together in a new multi-root workspace. `POST /api/repositories/vscode` supports opening selections in one workspace or separate windows.

### Changed

- Handle Escape one step per press, clearing the focused search before closing a Columns or Filter popover and finally leaving the focused control to restore table shortcuts.
- Reduce saved command history from 100 entries to 50.
- Move Columns beside the filters and keep Clear finished runs visible on the right, disabled when there are no finished runs.
- Hide exit codes 0 and 1 in table previews and soften the ellipsis indicating additional output. Full output views still show all available exit codes.
- Omit the redundant ready status from metadata tooltips.
- Remove the sample `git status --short` placeholder from the command field.

### Fixed

- Fix “Open Selected In → VS Code” failing to open every selected repository by launching each in its own window. The action now requires `code` on PATH and reports launcher errors.

### Documentation

- Update the help guide for command history controls, column insertion, VS Code opening modes and launcher requirements, Escape handling, and exit-code display.
- Clarify that the maintained macOS build requires Apple silicon and macOS 13 (Ventura) or later.
- Correct `pnpm release` documentation to include Chagent changelog generation before the release commit.

### Maintenance

- Update Electron to `^45.2.3`, Metascope to `^0.13.9`, and Lognow to `^0.8.8`.
- Refresh development and release tooling, including SvelteKit 3.2, Chagent 0.5, pnpm 12.18, shared lint configuration, and GitHub Actions.
- Pin Knip to 6.44.2 to avoid false dependency reports for SvelteKit’s generated `$app` configuration.
- Exclude generated distribution and coverage output from TypeScript project checks.

## [1.2.0] - 2026-11-06

### Added

- Filter Account metadata by is mine and is not mine using GitHub accounts configured in Preferences.
- Give editable text fields native context menus in every app window, including undo/redo, clipboard actions, and Select All.
- Add “Save As” for modified filter and column presets, creating a new preset without overwriting the original.
- Stop one repository's command while the rest of its run continues, with controls in running cells and output windows. `PATCH /api/runs/[id]` accepts `repositoryId` to skip queued commands or terminate running ones.

### Changed

- Label account and repository-owner identity predicates is mine and is not mine.
- Show running-command counts separately from completed/total progress in run headers, and explicitly mark finished runs complete.
- Open full command output through a dedicated button, allowing output preview text to be selected.
- Show animated running stripes and success or failure colors in output-window toolbars.

### Security

- Update bundled Electron from 45.1.0 to 45.2.1, incorporating Chromium, V8, and Skia security backports.

### Documentation

- Document Account and Repo owner ownership filters and their GitHub account settings.
- Correct the README's macOS support wording.
- Add run-header tooltips explaining that Stop affects every repository and deleting an active output column also stops its run.

### Maintenance

- Remove the obsolete esbuild build approval.
- Correct the Homebrew package keyword from homebrew-formula to homebrew-cask.
- Integrate `@kitschpatrol/chagent` 0.4.0 into the release command and upgrade the GitHub release-changelog action to v3.

## [1.1.0] - 2026-10-31

### Added

- Dock metadata and run columns at either table edge, reorder columns within each dock, and save docking with the view.
- Sort run columns by exit code in either direction, keep results without exit codes last, and remember the sorting choice.
- Add Copy Command to run-header menus to copy the original submitted command.

### Changed

- Render rows and scrolling metadata columns near the viewport while retaining full-table sorting, filtering, selection, copying, and content fitting.
- Animate column reordering during dragging and commit the new order once on drop.
- Wrap metadata text into the height available beside multiline output, keeping links and path-like words intact.
- Stop saving table scroll position; open the table at its top-left corner and avoid settings writes while scrolling.
- Show focus rings for keyboard navigation and field-focus shortcuts, preserve focus when using number steppers, and remove resize handles from the Tab order.
- Continue row striping through virtualized placeholders and blank table space, lighten selection and placeholder colors, and shorten metadata status text to Loading.

### Fixed

- Remove deleted repositories and their selections during metadata refresh, dropping their queued scans.
- Keep dragged docked columns below the sticky header and move dock, drag-slot, and blank-space shadows with the columns they belong to.
- Restore the browser Select All handler and prevent stray handler source from pushing the status bar out of view.

### Documentation

- Update help and README guidance for docking, exit-code sorting, virtualization, text wrapping, saved state, platform requirements, and release commands.

### Maintenance

- Declare macOS (`darwin`) in package installation metadata.
- Extract table feature/column definitions and column-fitting logic into reusable modules.
- Update SvelteKit to 3.1.1 and adapter-node to 6.0.1, and remove temporary dependency release-age exemptions.

## [1.0.0] - 2026-10-30

### Added

- Choose a workspace and discover Git repositories and worktrees, including projects without package manifests, with optional recursive scanning and deduplicated repository symlinks.
- Run commands across selected repositories with configurable parallelism, live combined stdout/stderr, per-repository exit status, and cancellation.
- Execute commands through the user's configured shell, loading login-shell PATH settings, aliases, and functions while excluding startup messages from captured output.
- Provide command presets and keyboard navigation through saved command history.
- Expose repository metadata and previous run output through `ALL_WORK_COLUMN_*` variables, with a variable picker and `$` autocompletion.
- Display live run output in table columns with adjustable previews, status colors, progress, and success/failure counts.
- Inspect full output in native windows or browser dialogs, navigate between matching results, and review commands with captured column-variable values substituted.
- Manage permanently numbered runs with automatic output clearing and header actions to clear finished runs on either side; retain cleared output while filters reference it.
- Extract project, Git, GitHub, registry, CI, code, and file metadata through Metascope, with progressive loading and source/cache/error tooltips.
- Cache metadata on disk, show cached local and Git values immediately at launch, and refresh them in the background.
- Resolve GitHub credentials from `GITHUB_TOKEN`, `GH_TOKEN`, or `gh auth token` through the login shell, looking them up once per workspace when needed.
- Support range selection, checkbox dragging, Select All/Deselect All shortcuts, repository search, and selected-only views; actions target selected rows matching the current filters.
- Build nested All/Any/None filters over metadata and command results, including text patterns, numeric/date comparisons, lists, run statuses, and identity predicates.
- Save, rename, edit, and revert named filters, with built-in presets for ownership, Git work, CI failures, publishing, and maintenance triage.
- Save custom column-visibility presets and choose built-in views for Git work, dependencies, publishing, ownership, codebase size, and other workflows.
- Reorder columns by dragging, resize or fit them to contents, and keep the repository and newest run columns visible at opposite table edges.
- Add header context menus for sorting, filtering, hiding columns, copying values or variables, and showing hidden columns.
- Open supported URLs directly from metadata cells.
- Add terminal, README, website, copy-path, and metadata-refresh repository actions, plus bulk opening through desktop menus.
- Choose installed terminal and README applications and enable individual repository shortcut buttons in Preferences.
- Configure author names and GitHub accounts for project classification and identity filters, starting with empty identity settings.
- Persist preferences, workspace/view state, command history, and run output as local JSON; restore the last workspace without rerunning commands and mark interrupted jobs cancelled.
- Provide native application menus and keyboard shortcuts, separate Preferences windows, and an About window with project links.

### Changed

- Rename AllWork to All Work, using `all-work` for package, repository, and bundle identifiers.
- Run dependency-update checks explicitly for selected repositories, reporting update counts and dependency age without rewriting manifests.
- Refresh Git metadata as each repository's command finishes.
- Refresh the application icon, toolbar and table styling, metadata-loading indicators, and missing-value placeholders.

### Fixed

- Compare Ahead/Behind with the tracked upstream and correct missing Git information, accumulating changed-file counts, and stale upstream values.
- Preserve quoted commands on Windows and display repository-relative paths with forward slashes on every platform.

### Documentation

- Add Homebrew installation and first-run guidance, screenshots, and detailed help covering metadata/authentication, filters, commands, persistence, troubleshooting, and development.

### Maintenance

- Migrate Electron main/preload/server builds to TypeScript and the electron-vite fork, and add a production browser-server start script.
- Optimize metadata scanning and incremental table updates with reusable scanner processes, batched events, and throttled filtering and sorting.
- Refresh application dependencies, including Electron 45, SvelteKit 3.1, Metascope 0.13.8, Execa 10.2, and lognow 0.8.7.
- Expand regression tests, run Svelte rune tests with the client runtime, and add build/lint/test CI on macOS, Linux, and Windows.
- Refresh contributor dependencies and GitHub Actions, move skill management to pnpm, and tighten release-tag validation.
- Configure macOS notarization and consolidate versioning, building, packaging, and publishing into the release script.

## [0.0.6] - 2026-10-07

### Changed

- Limit dependency checks to package updates by disabling Taze's GitHub Actions and Node.js version checks.

### Documentation

- Document the Metascope/Obsidian replacement workflow, revise contribution guidance, and update project and tooling links.

### Maintenance

- Configure electron-builder to upload desktop binaries to GitHub Releases.
- Refresh application dependencies, including Electron 44, SvelteKit 3, Execa 10, Taze 21, and Zod 4.
- Upgrade contributor tooling to shared-config 8, TypeScript 6, Vite 8, Vitest 5, and pnpm 12, requiring Node.js `^24.16.0 || >=26.3.0` for source workflows.
- Fix pnpm hoisting, migrate SvelteKit configuration and internal import aliases, and make maintenance scripts portable across platforms.
- Add automated link checks and scheduled dependency updates, and refresh release and repository-metadata workflows with pinned actions.

## [0.0.5] - 2025-07-30

### Added

- Provide a sortable repository dashboard with source/fork classification, commit dates, working-tree status, and upstream-update indicators.
- Check dependencies recursively with Taze and display separate counts for semver-compatible and major updates.
- Display GitHub stars, open issues, repository visibility, and download counts for public npm packages.
- Run the dashboard in Electron and provide repository shortcuts for Finder, Tower, VS Code, GitHub, and npm.
- Provide `Project` metadata helpers and a validated `ProjectMetadata` schema, including README discovery and configurable project roots, extra paths, and exclusions.

### Documentation

- Add a project README with licensing, contribution links, and a related-project reference.

### Maintenance

- Establish Svelte 5/Tailwind 4 builds, Node.js 22+/pnpm 10+ requirements, lint/type/test checks, and desktop packaging and release tooling for macOS ZIP, Windows NSIS, and Linux tarball targets.
- Add a script reporting dependency usage frequency across authored projects.

[0.0.5]: https://github.com/kitschpatrol/all-work/releases/tag/v0.0.5
[0.0.6]: https://github.com/kitschpatrol/all-work/compare/v0.0.5...v0.0.6
[1.0.0]: https://github.com/kitschpatrol/all-work/compare/v0.0.6...v1.0.0
[1.1.0]: https://github.com/kitschpatrol/all-work/compare/v1.0.0...v1.1.0
[1.2.0]: https://github.com/kitschpatrol/all-work/compare/v1.1.0...v1.2.0
[1.3.0]: https://github.com/kitschpatrol/all-work/compare/v1.2.0...v1.3.0
