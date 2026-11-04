<script lang="ts">
  import {onMount,tick} from 'svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Kanban from './components/Kanban.svelte';
  import TaskList from './components/TaskList.svelte';
  import QuickAdd from './components/QuickAdd.svelte';
  import TaskEditor from './components/TaskEditor.svelte';
  import Detail from './components/Detail.svelte';
  import Overlay from './components/Overlay.svelte';
  import Settings from './components/Settings.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import ViewSwitcher from './components/ViewSwitcher.svelte';
  import Icon from './components/Icon.svelte';
  import Brand from './components/Brand.svelte';
  import {app,act,refresh,persistPreferences} from './lib/state.svelte';
  import {columns,columnFor} from './lib/kanban';
  import {parse,matches,today} from './lib/todo';
  import type {Row,FileKey,Action} from './lib/types';
  import {views,type ViewId,type PaletteCommand} from './lib/navigation';
  const capture=location.pathname==='/capture';
  let view=$state('all'),query=$state(''),priority=$state(''),project=$state(''),context=$state(''),due=$state(''),status=$state(''),group=$state('');
  let selected=$state<number[]>([]),focused=$state<number|null>(null),mobileNav=$state(false),zen=$state(false);
  let scope=$state<{project?:string;context?:string}|null>(null);
  let scopePickerType=$state<'project'|'context'>('project');
  let detail=$state<{row:Row;file:FileKey;revision:string}|null>(null);
  let editor=$state<{row:Row;file:FileKey;revision:string}|null>(null);
  let overlay=$state(''),savedName=$state(''),deleteIds=$state<number[]>([]);
  let lastD=0;
  let file=$derived<FileKey>(view==='archive'?'done':view==='inbox'?'inbox':'todo');
  let all=$derived(app.snapshot?.files[file] || []);
  let rows=$derived.by(()=>{
    const result=all.filter(row=>{const t=parse(row.raw); const d=t.metadata.due || '';
      const inScope=(!scope?.project||t.projects.includes(scope.project))&&(!scope?.context||t.contexts.includes(scope.context));
      return inScope && (view!=='completed'||t.completed) && (!['today','upcoming'].includes(view)||!t.completed) &&
        (view!=='today'||d===today()) && (view!=='upcoming'||d>today()) &&
        (!query||matches(row.raw,query)) && (!priority||t.priority===priority) && (!project||t.projects.includes(project)) && (!context||t.contexts.includes(context)) &&
        (!status||(status==='done'?t.completed:!t.completed)) &&
        (!due||(due==='none'?!d:due==='overdue'?!!d && d<today():due==='today'?d===today():d>today())) &&
        (!app.preferences.hideFuture||!t.metadata.t||t.metadata.t<=today());
    });
    const sort=app.preferences.sort;
    if(sort!=='file')result.sort((a,b)=>{
      const ta=parse(a.raw),tb=parse(b.raw), descending=sort.endsWith('-desc');
      const value=(t:ReturnType<typeof parse>)=>sort.startsWith('priority-')?t.priority:sort.startsWith('due-')?t.metadata.due:t.created;
      const av=value(ta),bv=value(tb);
      if(sort.startsWith('priority-')||sort.startsWith('due-')){
        if(!av&&!bv)return a.id-b.id;
        if(!av)return 1;
        if(!bv)return -1;
      }
      return (descending?-1:1)*(av||'').localeCompare(bv||'')||a.id-b.id;
    });
    return result;
  });
  let navigationRows=$derived(view==='kanban'?columns.flatMap(column=>rows.filter(row=>columnFor(row.raw)===column.id)):rows);
  let projects=$derived([...new Set(all.flatMap(r=>parse(r.raw).projects))].sort());
  let contexts=$derived([...new Set(all.flatMap(r=>parse(r.raw).contexts))].sort());
  let scopeRows=$derived((app.snapshot?.files.todo||[]).filter(row=>{const task=parse(row.raw);return (!activeProject||task.projects.includes(activeProject))&&(!activeContext||task.contexts.includes(activeContext));}));
  let scopeCounts=$derived({active:scopeRows.filter(row=>!parse(row.raw).completed).length,completed:scopeRows.filter(row=>parse(row.raw).completed).length});
  let scopeItems=$derived([{id:'',label:scopePickerType==='project'?'All projects':'All contexts'},...(scopePickerType==='project'?projects:contexts).map(value=>({id:value,label:(scopePickerType==='project'?'+':'@')+value}))]);
  let activeProject=$derived(scope?.project||project);
  let activeContext=$derived(scope?.context||context);
  let scopeLabel=$derived([activeProject?`+${activeProject}`:'',activeContext?`@${activeContext}`:''].filter(Boolean).join(' · '));
  const titles:Record<string,string>=Object.fromEntries(views.map(v=>[v.id,v.label]));
  const descriptions:Record<string,string>={kanban:'See what’s next, what’s moving, and what’s done.',all:'Everything on your mind, a line at a time.',inbox:'A landing place for ideas. Sort them when you’re ready.',today:'A clear view of what matters today.',upcoming:'A little perspective on what comes next.',completed:'Small steps, real progress.',archive:'Finished work, safely tucked away.'};
  const shortcutColumns=[
    [
      {title:'Navigation',items:[['g','Enter view selection'],['j / k','Move through views or picker options'],['1–9','Jump to a view or option'],['Enter','Open the selected view'],['Esc / Ctrl+[ / q / :q','Cancel view selection']]},
      {title:'Global',items:[['Ctrl/⌘ K/P or :','Open command palette'],['↑ / ↓, Enter, Esc','Navigate palette actions'],['z','Toggle Zen mode'],['Esc','Close panel, exit Zen, or clear filters'],['?','Open shortcut help']]}
    ],
    [
      {title:'Tasks',items:[['j / k','Move through tasks'],['n','Create a task'],['e / Enter','Open task editor'],['o / O','Open or create a task note'],['x','Complete or reopen focused task'],['d d','Delete focused task'],['/','Focus search'],['S','Cycle priority and due-date sorting'],['u','Undo']]},
      {title:'Projects and contexts',items:[['P','Open project picker'],['C','Open context picker'],['0','Clear one picker filter'],[':clear','Clear both filters']]},
      {title:'Kanban',items:[['h / l','Move focused card one lane left or right']]}
    ]
  ];
  function canLeave(){return !app.draftDirty || confirm('Discard unsaved task or note changes?');}
  function closeDetail(){if(canLeave())detail=null;}
  function navigate(v:string){if(!canLeave())return false;scope=null;view=v;selected=[];focused=null;detail=null;query='';project='';context='';priority='';due='';status='';mobileNav=false;return true;}
  function filter(s:string){if(navigate('all'))query=s;}
  function cleanScope(){if(scope&&!scope.project&&!scope.context)scope=null;}
  function browse(type:'project'|'context',value:string){
    if(!canLeave())return false;
    app.draftDirty=false;
    const wasScoped=!!scope;
    view='all';selected=[];focused=null;detail=null;mobileNav=false;
    if(type==='project'){scope={...scope,project:value||undefined};project='';}
    else {scope={...scope,context:value||undefined};context='';}
    cleanScope();
    if(!wasScoped){query='';project='';context='';priority='';due='';status='';}
    return true;
  }
  function chooseScope(type:'project'|'context',value:string){return browse(type,value);}
  function changeProjectFilter(value:string){project=value;if(value&&scope?.project){scope={...scope,project:undefined};cleanScope();}}
  function changeContextFilter(value:string){context=value;if(value&&scope?.context){scope={...scope,context:undefined};cleanScope();}}
  function clearScope(){scope=null;project='';context='';}
  function choose(row:Row){if(!canLeave())return;focused=row.id;detail={row:{...row},file,revision:app.snapshot!.revision};}
  function select(id:number){selected=selected.includes(id)?selected.filter(i=>i!==id):[...selected,id];}
  async function run(type:Action['type'],ids=selected,extra:Partial<Action>={},revision=app.snapshot?.revision,keepFocus=false){if(!canLeave())return;if(await act({type,file,ids,...extra},revision)){selected=[];detail=null;focused=keepFocus?ids[0]??null:null;if(keepFocus){await tick();document.querySelector<HTMLButtonElement>(`[data-task-id="${focused}"] .task-content`)?.focus();}}else await refresh();}
  function askDelete(ids=selected){if(ids.length){deleteIds=ids;overlay='delete';}}
  function newTask(){overlay='';document.getElementById('quick-add')?.focus();}
  function editTask(row=rows.find(r=>r.id===focused)||navigationRows[0],revision=app.snapshot?.revision){
    if(!row||!revision||!canLeave())return;
    detail=null;overlay='';focused=row.id;editor={row:{...row},file,revision};
  }
  async function closeEditor(saved:boolean){
    const previous=editor;editor=null;app.draftDirty=false;
    await tick();
    if(previous&&(saved||previous.revision===app.snapshot?.revision)){
      focused=previous.row.id;
      document.querySelector<HTMLButtonElement>(`[data-task-id="${focused}"] .task-content`)?.focus();
    }
  }
  let commands=$derived<PaletteCommand[]>([
    ...projects.map(value=>({label:`Filter by project: +${value}`,key:'',action:()=>browse('project',value)})),
    ...contexts.map(value=>({label:`Filter by context: @${value}`,key:'',action:()=>browse('context',value)})),
    {label:'Clear project and context filters',key:':clear',action:clearScope},
    {label:zen?'Exit Zen mode':'Enter Zen mode',key:'z',action:()=>zen=!zen},
    ...views.map(v=>({label:`Go to ${v.label}`,key:`g ${v.key}`,action:()=>navigate(v.id)})),
    {label:'Create a task',key:'n',action:newTask},
    {label:'Cycle task sorting',key:'S',action:cycleSort},
    {label:'Edit focused task',key:'e',action:editTask},
    {label:'Toggle completion',key:'x',action:()=>{if(focused!==null)void run('toggle',[focused]);}},
    {label:'Delete selected or focused tasks',key:'d d',action:()=>askDelete(selected.length?selected:focused!==null?[focused]:[])},
    {label:'Undo last change',key:'u',action:()=>void run('undo')},
    {label:'Archive completed tasks',key:'',action:()=>void run('archive',[],{file:'todo'})},
    {label:'Duplicate focused task',key:'',action:()=>{if(focused!==null)void run('duplicate',[focused]);}},
    {label:'Import selected inbox tasks',key:'',action:()=>void run('import')},
    {label:'Restore selected archived tasks',key:'',action:()=>void run('restore')},
    {label:'Preferences',key:'',action:()=>overlay='settings'},
    {label:'Keyboard shortcuts',key:'?',action:()=>overlay='help'}
  ]);
  async function execute(command:PaletteCommand){overlay='';await tick();command.action();}
  function openPalette(){overlay='palette';}
  function cycleSort(){const modes=['priority-asc','priority-desc','due-asc','due-desc'];const current=modes.indexOf(app.preferences.sort);app.preferences.sort=modes[(current+1)%modes.length];persistPreferences();}
  function keyboard(e:KeyboardEvent){
    if(editor)return;
    const input=e.target instanceof HTMLElement && (e.target.closest('input,textarea,select,[contenteditable="true"]'));
    if(e.key==='Escape'){if(overlay)return;if(detail){closeDetail();return;}if(zen){zen=false;return;}if(scopeLabel){clearScope();selected=[];return;}selected=[];mobileNav=false;return;}
    if(detail){if(!input&&e.key==='e'){e.preventDefault();editTask(detail.row,detail.revision);}else if(!input&&e.key==='z'){e.preventDefault();zen=!zen;}return;}
    if(input||overlay||!app.snapshot||e.altKey)return;
    if((e.ctrlKey||e.metaKey)&&['k','p'].includes(e.key.toLowerCase())){e.preventDefault();openPalette();return;}
    if(e.ctrlKey||e.metaKey)return;
    if(e.shiftKey&&e.key.toLowerCase()==='s'){e.preventDefault();cycleSort();return;}
    if(e.key==='g'){e.preventDefault();overlay='navigation';return;}
    if(e.key==='P'){e.preventDefault();scopePickerType='project';overlay='projects';return;}
    if(e.key==='C'){e.preventDefault();scopePickerType='context';overlay='contexts';return;}
    if(e.key===':'){e.preventDefault();openPalette();return;}
    if(e.key==='z'){e.preventDefault();zen=!zen;return;}
    if(e.key==='j'||e.key==='k'){e.preventDefault();const i=navigationRows.findIndex(r=>r.id===focused);const next=navigationRows[Math.max(0,Math.min(navigationRows.length-1,i+(e.key==='j'?1:-1)))];if(next){focused=next.id;const target=document.querySelector<HTMLButtonElement>(`[data-task-id="${next.id}"] .task-content`);void tick().then(()=>{target?.focus();target?.scrollIntoView({block:'nearest'});});} }
    else if(view==='kanban'&&(e.key==='h'||e.key==='l')){const target=e.target instanceof HTMLElement?e.target.closest<HTMLElement>('[data-task-id]'):null;const id=target?Number(target.dataset.taskId):focused;const row=rows.find(item=>item.id===id);if(row){const current=columns.findIndex(column=>column.id===columnFor(row.raw));const next=current+(e.key==='h'?-1:1);if(columns[next]){e.preventDefault();void run('kanban',[row.id],{column:columns[next].id},app.snapshot?.revision,true);}}}
    else if(e.key==='n'){e.preventDefault();newTask();}else if(e.key==='e'||(e.key==='Enter'&&(e.target===document.body||e.target instanceof HTMLElement&&e.target.closest('.task-content')))){
      e.preventDefault();const id=e.target instanceof HTMLElement?e.target.closest('[data-task-id]')?.getAttribute('data-task-id'):null;
      editTask(id?rows.find(row=>row.id===Number(id)):undefined);
    }
    else if(e.key==='x'&&focused!==null){e.preventDefault();void run('toggle',[focused]);}
    else if(e.key==='d'){if(Date.now()-lastD<600){askDelete(focused===null?selected:[focused]);lastD=0;}else lastD=Date.now();}
    else if(e.key==='/'){e.preventDefault();document.getElementById('search')?.focus();}
    else if(e.key==='u'){e.preventDefault();void run('undo');}else if(e.key==='?'){overlay='help';}
  }
  onMount(()=>{void refresh();const timer=setInterval(()=>void refresh(),1500);return()=>clearInterval(timer);});
  $effect(()=>{persistPreferences();});
  $effect(()=>{document.documentElement.dataset.theme=app.preferences.theme;document.documentElement.dataset.density=app.preferences.density;});
  let previousRevision='';
  $effect(()=>{const revision=app.snapshot?.revision;if(revision&&revision!==previousRevision){previousRevision=revision;selected=[];focused=null;}});
</script>
<svelte:window onkeydown={keyboard} onbeforeunload={e=>{if(app.draftDirty){e.preventDefault();e.returnValue='';}}}/>
{#if !app.snapshot}
  <main class="login-screen"><div class="login-form"><Brand/><span class="section-label">YOUR PRIVATE WORKSPACE</span><h1>A little more focus.</h1><p>Sign in with Pocket ID to open your personal tasks, notes, and images.</p><a class="primary" href="/auth/login">Sign in with Pocket ID <Icon name="chevron"/></a>{#if app.error}<p role="alert" class="error-text">{app.error}</p>{/if}<small>Each account has its own local files.</small></div></main>
{:else if capture}
  <main class="capture-page"><Brand/><span class="section-label">QUICK CAPTURE</span><h1>Off your mind.<br/>Into your inbox.</h1><p>Capture now. Organize later.</p><QuickAdd file="inbox"/><p role="status">{app.message}</p>{#if app.error}<p role="alert" class="error-text">{app.error}</p>{/if}<a href="/">Open full workspace →</a></main>
{:else}
  <div class="workspace" class:has-detail={!!detail} class:zen>
    <div class="nav-container" class:mobile-open={mobileNav}><Sidebar {view} scope={{project:activeProject,context:activeContext}} {navigate} {filter} {browse} settings={()=>overlay='settings'} palette={openPalette}/></div>
    <main class="main-pane">
      <div class="topbar"><button class="mobile-menu icon-button" aria-label="Toggle navigation" onclick={()=>mobileNav=!mobileNav}><Icon name="menu"/></button><span class="breadcrumb">Workspace <Icon name="chevron" size={12}/></span><label class="sr-only" for="view-switcher">Switch view</label><select id="view-switcher" class="view-switcher" value={view} onchange={e=>navigate(e.currentTarget.value)}>{#each views as item}<option value={item.id}>{item.label}</option>{/each}</select><button class="topbar-palette" onclick={openPalette}><Icon name="search" size={15}/><span>Jump to…</span><kbd>⌘ K</kbd></button><div class="flex items-center gap-3"><button class="subtle-button zen-toggle" onclick={()=>zen=true} title="Enter Zen mode"><span>Zen</span><kbd>z</kbd></button><span class="sync-state"><span class="status-dot" class:offline={!app.connected}></span>{app.busy?'Saving…':app.connected?'Connected':'Disconnected'}</span><button class="icon-button" aria-label="Keyboard shortcuts" onclick={()=>overlay='help'}><Icon name="help" size={17}/></button></div></div>
      <div class="main-content">
        <header class="page-header"><div><div class="eyebrow">A LITTLE MORE FOCUS</div><h1>{scopeLabel||titles[view]}<span>{rows.length}</span></h1><p>{scopeLabel?`${scopeCounts.active} active · ${scopeCounts.completed} completed`:descriptions[view]}</p></div>{#if zen}<button class="subtle-button zen-exit" onclick={()=>zen=false}>Exit Zen <kbd>Esc</kbd></button>{:else}<div class="flex items-center gap-2">{#if scopeLabel}<button class="subtle-button" onclick={clearScope} title="Show all tasks">Clear scope <kbd>Esc</kbd></button>{/if}<button class="subtle-button" disabled={app.busy||!app.snapshot.undo} onclick={()=>run('undo')} title="Undo (u)"><Icon name="undo"/>Undo</button></div>{/if}</header>
        {#if view!=='archive'}<QuickAdd file={file}/>{/if}
        <div class="search-row"><div class="search-box"><Icon name="search" size={17}/><input id="search" aria-label="Search tasks" placeholder="Search tasks, +projects, @contexts…" bind:value={query}/><kbd>/</kbd></div><button class="subtle-button" disabled={!query} onclick={()=>{savedName='';overlay='save-search';}}>Save search</button></div>
        <div class="filter-row">
          <select aria-label="Filter by project" value={project} onchange={e=>changeProjectFilter(e.currentTarget.value)}><option value="">Projects</option>{#each projects as p}<option value={p}>+{p}</option>{/each}</select>
          <select aria-label="Filter by context" value={context} onchange={e=>changeContextFilter(e.currentTarget.value)}><option value="">Contexts</option>{#each contexts as c}<option value={c}>@{c}</option>{/each}</select>
          <select aria-label="Filter by priority" bind:value={priority}><option value="">Priority</option>{#each 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') as p}<option value={p}>{p}</option>{/each}</select>
          <select aria-label="Filter by due date" bind:value={due}><option value="">Due date</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="upcoming">Upcoming</option><option value="none">No due date</option></select>
          <select aria-label="Filter by completion" bind:value={status}><option value="">Any status</option><option value="active">Incomplete</option><option value="done">Complete</option></select>
          {#if query||project||context||priority||due||status}<button class="text-action" onclick={()=>{query='';project='';context='';priority='';due='';status='';}}>Clear filters</button>{/if}
        </div>
        <div class="list-toolbar"><label class="select-all"><input type="checkbox" aria-label="Select all visible tasks" checked={rows.length>0 && rows.every(r=>selected.includes(r.id))} onchange={e=>selected=e.currentTarget.checked?rows.map(r=>r.id):[]}/><span>{selected.length?selected.length+' selected':rows.length+' of '+all.length+' tasks'}</span></label><div class="flex gap-2">{#if view!=='kanban'}<select aria-label="Group tasks" bind:value={group}><option value="">No grouping</option><option value="priority">By priority</option><option value="project">By project</option><option value="context">By context</option><option value="due">By due status</option></select>{/if}<select aria-label="Sort tasks" bind:value={app.preferences.sort} onchange={persistPreferences}><option value="file">File order</option><option value="priority-asc">Priority ↑ (A first)</option><option value="priority-desc">Priority ↓ (Z first)</option><option value="due-asc">Due date ↑ (soonest first)</option><option value="due-desc">Due date ↓ (latest first)</option><option value="created">Created</option></select><kbd>S</kbd></div></div>
        {#if selected.length}<div class="bulk-bar"><strong>{selected.length} selected</strong>{#if file==='done'}<button disabled={app.busy} onclick={()=>run('restore')}>Restore</button>{:else if file==='inbox'}<button disabled={app.busy} onclick={()=>run('import')}>Import into tasks</button>{:else}<button disabled={app.busy} onclick={()=>run('complete')}>Complete</button>{/if}<button disabled={app.busy} onclick={()=>run('duplicate')}>Duplicate</button><button disabled={app.busy} onclick={()=>askDelete()}>Delete</button>{#if view!=='kanban' && selected.length===1 && app.preferences.sort==='file' && !group}<button disabled={app.busy} aria-label="Move selected task up" onclick={()=>run('move',selected,{direction:-1})}><Icon name="up"/></button><button disabled={app.busy} aria-label="Move selected task down" onclick={()=>run('move',selected,{direction:1})}><Icon name="down"/></button>{/if}<button onclick={()=>selected=[]} aria-label="Clear selection"><Icon name="close" size={16}/></button></div>{/if}
        {#if view==='kanban'}
          <Kanban {rows} {selected} {focused} {choose} {select} revision={app.snapshot.revision} move={(id,column,revision)=>run('kanban',[id],{column},revision)}/>
        {:else}
        <TaskList {rows} {selected} {focused} {choose} {select} group={app.preferences.sort==='priority-desc'?'priority-desc':app.preferences.sort.startsWith('priority-')?'priority':group} toggle={row=>{if(file==='done')void run('restore',[row.id]);else void run('toggle',[row.id]);}}/>
        {/if}
        {#if file==='todo'&&all.some(r=>parse(r.raw).completed)}<button class="archive-action" disabled={app.busy} onclick={()=>run('archive',[])}><Icon name="archive" size={16}/>Move completed tasks to archive</button>{/if}
        <div class="list-end"><span></span><Icon name="file" size={14}/><span>One line. One less thing to remember.</span><span></span></div>
      </div>
      <footer class="statusbar"><span><Icon name="file" size={13}/>{file==='todo'?'todo.txt':file==='done'?'done.txt':'inbox.txt'}</span>{#if app.message}<span class="status-message" role="status" aria-live="polite" title={app.message}>{app.message}</span>{/if}<span><kbd>j</kbd><kbd>k</kbd> navigate <kbd>e</kbd> edit <kbd>x</kbd> complete <kbd>?</kbd> shortcuts</span></footer>
    </main>
    {#if detail}{#key detail}<Detail row={detail.row} file={detail.file} revision={detail.revision} close={closeDetail} edit={()=>{if(detail)editTask(detail.row,detail.revision);}}/>{/key}{/if}
  </div>
{/if}
{#if app.snapshot && app.error}<div class="toast error" role="alert"><span>{app.error}</span><button class="icon-button" aria-label="Dismiss notification" onclick={()=>app.error=''}><Icon name="close" size={16}/></button></div>{/if}
{#if editor}<TaskEditor row={editor.row} file={editor.file} revision={editor.revision} close={closeEditor}/>{/if}
{#if overlay}
  <Overlay title={overlay==='navigation'?'Switch view':overlay==='projects'?'Projects':overlay==='contexts'?'Contexts':overlay==='palette'?'Find an action':overlay==='settings'?'Preferences':overlay==='help'?'Keyboard shortcuts':overlay==='delete'?'Delete tasks?':'Save search'} close={()=>overlay=''}>
    {#if overlay==='navigation'}<ViewSwitcher current={view} choose={navigate} close={()=>overlay=''} />
    {:else if overlay==='projects'}<ViewSwitcher current={scopePickerType==='project'?scope?.project||'':''} items={scopeItems} heading="Choose a project" modeLabel="PROJECT MODE" hint="projects" choose={value=>chooseScope('project',value)} close={()=>overlay=''}/>
    {:else if overlay==='contexts'}<ViewSwitcher current={scopePickerType==='context'?scope?.context||'':''} items={scopeItems} heading="Choose a context" modeLabel="CONTEXT MODE" hint="contexts" choose={value=>chooseScope('context',value)} close={()=>overlay=''}/>
    {:else if overlay==='settings'}<Settings/>
    {:else if overlay==='palette'}<CommandPalette {commands} execute={execute} close={()=>overlay=''} />
    {:else if overlay==='help'}<div class="shortcut-help"><div class="shortcut-columns">{#each shortcutColumns as column}<div class="shortcut-column">{#each column as group}<section class="shortcut-group"><h3>{group.title}</h3>{#each group.items as [key,label]}<div class="shortcut-item"><kbd>{key}</kbd><span>{label}</span></div>{/each}</section>{/each}</div>{/each}</div><p class="field-hint">Shortcuts pause while you type in an input. Select tasks for bulk actions.</p></div>
    {:else if overlay==='delete'}<p>Delete {deleteIds.length} task{deleteIds.length===1?'':'s'} from {file==='done'?'the archive':'this file'}? You can undo this while the server is running and files remain unchanged.</p><div class="modal-actions"><button onclick={()=>overlay=''}>Cancel</button><button class="danger" onclick={()=>{overlay='';void run('delete',deleteIds);}}>Delete tasks</button></div>
    {:else if overlay==='save-search'}<form onsubmit={e=>{e.preventDefault();if(savedName.trim()){app.preferences.saved.push({name:savedName.trim(),query});persistPreferences();overlay='';}}}><label class="stack-label">Search name<input bind:value={savedName} placeholder="My weekly review" required/></label><code>{query}</code><div class="modal-actions"><button class="primary" type="submit">Save search</button></div></form>{/if}
  </Overlay>
{/if}
