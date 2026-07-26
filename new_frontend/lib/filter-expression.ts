/**
 * Boolean tag-filter expressions, e.g. `(react OR vue) AND NOT deprecated`.
 *
 * Replaces the previous implementation, which string-replaced tag names with
 * "true"/"false" and handed the result to `Function()`. That approach:
 *   - executed arbitrary user text as JavaScript,
 *   - could not match a tag containing a dot (`node.js`, `socket.io`) because the
 *     tokenizer used `\b[a-z0-9-_]+\b`,
 *   - corrupted tags that were prefixes of other tags, since replacements ran in
 *     sequence over already-substituted text.
 *
 * This parser tokenizes first and never evaluates code.
 */

export type FilterNode =
  | { type: 'tag'; value: string }
  | { type: 'not'; operand: FilterNode }
  | { type: 'and'; left: FilterNode; right: FilterNode }
  | { type: 'or'; left: FilterNode; right: FilterNode }

type Token =
  | { kind: 'tag'; value: string }
  | { kind: 'and' | 'or' | 'not' | '(' | ')' }

export class FilterExpressionError extends Error {}

// Word forms only. `-` is deliberately NOT an alias for NOT: it is a perfectly normal
// character inside a tag (`web-tools`, `in-use`), and treating a leading hyphen as
// negation would make those unmatchable.
const KEYWORDS: Record<string, 'and' | 'or' | 'not'> = {
  and: 'and',
  or: 'or',
  not: 'not',
}

// Symbolic operators are their own tokens, so `!deprecated` scans as NOT + tag rather
// than as one tag literally named "!deprecated".
const OPERATOR_CHARS = '!&|'
const TERMINATORS = /[\s()"'!&|]/

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const char = input[i]

    if (/\s/.test(char)) {
      i++
      continue
    }

    if (char === '(' || char === ')') {
      tokens.push({ kind: char })
      i++
      continue
    }

    if (OPERATOR_CHARS.includes(char)) {
      const doubled = input[i + 1] === char
      if (char === '!') {
        tokens.push({ kind: 'not' })
      } else {
        tokens.push({ kind: char === '&' ? 'and' : 'or' })
      }
      i += doubled ? 2 : 1
      continue
    }

    // Quoted tags let users match values containing spaces or parentheses.
    if (char === '"' || char === "'") {
      const end = input.indexOf(char, i + 1)
      if (end === -1) throw new FilterExpressionError(`Unclosed ${char} quote`)
      const value = input.slice(i + 1, end).trim().toLowerCase()
      if (value) tokens.push({ kind: 'tag', value })
      i = end + 1
      continue
    }

    // Bare word: everything up to whitespace, a paren, a quote or an operator.
    let end = i
    while (end < input.length && !TERMINATORS.test(input[end])) end++
    const word = input.slice(i, end)
    i = end

    const keyword = KEYWORDS[word.toLowerCase()]
    if (keyword) {
      tokens.push({ kind: keyword })
    } else {
      tokens.push({ kind: 'tag', value: word.toLowerCase() })
    }
  }

  return tokens
}

/**
 * expression := term (OR term)*
 * term       := factor (AND? factor)*   -- adjacent factors imply AND
 * factor     := NOT factor | '(' expression ')' | tag
 */
export function parseFilterExpression(input: string): FilterNode | null {
  const tokens = tokenize(input)
  if (tokens.length === 0) return null

  let pos = 0
  const peek = () => tokens[pos]

  function parseExpression(): FilterNode {
    let node = parseTerm()
    while (peek()?.kind === 'or') {
      pos++
      node = { type: 'or', left: node, right: parseTerm() }
    }
    return node
  }

  function parseTerm(): FilterNode {
    let node = parseFactor()
    for (;;) {
      const token = peek()
      if (!token) break
      if (token.kind === 'and') {
        pos++
        node = { type: 'and', left: node, right: parseFactor() }
        continue
      }
      // Implicit AND between adjacent operands: `react typescript`.
      if (token.kind === 'tag' || token.kind === 'not' || token.kind === '(') {
        node = { type: 'and', left: node, right: parseFactor() }
        continue
      }
      break
    }
    return node
  }

  function parseFactor(): FilterNode {
    const token = peek()
    if (!token) throw new FilterExpressionError('Unexpected end of expression')

    if (token.kind === 'not') {
      pos++
      return { type: 'not', operand: parseFactor() }
    }

    if (token.kind === '(') {
      pos++
      const node = parseExpression()
      if (peek()?.kind !== ')') throw new FilterExpressionError('Missing closing parenthesis')
      pos++
      return node
    }

    if (token.kind === 'tag') {
      pos++
      return { type: 'tag', value: token.value }
    }

    throw new FilterExpressionError(`Unexpected "${token.kind}"`)
  }

  const node = parseExpression()
  if (pos < tokens.length) {
    const rest = tokens[pos]
    throw new FilterExpressionError(`Unexpected "${rest.kind === 'tag' ? rest.value : rest.kind}"`)
  }
  return node
}

export function evaluateFilterNode(node: FilterNode, tags: ReadonlySet<string>): boolean {
  switch (node.type) {
    case 'tag':
      return tags.has(node.value)
    case 'not':
      return !evaluateFilterNode(node.operand, tags)
    case 'and':
      return evaluateFilterNode(node.left, tags) && evaluateFilterNode(node.right, tags)
    case 'or':
      return evaluateFilterNode(node.left, tags) || evaluateFilterNode(node.right, tags)
  }
}

/** Returns null when the expression is valid, otherwise a human-readable reason. */
export function validateFilterExpression(input: string): string | null {
  try {
    const node = parseFilterExpression(input)
    return node === null ? 'Expression is empty' : null
  } catch (error) {
    return error instanceof FilterExpressionError ? error.message : 'Invalid expression'
  }
}
