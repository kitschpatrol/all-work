import type { ColumnKind } from './metadata-columns.js'
import type { ProjectIdentity } from './preferences.js'
import type { CommandRun, MetadataGroup, MetadataValue, Repository } from './workspace.js'
import { repositoryColumns } from './column-variables.js'
import { asRecord } from './record.js'

/** How a group combines its rules: every rule, at least one, or none of them. */
export type FilterMatch = 'all' | 'any' | 'none'

/**
 * Run output columns add command status, account columns add your GitHub
 * accounts, and people columns add your author names to the repository column
 * kinds.
 */
export type FilterKind = 'account' | 'output' | 'people' | ColumnKind

/** Calendar units for "within the last" date rules. */
export type DateUnit = 'days' | 'months' | 'weeks' | 'years'

/** Command result states a run output rule can test. */
export type RunStatus = 'cancelled' | 'failed' | 'notIncluded' | 'running' | 'success'

/**
 * The value a rule needs: nothing, free text, a number, a numeric range, a
 * count of calendar units, a calendar date, or a command status.
 */
export type OperandShape = 'date' | 'duration' | 'none' | 'number' | 'range' | 'status' | 'text'

const operandShapes = {
	after: 'date',
	atLeast: 'number',
	atMost: 'number',
	before: 'date',
	between: 'range',
	contains: 'text',
	doesNotContain: 'text',
	doesNotInclude: 'text',
	doesNotIncludeMe: 'none',
	endsWith: 'text',
	greaterThan: 'number',
	includes: 'text',
	includesMe: 'none',
	inLast: 'duration',
	is: 'text',
	isEmpty: 'none',
	isMe: 'none',
	isNo: 'none',
	isNot: 'text',
	isNotEmpty: 'none',
	isNotMe: 'none',
	isYes: 'none',
	lessThan: 'number',
	matches: 'text',
	notInLast: 'duration',
	startsWith: 'text',
	statusIs: 'status',
	statusIsNot: 'status',
} as const satisfies Record<string, OperandShape>

/** Every comparison a rule can make; each column kind offers a subset. */
export type FilterOperator = keyof typeof operandShapes

/**
 * One comparison against a column. Operands stay as typed so a half-entered
 * value survives editing; a rule that cannot be evaluated yet is ignored.
 */
export type FilterRule = {
	column: string
	/** Upper bound for `between`. */
	end?: string
	operator: FilterOperator
	/** Unit for `inLast` and `notInLast`; defaults to days. */
	unit?: DateUnit
	value: string
}

/** Rules and nested groups combined by one match mode. */
export type FilterGroup = {
	match: FilterMatch
	rules: FilterNode[]
}

/** A rule or a nested group. */
export type FilterNode = FilterGroup | FilterRule

/** A column a rule can reference, from repository metadata or a command run. */
export type FilterColumn = {
	category: string
	header: string
	id: string
	kind: FilterKind
}

/**
 * A compiled filter. `undefined` means a rule depends on metadata that has not
 * loaded, so the row can neither match nor be ruled out yet.
 */
export type FilterPredicate = (repository: Repository) => boolean | undefined

type Test<T> = (value: T) => boolean

type CompileContext = {
	/** Lowercased GitHub accounts that `isMe` rules compare against. */
	accounts: ReadonlySet<string>
	/** Lowercased author names that `includesMe` rules compare against. */
	authorNames: ReadonlySet<string>
	now: number
	runs: readonly CommandRun[]
}

// Menu order for each kind; the first operator starts new rules
const operatorsByKind = {
	account: [
		'isMe',
		'isNotMe',
		'contains',
		'doesNotContain',
		'is',
		'isNot',
		'startsWith',
		'endsWith',
		'matches',
		'isEmpty',
		'isNotEmpty',
	],
	boolean: ['isYes', 'isNo', 'isEmpty', 'isNotEmpty'],
	date: ['inLast', 'notInLast', 'before', 'after', 'isEmpty', 'isNotEmpty'],
	list: ['includes', 'doesNotInclude', 'isEmpty', 'isNotEmpty'],
	number: [
		'is',
		'isNot',
		'greaterThan',
		'atLeast',
		'lessThan',
		'atMost',
		'between',
		'isEmpty',
		'isNotEmpty',
	],
	output: [
		'statusIs',
		'statusIsNot',
		'contains',
		'doesNotContain',
		'matches',
		'isEmpty',
		'isNotEmpty',
	],
	people: [
		'isMe',
		'includesMe',
		'doesNotIncludeMe',
		'includes',
		'doesNotInclude',
		'isEmpty',
		'isNotEmpty',
	],
	text: [
		'contains',
		'doesNotContain',
		'is',
		'isNot',
		'startsWith',
		'endsWith',
		'matches',
		'isEmpty',
		'isNotEmpty',
	],
} as const satisfies Record<FilterKind, readonly [FilterOperator, ...FilterOperator[]]>

const operatorLabels: Record<FilterOperator, string> = {
	after: 'is after',
	atLeast: 'is at least',
	atMost: 'is at most',
	before: 'is before',
	between: 'is between',
	contains: 'contains',
	doesNotContain: 'does not contain',
	doesNotInclude: 'does not include',
	doesNotIncludeMe: 'does not include me',
	endsWith: 'ends with',
	greaterThan: 'is greater than',
	includes: 'includes',
	includesMe: 'includes me',
	inLast: 'is within the last',
	is: 'is',
	isEmpty: 'is empty',
	isMe: 'is me',
	isNo: 'is No',
	isNot: 'is not',
	isNotEmpty: 'is not empty',
	isNotMe: 'is not me',
	isYes: 'is Yes',
	lessThan: 'is less than',
	matches: 'matches pattern',
	notInLast: 'is not within the last',
	startsWith: 'begins with',
	statusIs: 'status is',
	statusIsNot: 'status is not',
}

// Text operators on run columns read as "output contains" rather than "contains"
const outputOperators = new Set<FilterOperator>([
	'contains',
	'doesNotContain',
	'isEmpty',
	'isNotEmpty',
	'matches',
])

// Both sides are lowercased before comparison
const textTests: Partial<Record<FilterOperator, (text: string, needle: string) => boolean>> = {
	contains: (text, needle) => text.includes(needle),
	doesNotContain: (text, needle) => !text.includes(needle),
	endsWith: (text, needle) => text.endsWith(needle),
	is: (text, needle) => text === needle,
	isNot: (text, needle) => text !== needle,
	startsWith: (text, needle) => text.startsWith(needle),
}

const numberTests: Partial<Record<FilterOperator, (value: number, operand: number) => boolean>> = {
	atLeast: (value, operand) => value >= operand,
	atMost: (value, operand) => value <= operand,
	greaterThan: (value, operand) => value > operand,
	is: (value, operand) => value === operand,
	isNot: (value, operand) => value !== operand,
	lessThan: (value, operand) => value < operand,
}

const matchModes = new Set<string>(['all', 'any', 'none'])
const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/v
const columnsById = new Map(repositoryColumns.map((column) => [column.id, column]))
// Columns naming GitHub accounts or people, which rules can compare with your own
const identityColumns = new Map<string, FilterKind>([
	['metadata:Author', 'people'],
	['metadata:Contributor', 'people'],
	['metadata:Maintainer', 'people'],
	['repoOwner', 'account'],
])
// Saved settings are hand-editable, so bound recursion through nested groups
const maxDepth = 32

/** Units offered for "within the last" date rules, in menu order. */
export const dateUnits: readonly DateUnit[] = ['days', 'weeks', 'months', 'years']

/** Command states offered for run status rules, in menu order. */
export const runStatuses: ReadonlyArray<{ label: string; value: RunStatus }> = [
	{ label: 'succeeded', value: 'success' },
	{ label: 'failed', value: 'failed' },
	{ label: 'cancelled', value: 'cancelled' },
	{ label: 'running', value: 'running' },
	{ label: 'not included', value: 'notIncluded' },
]

/** Distinguish a nested group from a rule. */
export function isFilterGroup(node: FilterNode): node is FilterGroup {
	return 'rules' in node
}

/** A filter with no rules, which matches every repository. */
export function emptyFilter(): FilterGroup {
	return { match: 'all', rules: [] }
}

/** A blank rule on the Name column, ready for editing. */
export function blankRule(): FilterRule {
	return { column: 'name', operator: 'contains', value: '' }
}

/** A filter with one blank rule, ready for editing. */
export function starterFilter(): FilterGroup {
	return { match: 'all', rules: [blankRule()] }
}

/** The operators a column kind supports, in menu order. */
export function getOperators(kind: FilterKind): readonly FilterOperator[] {
	return operatorsByKind[kind]
}

/**
 * Describe an operator in the wording its column kind uses. In the menu, an
 * operator that needs a value ends with an ellipsis until it is selected and
 * its value field appears.
 */
export function getOperatorLabel(
	kind: FilterKind,
	operator: FilterOperator,
	selected: boolean,
): string {
	const label = operatorLabels[operator]
	const worded = kind === 'output' && outputOperators.has(operator) ? `output ${label}` : label
	return selected || getOperandShape(kind, operator) === 'none' ? worded : `${worded}…`
}

/** The operand an operator needs for a column kind. */
export function getOperandShape(kind: FilterKind, operator: FilterOperator): OperandShape {
	return kind === 'number' && (operator === 'is' || operator === 'isNot')
		? 'number'
		: operandShapes[operator]
}

function getColumnKind(column: { id: string; kind: ColumnKind }): FilterKind {
	return identityColumns.get(column.id) ?? column.kind
}

/** Start a rule on a column with its first operator and no value. */
export function createRule(column: FilterColumn): FilterRule {
	const [operator] = operatorsByKind[column.kind]
	return {
		column: column.id,
		operator,
		value: operandShapes[operator] === 'status' ? 'failed' : '',
	}
}

/**
 * Point a rule at another column, keeping its operator and value only when the
 * new column's kind offers that operator with the same kind of value.
 */
export function retargetRule(rule: FilterRule, from: FilterKind, to: FilterColumn): FilterRule {
	return getOperators(to.kind).includes(rule.operator) &&
		getOperandShape(from, rule.operator) === getOperandShape(to.kind, rule.operator)
		? { ...rule, column: to.id }
		: createRule(to)
}

/** Change a rule's operator, clearing a value whose format no longer fits. */
export function changeOperator(
	rule: FilterRule,
	kind: FilterKind,
	operator: FilterOperator,
): FilterRule {
	const shape = getOperandShape(kind, operator)
	if (shape === getOperandShape(kind, rule.operator)) {
		return { ...rule, operator }
	}

	return {
		column: rule.column,
		operator,
		value: shape === 'status' ? 'failed' : '',
		...(shape === 'duration' && { unit: 'days' as const }),
	}
}

/**
 * List the filterable columns: repository metadata, each command run, then the
 * cleared runs that rules still read.
 */
export function getFilterColumns(
	runs: readonly CommandRun[],
	clearedRuns: readonly CommandRun[] = [],
): FilterColumn[] {
	const runColumn = (category: string) => (run: CommandRun) => ({
		category,
		header: `Run ${run.number}: ${run.command}`,
		id: run.id,
		kind: 'output' as const,
	})
	// A run being cleared can briefly be in both lists, and is listed once, as a column
	const columnIds = new Set(runs.map((run) => run.id))
	return [
		...repositoryColumns.map((column) => ({
			category: column.category,
			header: column.header,
			id: column.id,
			kind: getColumnKind(column),
		})),
		...runs.map(runColumn('Runs')),
		...clearedRuns.filter((run) => !columnIds.has(run.id)).map(runColumn('Cleared runs')),
	]
}

function parseNumber(text: string): number | undefined {
	const value = text.trim() === '' ? NaN : Number(text)
	return Number.isFinite(value) ? value : undefined
}

function parseDay(text: string): number | undefined {
	const [, year, month, day] = dayPattern.exec(text.trim())?.map(Number) ?? []
	if (year === undefined || month === undefined || day === undefined) {
		return undefined
	}

	const date = new Date(year, month - 1, day)
	return date.getMonth() === month - 1 ? date.getTime() : undefined
}

function parsePattern(text: string): RegExp | undefined {
	try {
		// eslint-disable-next-line require-unicode-regexp -- The `v` flag rejects familiar user-typed syntax such as `[\w-]`
		return text === '' ? undefined : new RegExp(text, 'imu')
	} catch {
		return undefined
	}
}

function subtractUnits(now: number, count: number, unit: DateUnit): number {
	const date = new Date(now)
	switch (unit) {
		case 'days': {
			date.setDate(date.getDate() - count)
			break
		}

		case 'months': {
			date.setMonth(date.getMonth() - count)
			break
		}

		case 'weeks': {
			date.setDate(date.getDate() - count * 7)
			break
		}

		case 'years': {
			date.setFullYear(date.getFullYear() - count)
			break
		}
	}

	return date.getTime()
}

function isEmptyValue(value: MetadataValue | undefined): boolean {
	return (
		value === undefined ||
		(typeof value === 'string' && value.trim() === '') ||
		(Array.isArray(value) && value.length === 0)
	)
}

/**
 * Read a column, noting whether an empty value is only empty because its
 * metadata group has not loaded yet.
 */
function readRepositoryValue(columnId: string, repository: Repository) {
	const column = columnsById.get(columnId)
	if (column === undefined) {
		return { pending: false, value: undefined }
	}

	// List cells join items into text, so read the items themselves
	const value =
		column.kind === 'list' && column.field !== undefined
			? repository.metadata?.values[column.field]
			: column.value(repository)
	const state = repository.metadata?.groups[column.group]
	const pending =
		isEmptyValue(value) &&
		(state === undefined || state.status === 'queued' || state.status === 'loading')
	return { pending, value }
}

function asBoolean(value: MetadataValue | undefined): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined
}

function asNumber(value: MetadataValue | undefined): number | undefined {
	return typeof value === 'number'
		? value
		: typeof value === 'string'
			? parseNumber(value)
			: undefined
}

function asDate(value: MetadataValue | undefined): number | undefined {
	const time = typeof value === 'string' ? Date.parse(value) : NaN
	return Number.isFinite(time) ? time : undefined
}

function asText(value: MetadataValue | undefined): string {
	return value === undefined ? '' : Array.isArray(value) ? value.join(', ') : String(value)
}

function asItems(value: MetadataValue | undefined): string[] {
	return value === undefined || value === '' ? [] : Array.isArray(value) ? value : [String(value)]
}

function emptiness<T>(operator: FilterOperator, isEmpty: Test<T>): Test<T> | undefined {
	return operator === 'isEmpty'
		? isEmpty
		: operator === 'isNotEmpty'
			? (value) => !isEmpty(value)
			: undefined
}

function compileText(operator: FilterOperator, operand: string): Test<string> | undefined {
	if (operator === 'matches') {
		const pattern = parsePattern(operand)
		return pattern === undefined ? undefined : (text) => pattern.test(text)
	}

	const test = textTests[operator]
	if (test === undefined) {
		return emptiness(operator, (text: string) => text.trim() === '')
	}

	const needle = operand.toLowerCase()
	return needle === '' ? undefined : (text) => test(text.toLowerCase(), needle)
}

function compileNumber(rule: FilterRule): Test<number | undefined> | undefined {
	const operand = parseNumber(rule.value)
	if (rule.operator === 'between') {
		const end = parseNumber(rule.end ?? '')
		if (operand === undefined || end === undefined) {
			return undefined
		}

		const low = Math.min(operand, end)
		const high = Math.max(operand, end)
		return (value) => value !== undefined && value >= low && value <= high
	}

	const test = numberTests[rule.operator]
	if (test === undefined) {
		return emptiness(rule.operator, (value: number | undefined) => value === undefined)
	}

	return operand === undefined ? undefined : (value) => value !== undefined && test(value, operand)
}

function compileDate(rule: FilterRule, now: number): Test<number | undefined> | undefined {
	if (rule.operator === 'before' || rule.operator === 'after') {
		const day = parseDay(rule.value)
		if (day === undefined) {
			return undefined
		}

		const nextDay = new Date(day)
		nextDay.setDate(nextDay.getDate() + 1)
		const after = nextDay.getTime()
		return rule.operator === 'before'
			? (value) => value !== undefined && value < day
			: (value) => value !== undefined && value >= after
	}

	if (rule.operator === 'inLast' || rule.operator === 'notInLast') {
		const count = parseNumber(rule.value)
		if (count === undefined || count < 0 || !Number.isInteger(count)) {
			return undefined
		}

		const threshold = subtractUnits(now, count, rule.unit ?? 'days')
		return rule.operator === 'inLast'
			? (value) => value !== undefined && value >= threshold
			: (value) => value !== undefined && value < threshold
	}

	return emptiness(rule.operator, (value: number | undefined) => value === undefined)
}

function compileList(rule: FilterRule): Test<string[]> | undefined {
	if (rule.operator === 'includes' || rule.operator === 'doesNotInclude') {
		const needle = rule.value.trim().toLowerCase()
		const includes = rule.operator === 'includes'
		return needle === ''
			? undefined
			: (items) => items.some((item) => item.toLowerCase() === needle) === includes
	}

	return emptiness(rule.operator, (items: string[]) => items.length === 0)
}

function compileAccount(rule: FilterRule, accounts: ReadonlySet<string>): Test<string> | undefined {
	if (rule.operator === 'isMe' || rule.operator === 'isNotMe') {
		const expected = rule.operator === 'isMe'
		return (account) => accounts.has(account.toLowerCase()) === expected
	}

	return compileText(rule.operator, rule.value)
}

function compilePeople(rule: FilterRule, names: ReadonlySet<string>): Test<string[]> | undefined {
	// Only you, under any of your names
	if (rule.operator === 'isMe') {
		return (items) => items.length > 0 && items.every((item) => names.has(item.toLowerCase()))
	}

	if (rule.operator === 'includesMe' || rule.operator === 'doesNotIncludeMe') {
		const expected = rule.operator === 'includesMe'
		return (items) => items.some((item) => names.has(item.toLowerCase())) === expected
	}

	return compileList(rule)
}

function lowercaseSet(names: readonly string[]): ReadonlySet<string> {
	return new Set(names.map((name) => name.toLowerCase()))
}

function compileBoolean(rule: FilterRule): Test<boolean | undefined> | undefined {
	if (rule.operator === 'isYes' || rule.operator === 'isNo') {
		const expected = rule.operator === 'isYes'
		return (value) => value === expected
	}

	return emptiness(rule.operator, (value: boolean | undefined) => value === undefined)
}

/**
 * Read a repository column for a compiled test, leaving rows whose value is
 * still loading undecided.
 */
function settled<T>(
	columnId: string,
	convert: (value: MetadataValue | undefined) => T,
	test: Test<T> | undefined,
): FilterPredicate | undefined {
	if (test === undefined) {
		return undefined
	}

	return (repository) => {
		const { pending, value } = readRepositoryValue(columnId, repository)
		return pending ? undefined : test(convert(value))
	}
}

function runStatus(run: CommandRun, repositoryId: string): RunStatus {
	const status = run.results[repositoryId]?.status
	return status === undefined ? 'notIncluded' : status === 'queued' ? 'running' : status
}

function compileOutput(rule: FilterRule, run: CommandRun): FilterPredicate | undefined {
	if (rule.operator === 'statusIs' || rule.operator === 'statusIsNot') {
		if (runStatuses.every((status) => status.value !== rule.value)) {
			return undefined
		}

		const expected = rule.operator === 'statusIs'
		return (repository) => (runStatus(run, repository.id) === rule.value) === expected
	}

	const test = compileText(rule.operator, rule.value)
	// Output is incomplete until the command finishes
	return test === undefined
		? undefined
		: (repository) =>
				runStatus(run, repository.id) === 'running'
					? undefined
					: test(run.results[repository.id]?.output ?? '')
}

function compileRule(rule: FilterRule, context: CompileContext): FilterPredicate | undefined {
	const run = context.runs.find((item) => item.id === rule.column)
	const column = columnsById.get(rule.column)
	const kind =
		run === undefined ? (column === undefined ? undefined : getColumnKind(column)) : 'output'
	if (kind === undefined || !getOperators(kind).includes(rule.operator)) {
		return undefined
	}

	switch (kind) {
		case 'account': {
			return settled(rule.column, asText, compileAccount(rule, context.accounts))
		}

		case 'boolean': {
			return settled(rule.column, asBoolean, compileBoolean(rule))
		}

		case 'date': {
			return settled(rule.column, asDate, compileDate(rule, context.now))
		}

		case 'list': {
			return settled(rule.column, asItems, compileList(rule))
		}

		case 'number': {
			return settled(rule.column, asNumber, compileNumber(rule))
		}

		case 'output': {
			return run === undefined ? undefined : compileOutput(rule, run)
		}

		case 'people': {
			return settled(rule.column, asItems, compilePeople(rule, context.authorNames))
		}

		case 'text': {
			return settled(rule.column, asText, compileText(rule.operator, rule.value))
		}
	}
}

function compileGroup(group: FilterGroup, context: CompileContext): FilterPredicate | undefined {
	const predicates = group.rules.flatMap(
		(node) =>
			(isFilterGroup(node) ? compileGroup(node, context) : compileRule(node, context)) ?? [],
	)
	if (predicates.length === 0) {
		return undefined
	}

	// Any row decided by one rule returns `decisive`; otherwise unknowns leave it undecided
	const settle =
		(decisive: boolean): FilterPredicate =>
		(repository) => {
			let unknown = false
			for (const predicate of predicates) {
				const result = predicate(repository)
				if (result === decisive) {
					return decisive
				}

				unknown ||= result === undefined
			}

			return unknown ? undefined : !decisive
		}

	switch (group.match) {
		case 'all': {
			return settle(false)
		}

		case 'any': {
			return settle(true)
		}

		case 'none': {
			const any = settle(true)
			return (repository) => {
				const result = any(repository)
				return result === undefined ? undefined : !result
			}
		}
	}
}

/**
 * Compile a filter for repeated evaluation across rows. Rules that are
 * incomplete, invalid, or reference a missing column are ignored, and a filter
 * with no remaining rules compiles to `undefined`.
 *
 * Unknown values follow three-valued logic: a rule on metadata that has not
 * loaded is neither true nor false, so negating it or combining it with Any
 * never decides a row prematurely.
 *
 * @param filter The root group.
 * @param runs Command runs whose output columns rules may reference.
 * @param identity Your GitHub accounts, which "is me" rules match, and author
 *   names, which "includes me" rules match.
 * @param now Reference time for relative date rules.
 */
export function compileFilter(
	filter: FilterGroup,
	runs: readonly CommandRun[],
	identity: ProjectIdentity,
	now = Date.now(),
): FilterPredicate | undefined {
	return compileGroup(filter, {
		accounts: lowercaseSet(identity.githubAccounts),
		authorNames: lowercaseSet(identity.authorNames),
		now,
		runs,
	})
}

/** Report whether a rule currently takes part in filtering. */
export function isRuleActive(rule: FilterRule, runs: readonly CommandRun[]): boolean {
	// Activity depends on the rule alone, not on whose names it would match
	const context = {
		accounts: new Set<string>(),
		authorNames: new Set<string>(),
		now: Date.now(),
		runs,
	}
	return compileRule(rule, context) !== undefined
}

function activeRules(group: FilterGroup, runs: readonly CommandRun[]): FilterRule[] {
	return group.rules.flatMap((node) =>
		isFilterGroup(node) ? activeRules(node, runs) : isRuleActive(node, runs) ? [node] : [],
	)
}

/** List the columns that rules reference, including blank and invalid rules. */
export function getRuleColumns(filter: FilterGroup): Set<string> {
	return new Set(
		filter.rules.flatMap((node) => (isFilterGroup(node) ? [...getRuleColumns(node)] : node.column)),
	)
}

/** Count the rules currently taking part in filtering. */
export function countActiveRules(filter: FilterGroup, runs: readonly CommandRun[]): number {
	return activeRules(filter, runs).length
}

/** List the metadata groups that active rules read. */
export function getFilterMetadataGroups(
	filter: FilterGroup,
	runs: readonly CommandRun[],
): MetadataGroup[] {
	return [
		...new Set(
			activeRules(filter, runs).flatMap((rule) => columnsById.get(rule.column)?.group ?? []),
		),
	]
}

/**
 * Drop rules on columns that no longer exist, such as deleted runs, along with
 * any nested groups left empty.
 */
export function pruneFilter(filter: FilterGroup, columnIds: readonly string[]): FilterGroup {
	return {
		match: filter.match,
		rules: filter.rules.flatMap((node): FilterNode[] => {
			if (!isFilterGroup(node)) {
				return columnIds.includes(node.column) ? [node] : []
			}

			const group = pruneFilter(node, columnIds)
			return group.rules.length > 0 ? [group] : []
		}),
	}
}

/**
 * Suggest values for a text or list rule from the loaded repositories, most
 * common first.
 */
export function getValueSuggestions(
	columnId: string,
	repositories: readonly Repository[],
	limit = 100,
): Array<{ count: number; value: string }> {
	const column = columnsById.get(columnId)
	if (column === undefined || (column.kind !== 'list' && column.kind !== 'text')) {
		return []
	}

	const counts = new Map<string, number>()
	for (const repository of repositories) {
		const { value } = readRepositoryValue(columnId, repository)
		const items = column.kind === 'list' ? asItems(value) : [asText(value)]
		for (const item of items) {
			if (item.trim() !== '' && item.length <= 200) {
				counts.set(item, (counts.get(item) ?? 0) + 1)
			}
		}
	}

	return Array.from(counts, ([value, count]) => ({ count, value }))
		.toSorted((a, b) => (a.count === b.count ? a.value.localeCompare(b.value) : b.count - a.count))
		.slice(0, limit)
}

function parseRule(record: Record<string, unknown>): FilterRule | undefined {
	const { column, end, operator, unit, value } = record
	if (
		typeof column !== 'string' ||
		typeof operator !== 'string' ||
		!Object.hasOwn(operandShapes, operator)
	) {
		return undefined
	}

	return {
		column,
		...(typeof end === 'string' && { end }),
		operator: operator as FilterOperator,
		...(dateUnits.includes(unit as DateUnit) && { unit: unit as DateUnit }),
		value: typeof value === 'string' ? value : '',
	}
}

function parseGroup(record: Record<string, unknown>, depth: number): FilterGroup {
	const rules = Array.isArray(record.rules) ? (record.rules as unknown[]) : []
	return {
		match:
			typeof record.match === 'string' && matchModes.has(record.match)
				? (record.match as FilterMatch)
				: 'all',
		rules: rules.flatMap((entry): FilterNode[] => {
			const child = asRecord(entry)
			if (child === undefined) {
				return []
			}

			if (!('rules' in child)) {
				const rule = parseRule(child)
				return rule === undefined ? [] : [rule]
			}

			return depth < maxDepth ? [parseGroup(child, depth + 1)] : []
		}),
	}
}

/**
 * Restore a filter from saved settings, dropping malformed rules. Output keys
 * follow a fixed order, so two equivalent filters serialize identically.
 */
export function parseFilter(value: unknown): FilterGroup {
	const record = asRecord(value)
	return record === undefined ? emptyFilter() : parseGroup(record, 0)
}
