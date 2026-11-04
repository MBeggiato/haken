import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse,serialize,setDescription,setPriority,setTokens,complete,incomplete,addInterval,natural,matches} from '../src/lib/todo.ts';
test('lossless round trip including unusual whitespace and malformed extensions',()=>{
  for(const raw of ['', '(A) 2026-01-01 Call Mom +Family +Care @phone @home due:2026-02-01 custom:value bad::value', 'x 2026-01-05 2026-01-01 completed', 'x task without dates', '  space\tand  more  ', '(b) not priority', 'mail@example.com C++', 'x 2026-01-01 (A) 2025-01-01 task']) assert.equal(serialize(parse(raw)),raw);
});
test('parses priorities, dates, projects, contexts and unknown metadata',()=>{
  const t=parse('(A) 2026-01-01 task +one +two @home @phone due:2026-02-01 custom:value bad::value');
  assert.equal(t.priority,'A');assert.equal(t.created,'2026-01-01');assert.deepEqual(t.projects,['one','two']);assert.deepEqual(t.contexts,['home','phone']);assert.equal(t.metadata.custom,'value');assert.equal(t.metadata.bad,undefined);
  assert.equal(parse('x 2026-02-01 2026-01-01 work').finished,'2026-02-01');
  assert.equal(parse('x 2026-02-01 2026-01-01 work').created,'2026-01-01');
  for(const raw of ['(b) no','(A)->no','task (A)']) assert.equal(parse(raw).priority,'');
  assert.deepEqual(parse('@home +one').contexts,['home']);
});
test('edits preserve unrelated metadata, spacing and dates',()=>{
  const raw='(B) 2026-01-01 Task  custom:value due:2026-02-01 +one';
  assert.equal(setPriority(raw,'A'),raw.replace('(B)','(A)'));
  assert.equal(setPriority(raw,''),raw.slice(4));
  assert.throws(()=>setPriority(raw,'a'));
  assert.equal(setTokens(raw,'due',['2026-03-01']),'(B) 2026-01-01 Task  custom:value +one due:2026-03-01');
  assert.equal(setTokens(raw,'+',[]),'(B) 2026-01-01 Task  custom:value due:2026-02-01');
  assert.equal(setPriority('x 2026-01-01 (A) task','B'),'x 2026-01-01 (B) task');
});
test('completion and reopening retain priority, creation date and arbitrary metadata',()=>{
  const raw='(A) 2026-01-01 Task id:123';const done=complete(raw,'2026-01-05');
  assert.deepEqual(done,['x 2026-01-05 '+raw]);assert.equal(incomplete(done[0]),raw);assert.deepEqual(complete(done[0]),done);
});
test('recurrence calendar arithmetic clamps month ends and leap years',()=>{
  assert.equal(addInterval('2024-01-31',1,'m'),'2024-02-29');
  assert.equal(addInterval('2024-02-29',1,'y'),'2025-02-28');
  assert.equal(addInterval('2026-01-30',1,'b'),'2026-02-02');
  assert.equal(addInterval('2026-02-02',-1,'b'),'2026-01-30');
  assert.equal(addInterval('2026-01-01',2,'w'),'2026-01-15');
  assert.equal(addInterval('2026-01-01',2,'d'),'2026-01-03');
  assert.throws(()=>addInterval('2026-02-30',1,'m'));assert.throws(()=>addInterval('2026-01-01',1000000,'b'));
});
test('strict and relative recurrence, missing due date and threshold shift',()=>{
  const strict=parse(complete('2026-01-01 Rent rec:+1m due:2026-01-31 t:2026-01-28 custom:yes','2026-02-10')[1]);
  assert.equal(strict.metadata.due,'2026-02-28');assert.equal(strict.metadata.t,'2026-02-25');assert.equal(strict.created,'2026-02-10');assert.equal(strict.metadata.custom,'yes');
  assert.equal(parse(complete('Review rec:1w due:2026-01-01','2026-02-10')[1]).metadata.due,'2026-02-17');
  assert.equal(parse(complete('Review rec:+1w','2026-02-10')[1]).metadata.due,'2026-02-17');
  assert.equal(complete('Review rec:invalid','2026-02-10').length,1);
});
test('deterministic natural-language preview and relative search',()=>{
  assert.equal(natural('Buy milk tomorrow','2026-01-01'),'Buy milk due:2026-01-02');
  assert.equal(natural('Pay rent every month on the first','2026-01-15'),'Pay rent rec:+1m due:2026-02-01');
  assert.equal(natural('Call dentist next Friday','2026-01-01'),'Call dentist due:2026-01-02');
  assert.equal(natural('Review report high priority','2026-01-01'),'(A) Review report');
  assert.ok(matches('Task +home due:2026-01-07','+home due:+1w','2026-01-01'));
  assert.ok(!matches('Task due:2026-01-07','due:-3d','2026-01-01'));
});

test('structured descriptions preserve prefixes and every extension',()=>{
  assert.equal(setDescription('(A) 2026-01-01 Old task +one @home custom:value rec:+1m','New task'),'(A) 2026-01-01 New task +one @home custom:value rec:+1m');
  assert.throws(()=>setDescription('Task','Bad\nline'));
});
