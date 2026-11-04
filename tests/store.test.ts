import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {Store} from '../server/store.ts';
import {Notes} from '../server/notes.ts';
import type {Action} from '../src/lib/types.ts';
mkdirSync('.test-data',{recursive:true});
function fixture(){const dir=mkdtempSync(resolve('.test-data','store-'));const paths={todo:resolve(dir,'todo.txt'),done:resolve(dir,'done.txt'),inbox:resolve(dir,'inbox.txt')};const store=new Store(paths);return{dir,paths,store,apply:(a:Action)=>store.apply(store.snapshot().revision,a),cleanup:()=>rmSync(dir,{recursive:true,force:true})};}
test('creates empty files, persists edits and preserves CRLF, blank lines and no final newline',()=>{
  const f=fixture();try{assert.equal(f.store.snapshot().files.todo.length,0);writeFileSync(f.paths.todo,'First  custom:keep\r\n\r\nSecond');f.apply({type:'edit',ids:[2],raw:'Changed'});assert.equal(readFileSync(f.paths.todo,'utf8'),'First  custom:keep\r\n\r\nChanged');f.apply({type:'add',raw:'Third'});assert.equal(readFileSync(f.paths.todo,'utf8'),'First  custom:keep\r\n\r\nChanged\r\nThird\r\n');}finally{f.cleanup();}
});
test('external changes reject stale edits and clear unsafe undo',()=>{
  const f=fixture();try{f.apply({type:'add',raw:'Original'});const old=f.store.snapshot();writeFileSync(f.paths.todo,'External\n');assert.throws(()=>f.store.apply(old.revision,{type:'edit',ids:[0],raw:'Lost'}),/Files changed/);assert.equal(readFileSync(f.paths.todo,'utf8'),'External\n');assert.equal(f.store.snapshot().undo,0);}finally{f.cleanup();}
});
test('archive, restore, inbox import and undo span both files',()=>{
  const f=fixture();try{f.apply({type:'add',raw:'Work'});f.apply({type:'add',raw:'x 2026-01-01 Finished custom:keep'});f.apply({type:'archive'});assert.equal(f.store.snapshot().files.todo.length,1);assert.equal(f.store.snapshot().files.done[0].raw,'x 2026-01-01 Finished custom:keep');f.apply({type:'undo'});assert.equal(f.store.snapshot().files.todo.length,2);assert.equal(readFileSync(f.paths.done,'utf8'),'');f.apply({type:'archive'});f.apply({type:'restore',file:'done',ids:[0]});assert.equal(f.store.snapshot().files.todo[1].raw,'Finished custom:keep');f.apply({type:'add',file:'inbox',raw:'Capture'});f.apply({type:'import',file:'inbox',ids:[0]});assert.equal(f.store.snapshot().files.inbox.length,0);assert.equal(f.store.snapshot().files.todo.at(-1)!.raw,'Capture');}finally{f.cleanup();}
});
test('bulk complete, recurrence, duplicate, reorder, delete and 50-level undo',()=>{
  const f=fixture();try{f.apply({type:'add',raw:'First rec:1d'});f.apply({type:'add',raw:'Second'});f.apply({type:'complete',ids:[0,1]});assert.equal(f.store.snapshot().files.todo.length,3);f.apply({type:'duplicate',ids:[1]});assert.equal(f.store.snapshot().files.todo.at(-1)!.raw,'Second');f.apply({type:'move',ids:[3],direction:-1});assert.equal(f.store.snapshot().files.todo[2].raw,'Second');f.apply({type:'delete',ids:[0,1]});assert.equal(f.store.snapshot().files.todo.length,2);for(let i=0;i<55;i++)f.apply({type:'add',raw:'Task '+i});assert.equal(f.store.snapshot().undo,50);for(let i=0;i<50;i++)f.apply({type:'undo'});assert.equal(f.store.snapshot().undo,0);}finally{f.cleanup();}
});
test('rejects invalid input and recovers by refusing an interrupted transaction',()=>{
  const f=fixture();try{assert.throws(()=>f.apply({type:'add',raw:'bad\nline'}));assert.throws(()=>f.apply({type:'edit',raw:'No',ids:[100]}));assert.throws(()=>new Store({...f.paths,done:f.paths.todo}));writeFileSync(f.paths.todo+'.transaction.json','{}');assert.throws(()=>new Store(f.paths),/Interrupted transaction/);}finally{f.cleanup();}
});
test('notes enforce containment and revision checks including symlink escape',()=>{
  const f=fixture();try{const notes=new Notes(resolve(f.dir,'notes'));const initial=notes.read('project/plan.md');notes.save('project/plan.md','# Plan',initial.revision);assert.equal(notes.read('project/plan.md').text,'# Plan');assert.throws(()=>notes.save('project/plan.md','stale',initial.revision),/changed/);assert.throws(()=>notes.read('../todo.txt'));assert.throws(()=>notes.read('../escape.md'));assert.throws(()=>notes.read('/absolute.md'));symlinkSync(f.dir,resolve(f.dir,'notes','escape'));assert.throws(()=>notes.save('escape/test.md','x',''),/symlink/);assert.ok(!existsSync(resolve(f.dir,'test.md')));}finally{f.cleanup();}
});

test('Kanban moves persist, undo atomically and preserve unrelated lines', () => {
  const f = fixture();
  try {
    const original = '(A) Work custom:keep\r\n\r\nUnrelated  task';
    writeFileSync(f.paths.todo, original);
    f.apply({type:'kanban', ids:[0], column:'doing'});
    assert.equal(readFileSync(f.paths.todo, 'utf8'), '(A) Work custom:keep kanban:doing\r\n\r\nUnrelated  task');
    f.apply({type:'undo'});
    assert.equal(readFileSync(f.paths.todo, 'utf8'), original);
    f.apply({type:'edit', ids:[0], raw:'Work rec:1w kanban:doing'});
    const before = readFileSync(f.paths.todo, 'utf8');
    f.apply({type:'kanban', ids:[0], column:'done'});
    assert.equal(f.store.snapshot().files.todo.length, 3);
    assert.ok(f.store.snapshot().files.todo[0].raw.startsWith('x '));
    f.apply({type:'undo'});
    assert.equal(readFileSync(f.paths.todo, 'utf8'), before);
  } finally { f.cleanup(); }
});

test('Kanban rejects stale drags, invalid columns and archive/inbox mutations', () => {
  const f = fixture();
  try {
    f.apply({type:'add', raw:'Work'});
    assert.throws(() => f.apply({type:'kanban', ids:[0], column:'invalid' as never}), /valid Kanban column/);
    assert.throws(() => f.apply({type:'kanban', ids:[], column:'doing'}), /valid Kanban column/);
    f.apply({type:'add', file:'done', raw:'x 2026-11-04 Archived'});
    assert.throws(() => f.apply({type:'kanban', file:'done', ids:[0], column:'todo'}), /main-file tasks/);
    f.apply({type:'add', file:'inbox', raw:'Captured'});
    assert.throws(() => f.apply({type:'kanban', file:'inbox', ids:[0], column:'doing'}), /main-file tasks/);
    const draggedRevision = f.store.snapshot().revision;
    writeFileSync(f.paths.todo, 'External edit\nWork\n');
    assert.throws(() => f.store.apply(draggedRevision, {type:'kanban', ids:[0], column:'done'}), /Files changed/);
    assert.equal(readFileSync(f.paths.todo, 'utf8'), 'External edit\nWork\n');
  } finally { f.cleanup(); }
});
