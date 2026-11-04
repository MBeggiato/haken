<script lang="ts">
  import Icon from './Icon.svelte';
  import Brand from './Brand.svelte';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import { parse } from '../lib/todo';
  import { app, persistPreferences } from '../lib/state.svelte';
  let { view, scope, navigate, filter, browse, settings, palette }: {view:string;scope:{project?:string;context?:string};navigate:(v:string)=>void;filter:(s:string)=>void;browse:(type:'project'|'context',value:string)=>void;settings:()=>void;palette:()=>void} = $props();
  let tasks = $derived(app.snapshot?.files.todo.map(r=>parse(r.raw)) || []);
  let projects = $derived([...new Set(tasks.flatMap(t=>t.projects))].sort());
  let contexts = $derived([...new Set(tasks.flatMap(t=>t.contexts))].sort());
  const counts = (type:'project'|'context', value:string) => {const belongs=(raw:string)=>{const task=parse(raw);return (type==='project'?task.projects.includes(value):task.contexts.includes(value))&&(type==='project'?!scope.context||task.contexts.includes(scope.context):!scope.project||task.projects.includes(scope.project));};return {active:tasks.filter(t=>!t.completed&&belongs(t.raw)).length,done:tasks.filter(t=>t.completed&&belongs(t.raw)).length};};
  const nav = [{id:'all',label:'All tasks'},{id:'kanban',label:'Kanban'},{id:'inbox',label:'Inbox'},{id:'today',label:'Today'},{id:'upcoming',label:'Upcoming'},{id:'completed',label:'Completed'},{id:'archive',label:'Archive'}];
</script>
<aside class="sidebar">
  <Brand local/>
  <button class="command-button" onclick={palette}><Icon name="search"/><span>Find an action</span><kbd>⌘ K</kbd></button>
  <nav aria-label="Workspace">
    <div class="section-label">WORKSPACE</div>
    {#each nav as item}<button class:active={view===item.id} onclick={()=>navigate(item.id)}><Icon name={item.id}/><span>{item.label}</span>{#if item.id==='all'}<small>{tasks.filter(t=>!t.completed).length}</small>{:else if item.id==='inbox'}<small>{app.snapshot?.files.inbox.length || 0}</small>{/if}</button>{/each}
    <div class="section-label mt-7">PROJECTS <span>{projects.length}</span></div>
    {#each projects as project}{@const count=counts('project',project)}<button class:active={scope?.project===project} aria-label={`Project ${project}: ${count.active} active, ${count.done} completed`} title={`${count.active} active · ${count.done} completed`} onclick={()=>browse('project',project)}><span class="project-dot"></span><span>{project}</span><small>{count.active}<span class="scope-done-count"> · {count.done}</span></small></button>{:else}<p class="sidebar-hint">Add +project to any task.</p>{/each}
    <div class="section-label mt-7">CONTEXTS</div>
    {#each contexts as context}{@const count=counts('context',context)}<button class:active={scope?.context===context} aria-label={`Context ${context}: ${count.active} active, ${count.done} completed`} title={`${count.active} active · ${count.done} completed`} onclick={()=>browse('context',context)}><span class="context-sign">@</span><span>{context}</span><small>{count.active}<span class="scope-done-count"> · {count.done}</span></small></button>{:else}<p class="sidebar-hint">Organize with @context.</p>{/each}
    <div class="section-label mt-7">SAVED SEARCHES</div>
    {#each app.preferences.saved as saved,i}<div class="saved-row"><button onclick={()=>filter(saved.query)}><Icon name="search" size={15}/><span>{saved.name}</span></button><button class="icon-button" aria-label={'Remove saved search '+saved.name} onclick={()=>{app.preferences.saved.splice(i,1);persistPreferences();}}><Icon name="close" size={13}/></button></div>{:else}<p class="sidebar-hint">Keep your useful searches here.</p>{/each}
  </nav>
  <div class="sidebar-bottom"><button onclick={settings}><Icon name="settings"/>Preferences</button></div>
</aside>
