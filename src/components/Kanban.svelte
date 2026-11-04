<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { columns, columnFor, type Column } from '../lib/kanban';
  import { parse, today } from '../lib/todo';
  import type { Row } from '../lib/types';
  import Icon from './Icon.svelte';

  let { rows, selected, focused, revision, choose, select, move }: {
    rows: Row[];
    selected: number[];
    focused: number | null;
    revision: string;
    choose: (row: Row) => void;
    select: (id: number) => void;
    move: (id: number, column: Column, revision: string) => Promise<void>;
  } = $props();
  let dragging = $state<{ id: number; revision: string } | null>(null);
  let over = $state<Column | null>(null);
  let groups = $derived(columns.map(column => ({ ...column, rows: rows.filter(row => columnFor(row.raw) === column.id) })));

  function start(event: DragEvent, row: Row) {
    if (app.busy || (event.target instanceof HTMLElement && event.target.closest('select,input'))) {
      event.preventDefault();
      return;
    }
    dragging = { id: row.id, revision };
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(row.id));
    }
  }
  function drop(event: DragEvent, column: Column) {
    event.preventDefault();
    const source = dragging;
    dragging = null;
    over = null;
    if (source && !app.busy) void move(source.id, column, source.revision);
  }
</script>

<p class="board-hint">Drag cards between columns, use each card’s status menu, or focus a card and press h/l to move it.</p>
<div class="kanban-board" aria-label="Kanban board">
  {#each groups as column (column.id)}
    <section
      class="kanban-column"
      class:drop-target={over === column.id}
      aria-label={column.label}
      data-column={column.id}
      ondragover={event => { if (dragging && !app.busy) { event.preventDefault(); over = column.id; } }}
      ondragleave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) over = null; }}
      ondrop={event => drop(event, column.id)}
    >
      <header class="column-heading"><span class="column-dot" data-stage={column.id}></span><h2>{column.label}</h2><span class="column-count">{column.rows.length}</span></header>
      <div class="kanban-cards">
        {#each column.rows as row (row.id)}
          {@const task = parse(row.raw)}
          <article
            class="kanban-card"
            class:focused={focused === row.id}
            class:dragging={dragging?.id === row.id}
            class:done={task.completed}
            draggable={!app.busy}
            aria-label={task.title || row.raw}
            data-task-id={row.id}
            ondragstart={event => start(event, row)}
            ondragend={() => { dragging = null; over = null; }}
          >
            <div class="card-topline"><input type="checkbox" aria-label={'Select ' + (task.title || row.raw)} checked={selected.includes(row.id)} onchange={() => select(row.id)}/><span class="card-line">LINE {row.id + 1}</span>{#if task.priority}<span class="priority" class:high={task.priority === 'A'}>{task.priority}</span>{/if}</div>
            <button class="task-content" onclick={() => choose(row)}><span class="task-title">{task.title || task.body || row.raw}</span></button>
            {#if app.preferences.metadata}<div class="task-tags">{#each task.projects as project}<span class="project-tag">+{project}</span>{/each}{#each task.contexts as context}<span>@{context}</span>{/each}{#if task.metadata.rec}<span class="inline-flex items-center gap-1"><Icon name="repeat" size={12}/>{task.metadata.rec}</span>{/if}</div>{/if}
            {#if task.metadata.due}<span class="due-label" class:overdue={!task.completed && task.metadata.due < today()}>{task.metadata.due === today() ? 'Today' : task.metadata.due}</span>{/if}
            <label class="card-status">Status<select aria-label={'Status for ' + (task.title || row.raw)} value={column.id} disabled={app.busy} onchange={event => { const target = event.currentTarget; const value = target.value as Column; target.value = column.id; void move(row.id, value, revision); }}>{#each columns as option}<option value={option.id}>{option.label}</option>{/each}</select></label>
          </article>
        {:else}
          <p class="column-empty">No matching tasks.{#if dragging}<br/>Drop a card here.{/if}</p>
        {/each}
      </div>
    </section>
  {/each}
</div>
