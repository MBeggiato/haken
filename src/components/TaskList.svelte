<script lang="ts">
  import Icon from './Icon.svelte';
  import {parse, today} from '../lib/todo';
  import {app} from '../lib/state.svelte';
  import type {Row} from '../lib/types';
  let {rows,selected,focused,choose,select,toggle,group}: {rows:Row[];selected:number[];focused:number|null;choose:(row:Row)=>void;select:(id:number)=>void;toggle:(row:Row)=>void;group:string}=$props();
  let priorityGroup=$derived(group.startsWith('priority'));
  function label(row:Row) { const t=parse(row.raw); return group==='project'?t.projects[0] || 'No project':group==='context'?t.contexts[0] || 'No context':group==='due'?(!t.metadata.due?'No due date':t.metadata.due<today()?'Overdue':t.metadata.due===today()?'Today':'Upcoming'):priorityGroup?t.priority?`Priority ${t.priority}`:'No priority':''; }
  let groups=$derived.by(()=>{const map=new Map<string,Row[]>();for(const row of rows){const key=label(row);map.set(key,[...(map.get(key)||[]),row]);}const entries=[...map];if(priorityGroup)entries.sort(([a],[b])=>a==='No priority'?1:b==='No priority'?-1:group==='priority-desc'?b.localeCompare(a):a.localeCompare(b));return entries;});
</script>
<div class="task-list" aria-label="Tasks">
  {#each groups as [title,items]}
    {#if title}<h2 class="group-heading" class:priority-group={priorityGroup}>{#if priorityGroup}<span class="group-count">({items.length})</span><span class="group-label">{title}</span>{:else}{title}<span>{items.length}</span>{/if}</h2>{/if}
    {#each items as row (row.id)}
      {@const task=parse(row.raw)}
      <div class="task-row" class:focused={focused===row.id} class:done={task.completed} data-task-id={row.id}>
        <input class="selection" type="checkbox" aria-label={'Select '+(task.title || row.raw)} checked={selected.includes(row.id)} onchange={()=>select(row.id)}/>
        <button class="completion" class:checked={task.completed} disabled={app.busy} aria-label={(task.completed?'Reopen ':'Complete ')+(task.title || row.raw)} onclick={()=>toggle(row)}>{#if task.completed}<Icon name="completed" size={14}/>{/if}</button>
        {#if task.priority}<span class="priority" class:high={task.priority==='A'} aria-label={'Priority '+task.priority}>{task.priority}</span>{/if}
        <button class="task-content" onclick={()=>choose(row)}><span class="task-title">{task.title || task.body || row.raw}</span>{#if app.preferences.metadata}<span class="task-tags">{#each task.projects as p}<span class="project-tag">+{p}</span>{/each}{#each task.contexts as c}<span>@{c}</span>{/each}{#if task.metadata.rec}<span class="inline-flex items-center gap-1"><Icon name="repeat" size={12}/>{task.metadata.rec}</span>{/if}</span>{/if}</button>
        {#if task.metadata.due}<span class="due-label" class:overdue={!task.completed && task.metadata.due<today()}>{task.metadata.due===today()?'Today':task.metadata.due}</span>{/if}
        <button class="row-open icon-button" aria-label="Open task details" onclick={()=>choose(row)}><Icon name="chevron" size={15}/></button>
      </div>
    {/each}
  {:else}<div class="empty-state"><Icon name="completed" size={32}/><h2>A little room to breathe.</h2><p>No tasks in this view. Add a task above or adjust your filters.</p></div>{/each}
</div>
