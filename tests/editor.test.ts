import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editField } from '../src/lib/editor.ts';
import { parse } from '../src/lib/todo.ts';

test('editor reschedules from due date or today with validation and removal', () => {
  const raw = '(A) 2026-01-01 Review  custom:keep due:2026-01-31';
  assert.equal(parse(editField(raw, 'due', '+1m', '2026-01-05')).metadata.due, '2026-02-28');
  assert.equal(parse(editField('Task', 'due', '+1w', '2026-01-05')).metadata.due, '2026-01-12');
  assert.equal(parse(editField(raw, 'due', 'tomorrow', '2026-01-05')).metadata.due, '2026-01-06');
  assert.equal(parse(editField(raw, 'due', 'today', '2026-01-05')).metadata.due, '2026-01-05');
  assert.equal(parse(editField(raw, 'due', '-1d')).metadata.due, '2026-01-30');
  assert.equal(editField(raw, 'due', '-'), '(A) 2026-01-01 Review  custom:keep');
  assert.throws(() => editField(raw, 'due', '2026-02-30'), /Use YYYY-MM-DD/);
  assert.throws(() => editField(raw, 'due', 'next nonsense'));
});

test('editor priority and multi-tag changes preserve other metadata and completion', () => {
  const raw = 'x 2026-01-05 (B) 2026-01-01 Review  +old @phone custom:keep malformed::value';
  assert.equal(editField(raw, 'priority', 'a'), raw.replace('(B)', '(A)'));
  assert.equal(parse(editField(raw, 'priority', '-')).priority, '');
  assert.throws(() => editField(raw, 'priority', 'AB'));
  const projects = editField(raw, 'projects', '+new work new');
  assert.deepEqual(parse(projects).projects, ['new', 'work']);
  assert.ok(projects.includes('Review @phone custom:keep malformed::value'));
  assert.deepEqual(parse(editField(projects, 'contexts', 'home @desk')).contexts, ['home', 'desk']);
  assert.deepEqual(parse(editField(projects, 'projects', '')).projects, []);
  assert.throws(() => editField(raw, 'contexts', '@'));
});
