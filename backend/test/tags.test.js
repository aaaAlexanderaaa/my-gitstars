/**
 * Unit tests for the server-side tag validation used by every tag endpoint.
 *
 *   node --test test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// normalizeTags is module-private in routes/repos.js, so exercise it through the
// exported helper the router attaches for testing.
const { normalizeTags } = require('../src/lib/tags');

test('accepts a single tag', () => {
  assert.deepEqual(normalizeTags('tools'), { tags: ['tools'] });
});

test('splits on whitespace and commas', () => {
  assert.deepEqual(normalizeTags('tools cli, rust'), { tags: ['tools', 'cli', 'rust'] });
});

test('accepts an array', () => {
  assert.deepEqual(normalizeTags(['a', 'b']), { tags: ['a', 'b'] });
});

test('de-duplicates', () => {
  assert.deepEqual(normalizeTags('a a b'), { tags: ['a', 'b'] });
});

test('allows dots, hyphens and underscores', () => {
  assert.deepEqual(normalizeTags('node.js  socket-io  my_tag'), {
    tags: ['node.js', 'socket-io', 'my_tag']
  });
});

test('rejects characters that are not word-ish', () => {
  for (const bad of ['<script>', 'a/b', 'a:b', 'a b!', '"quoted"']) {
    assert.ok(normalizeTags(bad).error, `expected "${bad}" to be rejected`);
  }
});

test('rejects an over-long tag', () => {
  assert.ok(normalizeTags('x'.repeat(51)).error);
  assert.deepEqual(normalizeTags('x'.repeat(50)), { tags: ['x'.repeat(50)] });
});

test('rejects non-string input', () => {
  for (const bad of [null, undefined, 42, {}, [1]]) {
    assert.ok(normalizeTags(bad).error, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test('rejects whitespace-only input', () => {
  assert.ok(normalizeTags('   ').error);
  assert.ok(normalizeTags([]).error);
});
