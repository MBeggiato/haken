<script lang="ts">
  import { untrack, onDestroy } from 'svelte';
  import {parse,setPriority,setTokens,setDescription} from '../lib/todo';
  import type {Row,FileKey} from '../lib/types';
  import {app,act,request} from '../lib/state.svelte';
  import Icon from './Icon.svelte';
  import MarkdownNoteEditor from './MarkdownNoteEditor.svelte';
  let {row,file,revision,close,edit}: {row:Row;file:FileKey;revision:string;close:()=>void;edit:()=>void}=$props();
  let raw=$state(untrack(()=>row.raw));
  let savedRaw=$state(untrack(()=>row.raw)),baseRevision=$state(untrack(()=>revision));
  let task=$derived(parse(raw));
  let originalNote=$state('');
  let note=$state(''),noteRevision=$state(''),notePath=$state(''),noteOpen=$state(false),noteEditing=$state(false),newNote=$state(false);
  let changed=$derived(raw!==savedRaw);
  $effect(()=>{app.draftDirty=changed || note!==originalNote;});
  onDestroy(()=>{app.draftDirty=false;});
  async function save(){if(changed){if(!await act({type:'edit',file,ids:[row.id],raw},baseRevision))return;savedRaw=raw;baseRevision=app.snapshot!.revision;}if(note!==originalNote&&!await saveNote())return;app.draftDirty=false;close();}
  function tokens(kind:string,value:string){try{raw=setTokens(raw,kind,kind==='+' || kind==='@'?value.trim().split(/\s+/).map(v=>v.replace(/^[+@]/,'')):[value]);}catch(e){app.error=(e as Error).message;}}
  async function loadNote(){if(note!==originalNote&&!confirm('Discard unsaved note changes and reload?'))return;try{notePath=task.metadata.note;const result=await request<{text:string;revision:string}>('note?path='+encodeURIComponent(notePath));note=result.text;originalNote=result.text;noteRevision=result.revision;noteOpen=true;noteEditing=false;newNote=false;}catch(e){app.error=(e as Error).message;}}
  async function saveNote(){try{const result=await request<{text:string;revision:string}>('note',{path:notePath,text:note,revision:noteRevision});noteRevision=result.revision;originalNote=note;newNote=false;app.message='Note saved.';return true;}catch(e){app.error=(e as Error).message;return false;}}
  async function createNote(){try{const path=`tasks/${crypto.randomUUID()}.md`;const empty=await request<{text:string;revision:string}>('note?path='+encodeURIComponent(path));notePath=path;note=`# ${task.title}\n\n`;originalNote='';noteRevision=empty.revision;raw=setTokens(raw,'note',[path]);noteOpen=true;noteEditing=true;newNote=true;}catch(e){app.error=(e as Error).message;}}
  function noteKeys(event:KeyboardEvent){if(event.altKey||event.ctrlKey||event.metaKey||event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable="true"]'))return;if(event.key==='o'&&task.metadata.note){event.preventDefault();void loadNote();}else if(event.key==='O'){event.preventDefault();if(task.metadata.note)void loadNote();else void createNote();}}
</script>
<svelte:window onkeydown={noteKeys}/>
<aside class="detail-panel" aria-label="Task details">
  <header><span class="section-label">TASK DETAILS</span><button class="icon-button" aria-label="Close details" onclick={close}><Icon name="close"/></button></header>
  <div class="detail-body">
    <div class="detail-state"><span class="status-dot"></span>{task.completed?'Completed':'In progress'}<span class="ml-auto">LINE {row.id+1}</span></div>
    <h2>{task.title || 'Untitled task'}</h2>
    <button class="text-action" onclick={edit}>Open keyboard editor <kbd>e</kbd></button>
    <label class="stack-label">Description<textarea rows="3" value={task.title} onchange={e=>raw=setDescription(raw,e.currentTarget.value)}></textarea></label>
    <div class="fields">
      <label>Priority<select value={task.priority} onchange={e=>raw=setPriority(raw,e.currentTarget.value)}><option value="">No priority</option>{#each 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') as p}<option value={p}>{p}{p==='A'?' — High':p==='B'?' — Medium':''}</option>{/each}</select></label>
      <label>Due date<input type="date" value={task.metadata.due || ''} onchange={e=>tokens('due',e.currentTarget.value)}/></label>
      <label>Projects<input placeholder="work personal" value={task.projects.join(' ')} onchange={e=>tokens('+',e.currentTarget.value)}/></label>
      <label>Contexts<input placeholder="office phone" value={task.contexts.join(' ')} onchange={e=>tokens('@',e.currentTarget.value)}/></label>
      <label>Repeat<input placeholder="1w or +1m" value={task.metadata.rec || ''} onchange={e=>tokens('rec',e.currentTarget.value)}/></label>
      <p class="field-hint">d · days, b · business days, w · weeks, m · months, y · years. Add + for strict recurrence.</p>
      <label>Show after<input type="date" value={task.metadata.t || ''} onchange={e=>tokens('t',e.currentTarget.value)}/></label>
      <label>Linked note<input placeholder="project/notes.md" value={task.metadata.note || ''} onchange={e=>tokens('note',e.currentTarget.value)}/></label>
    </div>
    {#if task.metadata.note}<button class="text-action" onclick={loadNote}><Icon name="file"/>Open Markdown note <kbd>o</kbd></button>{:else}<button class="text-action" onclick={createNote}><Icon name="file"/>Create Markdown note <kbd>O</kbd></button>{/if}
    {#if noteOpen}<section class="task-note" aria-label="Task note"><header><strong>Markdown note</strong></header><MarkdownNoteEditor bind:value={note} path={notePath} bind:editing={noteEditing}/><p class="field-hint">{notePath}</p>{#if !newNote}<div class="flex gap-2"><button onclick={saveNote} disabled={note===originalNote}>Save note</button><button onclick={loadNote}>Reload note</button></div>{/if}</section>{/if}
    <div class="raw-heading"><span class="section-label">SOURCE LINE</span><span>todo.txt</span></div>
    <label class="sr-only" for="raw-line">Raw todo.txt line</label><textarea id="raw-line" class="raw-editor" rows="5" bind:value={raw}></textarea>
    <p class="field-hint">Edit the full description here. Unknown metadata stays in your file.</p>
    {#if task.created || task.finished}<div class="date-info">{#if task.created}<span>Created {task.created}</span>{/if}{#if task.finished}<span>Completed {task.finished}</span>{/if}</div>{/if}
    {#if app.snapshot?.revision!==baseRevision}<p class="notice">The file changed since this draft opened. Copy your draft before closing; saving will reject a stale revision.</p>{/if}
  </div>
  <footer><span>{changed||note!==originalNote?'Unsaved changes':'Original file contents'}</span><button class="primary" disabled={(!changed&&note===originalNote) || app.busy} onclick={save}>Save changes</button></footer>
</aside>
