import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnFor, moveToColumn } from '../src/lib/kanban.ts';
import { complete, parse } from '../src/lib/todo.ts';

test('Kanban reads existing tasks without requiring a migration', () => {
  assert.equal(columnFor('Unmarked task'), 'todo');
  assert.equal(columnFor('Work kanban:doing'), 'doing');
  assert.equal(columnFor('x 2026-11-04 Work kanban:doing'), 'done');
  assert.equal(columnFor('Custom kanban:waiting custom:keep'), 'todo');
  assert.deepEqual(moveToColumn('Custom kanban:waiting custom:keep', 'todo'), ['Custom kanban:waiting custom:keep']);
});

test('column transitions retain priority, dates, tags and unknown tokens', () => {
  const original = '(A) 2026-11-01 Work  +project @home custom:value malformed::value';
  const [doing] = moveToColumn(original, 'doing');
  assert.equal(doing, original + ' kanban:doing');
  const [done] = moveToColumn(doing, 'done', '2026-11-04');
  assert.equal(done, 'x 2026-11-04 ' + doing);
  assert.deepEqual(moveToColumn(done, 'done'), [done]);
  const [todo] = moveToColumn(done, 'todo');
  assert.equal(todo, original + ' kanban:todo');
  assert.equal(columnFor(todo), 'todo');
  assert.equal(moveToColumn('kanban:doing', 'todo')[0], 'kanban:todo');
});

test('recurring completion from the board or list starts the successor in To do', () => {
  const raw = '(B) Work kanban:doing due:2026-11-04 rec:1w custom:keep';
  for (const result of [moveToColumn(raw, 'done', '2026-11-04'), complete(raw, '2026-11-04')]) {
    assert.equal(result.length, 2);
    assert.equal(columnFor(result[0]), 'done');
    assert.equal(columnFor(result[1]), 'todo');
    assert.equal(parse(result[1]).metadata.due, '2026-11-11');
    assert.equal(parse(result[1]).metadata.custom, 'keep');
  }
});
