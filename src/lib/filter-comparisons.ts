import type { FilterColumn, FilterKind, FilterRule } from './row-filter.js'

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
	hasDiverged: 'none',
	includes: 'text',
	includesMe: 'none',
	inLast: 'duration',
	is: 'text',
	isEmpty: 'none',
	isGithub: 'none',
	isMe: 'none',
	isNo: 'none',
	isNot: 'text',
	isNotEmpty: 'none',
	isNotMe: 'none',
	isYes: 'none',
	lessThan: 'number',
	matches: 'text',
	notInLast: 'duration',
	notScanned: 'none',
	on: 'date',
	startsWith: 'text',
	statusIs: 'status',
	statusIsNot: 'status',
} as const satisfies Record<string, OperandShape>

/** Every comparison a rule can make; each column kind offers a subset. */
export type FilterOperator = keyof typeof operandShapes

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
	date: ['inLast', 'notInLast', 'on', 'before', 'after', 'isEmpty', 'isNotEmpty'],
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
	hasDiverged: 'has diverged',
	includes: 'includes',
	includesMe: 'includes me',
	inLast: 'is within the last',
	is: 'is',
	isEmpty: 'is empty',
	isGithub: 'is on GitHub',
	isMe: 'is me',
	isNo: 'is No',
	isNot: 'is not',
	isNotEmpty: 'is not empty',
	isNotMe: 'is not me',
	isYes: 'is Yes',
	lessThan: 'is less than',
	matches: 'matches pattern',
	notInLast: 'is not within the last',
	notScanned: 'not scanned',
	on: 'is on',
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
	if (kind === 'account') {
		if (operator === 'isMe') {
			return 'is mine'
		}

		if (operator === 'isNotMe') {
			return 'is not mine'
		}
	}

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

/** A menu comparison can supply a fixed operand for an ordinary saved rule. */
export type FilterComparison = {
	label?: string
	operator: FilterOperator
	value?: string
}

function countComparisons(positive: string, zero?: string): FilterComparison[] {
	const choices: FilterComparison[] = [{ label: positive, operator: 'greaterThan', value: '0' }]
	if (zero !== undefined) {
		choices.push({ label: zero, operator: 'is', value: '0' })
	}

	return choices
}

const columnComparisons = new Map<string, FilterComparison[]>([
	['ahead', countComparisons('has commits to push')],
	['behind', countComparisons('has commits to pull')],
	['changedFiles', countComparisons('is dirty', 'is clean')],
	[
		'metadata:Actions Failed Count',
		countComparisons('has failed workflows', 'has no failed workflows'),
	],
	['metadata:Issues Open', countComparisons('has open issues', 'has no open issues')],
	['metadata:PRs Open', countComparisons('has open PRs', 'has no open PRs')],
	[
		'metadata:Total Updates',
		[...countComparisons('has updates', 'has no updates'), { operator: 'notScanned' }],
	],
	['metadata:Vulnerability Alerts', countComparisons('has alerts', 'has no alerts')],
	[
		'remote',
		[
			{ label: 'has origin', operator: 'isNotEmpty' },
			{ label: 'has no origin', operator: 'isEmpty' },
			{ operator: 'isGithub' },
		],
	],
	[
		'sync',
		[
			{ label: 'is in sync', operator: 'is', value: '0' },
			{ label: 'is out of sync', operator: 'greaterThan', value: '0' },
			{ operator: 'hasDiverged' },
		],
	],
	...['Major', 'Minor', 'Patch'].map((level): [string, FilterComparison[]] => [
		`metadata:${level} Updates`,
		countComparisons(`has ${level.toLowerCase()} updates`, `has no ${level.toLowerCase()} updates`),
	]),
])

/** Validate a saved operator before interpreting it. */
export function isFilterOperator(value: unknown): value is FilterOperator {
	return typeof value === 'string' && Object.hasOwn(operandShapes, value)
}

/** Whether the column can evaluate an operator, including saved bounds. */
export function supportsOperator(id: string, kind: FilterKind, operator: FilterOperator): boolean {
	return (
		getOperators(kind).includes(operator) ||
		columnComparisons.get(id)?.some((entry) => entry.operator === operator) === true
	)
}

/** List helpers first and include any legacy bound used by this rule. */
export function getComparisons(
	id: string,
	kind: FilterKind,
	current?: FilterOperator,
): FilterComparison[] {
	const preferred = columnComparisons.get(id) ?? []
	const ordinary = getOperators(kind).filter(
		(operator) =>
			(operator === current || (operator !== 'atLeast' && operator !== 'atMost')) &&
			preferred.every((entry) => entry.operator !== operator || entry.value !== undefined),
	)
	return [...preferred, ...ordinary.map((operator) => ({ operator }))]
}

/** Identify the fixed or editable menu choice independently of its label. */
export function comparisonKey(choice: FilterComparison): string {
	return choice.value === undefined ? choice.operator : `${choice.operator}:${choice.value}`
}

/** Recognize a saved helper unless its operand is being edited. */
export function selectedComparison(
	choices: FilterComparison[],
	rule: FilterRule,
	editingOperand: boolean,
): FilterComparison {
	return (
		choices.find(
			(choice) =>
				choice.operator === rule.operator &&
				(choice.value === undefined || (!editingOperand && choice.value === rule.value)),
		) ?? { operator: rule.operator }
	)
}

/** Start a rule on a column with its first comparison. */
export function createRule(column: FilterColumn): FilterRule {
	const first: FilterComparison = columnComparisons.get(column.id)?.[0] ?? {
		operator: operatorsByKind[column.kind][0],
	}
	const { operator, value } = first
	return {
		column: column.id,
		operator,
		value: value ?? (operandShapes[operator] === 'status' ? 'failed' : ''),
	}
}

/**
 * Point a rule at another column, keeping its operator and value only when the
 * new column's kind offers that operator with the same kind of value.
 */
export function retargetRule(rule: FilterRule, from: FilterKind, to: FilterColumn): FilterRule {
	return (rule.value !== '' || getOperandShape(from, rule.operator) === 'none') &&
		supportsOperator(to.id, to.kind, rule.operator) &&
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
