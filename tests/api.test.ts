import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Snapshot} from '../src/lib/types.ts';
mkdirSync('.test-data',{recursive:true});
test('HTTP API authenticates, rejects stale and invalid writes, and hides task files',async()=>{
  const dir=mkdtempSync(resolve('.test-data','api-'));
  const port=35000+Math.floor(Math.random()*10000),token='test-token-not-a-real-secret-12345';
  const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,TODO_DIR:dir,TODO_FILE:resolve(dir,'todo.txt'),DONE_FILE:resolve(dir,'done.txt'),INBOX_FILE:resolve(dir,'inbox.txt'),NOTES_DIR:resolve(dir,'notes'),PORT:String(port),ACCESS_TOKEN:token,HOST:'127.0.0.1',NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
  const base=`http://127.0.0.1:${port}`;
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  try{
    for(let i=0;i<150&&!logs.includes('Haken:');i++){if(child.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,100));}
    assert.ok(logs.includes('Haken:'),logs);
    assert.equal((await fetch(base+'/api/state')).status,401);
    const initial=await (await fetch(base+'/api/state',{headers})).json() as Snapshot;
    const write=(data:unknown,extra:Record<string,string>={})=>fetch(base+'/api/action',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)});
    const added=await write({revision:initial.revision,action:{type:'add',raw:'Private API task custom:keep'}});assert.equal(added.status,200);
    assert.equal(readFileSync(resolve(dir,'todo.txt'),'utf8'),'Private API task custom:keep\n');
    assert.equal((await write({revision:initial.revision,action:{type:'add',raw:'Stale'}})).status,409);
    const current=await added.json() as Snapshot;
    assert.equal((await write({revision:current.revision,action:{type:'add',raw:'Bad\nline'}})).status,400);
    assert.equal((await write({revision:current.revision,action:{type:'add',raw:'Cross origin'}},{Origin:'https://evil.example'})).status,403);
    const note=await fetch(base+'/api/note?path=../../escape.md',{headers});assert.equal(note.status,403);
    for(const path of [`/@fs${dir}/todo.txt`,`/@fs${dir}/todo.txt?raw`, `/${dir.split('/').slice(-2).join('/')}/todo.txt`]){
      const response=await fetch(base+path);assert.ok(!(await response.text()).includes('Private API task'),`Leaked ${path}`);
    }
    assert.ok((await (await fetch(base+'/')).text()).includes('src/main.ts'));
  }finally{child.kill('SIGTERM');await new Promise<void>(r=>{if(child.exitCode!==null)r();else child.on('exit',()=>r());});rmSync(dir,{recursive:true,force:true});}
});
