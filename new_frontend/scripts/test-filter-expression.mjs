/**
 * Tests for the boolean tag-filter parser that replaced the previous
 * `Function("return (" + expr + ")")` evaluator.
 *
 *   npm run test
 *
 * TypeScript is transpiled on the fly with the already-installed compiler, so this
 * needs no extra tooling.
 */
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../lib/filter-expression.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})

// Imported as a data URL so the test needs no writable temp directory.
const { parseFilterExpression, evaluateFilterNode, validateFilterExpression } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

/** Evaluates `expression` against a repo carrying `tags`. */
const matches = (expression, tags) => {
  const node = parseFilterExpression(expression)
  return node === null ? true : evaluateFilterNode(node, new Set(tags.map((t) => t.toLowerCase())))
}

test('single tag', () => {
  assert.equal(matches('react', ['react', 'ui']), true)
  assert.equal(matches('react', ['vue']), false)
})

test('is case-insensitive', () => {
  assert.equal(matches('React', ['react']), true)
  assert.equal(matches('react', ['REACT']), true)
})

test('AND / OR / NOT', () => {
  assert.equal(matches('react AND ui', ['react', 'ui']), true)
  assert.equal(matches('react AND ui', ['react']), false)
  assert.equal(matches('react OR vue', ['vue']), true)
  assert.equal(matches('NOT deprecated', ['react']), true)
  assert.equal(matches('NOT deprecated', ['deprecated']), false)
})

test('parentheses override precedence', () => {
  assert.equal(matches('(react OR vue) AND typescript', ['vue', 'typescript']), true)
  assert.equal(matches('(react OR vue) AND typescript', ['vue']), false)
  // Without parentheses AND binds tighter than OR.
  assert.equal(matches('react OR vue AND typescript', ['react']), true)
})

test('adjacent operands mean AND', () => {
  assert.equal(matches('react typescript', ['react', 'typescript']), true)
  assert.equal(matches('react typescript', ['react']), false)
})

// The old implementation tokenized with /\b[a-z0-9-_]+\b/, so a dot split the tag in
// two and the expression could never match.
test('matches tags containing a dot', () => {
  assert.equal(matches('node.js', ['node.js']), true)
  assert.equal(matches('socket.io AND node.js', ['socket.io', 'node.js']), true)
  assert.equal(matches('node.js', ['node']), false)
})

// The old implementation substituted tag names into the expression string one at a
// time, so a tag that was a prefix of another corrupted the result.
test('does not confuse a tag with a longer tag sharing its prefix', () => {
  assert.equal(matches('web', ['web-tools']), false)
  assert.equal(matches('web-tools', ['web-tools']), true)
  assert.equal(matches('in-use AND in-used', ['in-use']), false)
})

test('quoted tags allow spaces and parentheses', () => {
  assert.equal(matches('"machine learning"', ['machine learning']), true)
  assert.equal(matches("'a b' OR c", ['c']), true)
})

test('symbolic operators', () => {
  assert.equal(matches('react && ui', ['react', 'ui']), true)
  assert.equal(matches('react || vue', ['vue']), true)
  assert.equal(matches('!deprecated', ['react']), true)
})

test('does not evaluate arbitrary JavaScript', () => {
  // Previously this reached Function() and would have thrown or executed.
  const node = parseFilterExpression('process')
  assert.deepEqual(node, { type: 'tag', value: 'process' })
  assert.equal(evaluateFilterNode(node, new Set(['react'])), false)
})

test('reports malformed expressions instead of silently matching everything', () => {
  assert.ok(validateFilterExpression('(react'))
  assert.ok(validateFilterExpression('react AND'))
  assert.ok(validateFilterExpression('"unclosed'))
  assert.ok(validateFilterExpression(')'))
  assert.equal(validateFilterExpression('(react OR vue) AND NOT old'), null)
})

test('empty expression parses to null', () => {
  assert.equal(parseFilterExpression('   '), null)
})
