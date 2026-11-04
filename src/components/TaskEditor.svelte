<script lang="ts">
  import { onMount, onDestroy, tick, untrack } from 'svelte';
  import { app, act, request } from '../lib/state.svelte';
  import { parse, setTokens } from '../lib/todo';
  import { editField, type EditField } from '../lib/editor';
  import type { Row, FileKey } from '../lib/types';
  import Icon from './Icon.svelte';
  import MarkdownNoteEditor from './MarkdownNoteEditor.svelte';

  let { row, file, revision, close }: {
    row: Row; file: FileKey; revision: string; close: (saved: boolean) => void;
  } = $props();
  let raw = $state(untrack(() => row.raw));
  let savedRaw = $state(untrack(() => row.raw)), baseRevision = $state(untrack(() => revision));
  let mode = $state<'normal' | 'insert'>('normal');
  let field = $state<EditField | null>(null);
  let value = $state(''), initialValue = $state(''), error = $state('');
  let discard = $state(false), help = $state(false), noteMode = $state(false), noteEditing = $state(true);
  let notePath = $state(''), note = $state(''), originalNote = $state(''), noteRevision = $state('');
  let cursor = 0;
  let input = $state<HTMLInputElement>();
  let dialog: HTMLDialogElement;
  const undo: string[] = [], redo: string[] = [];
  const labels: Record<EditField, string> = { due: 'Reschedule', priority: 'Priority', projects: 'Projects', contexts: 'Contexts', title: 'Rename task' };
  const hints: Record<EditField, string> = {
    due: 'YYYY-MM-DD · today · tomorrow · +3d / -1w from the current due date · - removes',
    priority: 'A–Z · - removes priority',
    projects: 'Space-separated projects, with or without +. Tab completes the last name. Empty removes all.',
    contexts: 'Space-separated contexts, with or without @. Tab completes the last name. Empty removes all.',
    title: 'Replace the task text. Projects, contexts, dates and other metadata are preserved.'
  };
  let dirty = $derived(raw !== savedRaw || (field !== null && value !== initialValue) || note !== originalNote);
  let suggestions = $derived.by(() => {
    if (field !== 'projects' && field !== 'contexts') return [];
    const terms = Object.values(app.snapshot?.files || {}).flat().flatMap(r => parse(r.raw)[field as 'projects' | 'contexts']);
    const term = value.split(/\s+/).at(-1)?.replace(/^[+@]/, '') || '';
    if (!term) return [];
    return [...new Set(terms)].sort().filter(t => t.toLowerCase().startsWith(term.toLowerCase()));
  });
  $effect(() => { app.draftDirty = dirty; });
  onDestroy(() => { app.draftDirty = false; });
  onMount(() => { dialog.showModal(); void focus(0, true); });

  async function focus(position = cursor, revealStart = false) {
    await tick();
    input!.focus();
    cursor = Math.max(0, Math.min(position, raw.length));
    if (!field) input!.setSelectionRange(cursor, mode === 'normal' ? Math.min(cursor + 1, raw.length) : cursor);
    if (revealStart) input!.scrollLeft = 0;
  }
  function change(next: string) {
    if (next === raw) return;
    undo.push(raw); if (undo.length > 100) undo.shift(); redo.length = 0;
    raw = next; error = '';
  }
  function history(back: boolean) {
    const source = back ? undo : redo, target = back ? redo : undo;
    const next = source.pop();
    if (next !== undefined) { target.push(raw); raw = next; void focus(); }
  }
  function insert(position = cursor) { mode = 'insert'; discard = false; void focus(position); }
  async function prompt(next: EditField) {
    if (field && !apply()) return;
    const task = parse(raw);
    field = next; error = ''; discard = false;
    value = next === 'priority' ? task.priority : next === 'due' ? task.metadata.due || '' : next === 'title' ? task.title : task[next].join(' ');
    initialValue = value;
    await tick(); input!.focus(); input!.select();
  }
  function apply(): boolean {
    if (!field) return true;
    try { if (value !== initialValue) change(editField(raw, field, value)); field = null; mode = 'normal'; error = ''; void focus(0); return true; }
    catch (e) { error = (e as Error).message; return false; }
  }
  async function openNote(create: boolean) {
    if (field && !apply()) return;
    if (note !== originalNote && !confirm('Discard unsaved note changes and reload?')) return;
    const linkedPath = parse(raw).metadata.note || '';
    if (!linkedPath && !create) return;
    const path = linkedPath || `tasks/${crypto.randomUUID()}.md`;
    try {
      const result = await request<{ text: string; revision: string }>('note?path=' + encodeURIComponent(path));
      if (!linkedPath && result.text) throw new Error('A note already exists at the generated path. Try again.');
      notePath = path; noteRevision = result.revision; originalNote = result.text;
      note = linkedPath ? result.text : `# ${parse(raw).title}\n\n`;
      if (!linkedPath) change(setTokens(raw, 'note', [path]));
      noteMode = true; noteEditing = true; mode = 'insert';
      await tick();
    } catch (e) { error = (e as Error).message; }
  }
  async function save() {
    if (app.busy || discard || !apply()) return;
    if (!raw.trim()) { error = 'A task cannot be empty. Use Delete from the task list instead.'; return; }
    if (raw === savedRaw && note === originalNote) { close(false); return; }
    if (raw !== savedRaw) {
      if (!await act({ type: 'edit', file, ids: [row.id], raw }, baseRevision)) { error = app.error; app.error = ''; return; }
      savedRaw = raw; baseRevision = app.snapshot!.revision;
    }
    if (note !== originalNote) {
      try {
        const result = await request<{ text: string; revision: string }>('note', { path: notePath, text: note, revision: noteRevision });
        noteRevision = result.revision; originalNote = note;
      } catch (e) { error = (e as Error).message; return; }
    }
    app.draftDirty = false; close(true);
  }
  function requestClose() {
    if (app.busy) return;
    if (dirty) { discard = true; void focus(); }
    else close(false);
  }
  function escape() {
    if (discard) { discard = false; void focus(); }
    else if (noteMode) { noteMode = false; mode = 'normal'; void focus(); }
    else if (field) { field = null; error = ''; mode = 'normal'; void focus(); }
    else if (mode === 'insert') { cursor = input!.selectionStart ?? cursor; mode = 'normal'; void focus(); }
    else requestClose();
  }
  function keyboard(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); escape(); return; }
    if (app.busy) { if (event.key === 'Enter') event.preventDefault(); return; }
    if (discard) {
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); close(false); }
      else if (event.key.toLowerCase() === 'n') { event.preventDefault(); discard = false; void focus(); }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void save(); return; }
    if (noteMode) return;
    if (event.target !== input) return;
    if (field) {
      if (event.key === 'Enter') { event.preventDefault(); apply(); }
      else if (event.key === 'Tab' && !event.shiftKey && suggestions.length) {
        event.preventDefault(); value = value.replace(/\S*$/, suggestions[0]) + ' ';
        void tick().then(() => input!.setSelectionRange(value.length, value.length));
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); history(!event.shiftKey); return; }
    if (mode === 'insert') return;
    if (event.ctrlKey && event.key === 'r') { event.preventDefault(); history(false); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Tab') return;
    cursor = input.selectionStart ?? cursor;
    const key = event.key;
    if (key.length === 1 || ['Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Delete', 'Backspace'].includes(key)) event.preventDefault();
    if (key === 'i') insert();
    else if (key === 'I') insert(0);
    else if (key === 'a') insert(cursor + 1);
    else if (key === 'A') insert(raw.length);
    else if (key === 'r') void prompt('due');
    else if (key === 'R') void prompt('title');
    else if (key === 'p') void prompt('priority');
    else if (key === '+') void prompt('projects');
    else if (key === '@' || key === 'c') void prompt('contexts');
    else if (key === 'o' && parse(raw).metadata.note) void openNote(false);
    else if (key === 'O') void openNote(true);
    else if (key === 'Enter') void save();
    else if (key === 'u') history(true);
    else if (key === '?') help = !help;
    else if (key === 'x' || key === 'Delete') { change(raw.slice(0, cursor) + raw.slice(cursor + 1)); void focus(); }
    else if (key === 'h' || key === 'ArrowLeft') void focus(cursor - 1);
    else if (key === 'l' || key === 'ArrowRight') void focus(cursor + 1);
    else if (key === '0' || key === 'Home') void focus(0);
    else if (key === '$' || key === 'End') void focus(Math.max(0, raw.length - 1));
    else if (key === 'w') { const next = /\S+\s*|\s+/.exec(raw.slice(cursor)); void focus(cursor + (next?.[0].length || 0)); }
    else if (key === 'b') { const before = raw.slice(0, cursor).trimEnd(); void focus(Math.max(0, before.search(/\S+$/))); }
  }
</script>

<dialog class="task-editor-dialog" bind:this={dialog!} onkeydown={keyboard} oncancel={event => { event.preventDefault(); escape(); }} onclick={event => { if (event.target === dialog) requestClose(); }} aria-labelledby="editor-title">
  <div class="modal task-editor">
    <header><div><h2 id="editor-title">Edit task</h2><span class="field-hint">{file === 'done' ? 'done.txt' : file === 'inbox' ? 'inbox.txt' : 'todo.txt'} · line {row.id + 1}</span></div><button class="icon-button" aria-label="Close editor" onclick={requestClose}><Icon name="close"/></button></header>
    <div class="editor-mode-row"><span class="editor-mode" class:insert={mode === 'insert'} aria-live="polite">{discard ? 'DISCARD?' : noteMode ? (noteEditing ? 'NOTE · INSERT' : 'NOTE PREVIEW') : field ? labels[field].toUpperCase() : mode.toUpperCase()}</span><span>{noteMode ? `${notePath} · Esc returns to task` : field ? 'Enter applies · Esc cancels' : mode === 'normal' ? 'Press i to type · Enter saves' : 'Type freely · Esc returns to Normal mode'}</span></div>
    {#if noteMode}
      <MarkdownNoteEditor bind:value={note} path={notePath} bind:editing={noteEditing}/>
      <div class="editor-actions"><button onclick={() => { noteMode = false; mode = 'normal'; void focus(); }}>Back to task</button></div>
    {:else}
      <label class="sr-only" for="task-edit-input">{field ? labels[field] : 'Task source line'}</label>
      <input id="task-edit-input" class="editor-input" bind:this={input!} value={field ? value : raw} readonly={discard || (!field && mode === 'normal')} disabled={app.busy} autocomplete="off" spellcheck="false" aria-describedby="editor-hint" aria-invalid={!!error} oninput={event => { if (field) value = event.currentTarget.value; else { cursor = event.currentTarget.selectionStart || 0; change(event.currentTarget.value); } }}/>
      <p id="editor-hint" class="field-hint">{field ? hints[field] : 'The complete todo.txt line. Metadata and dates stay in plain text.'}</p>
    {/if}
    {#if field}<pre class="editor-preview">{raw}</pre>{/if}
    {#if suggestions.length}<p class="field-hint">Suggestions: {suggestions.slice(0, 6).join(' · ')}</p>{/if}
    {#if error}<p class="editor-error" role="alert">{error}</p>{/if}
    {#if app.snapshot?.revision !== revision}<p class="notice">The file changed while this editor was open. Your draft is preserved. Copy it before closing and reopen the task to retry.</p>{/if}
    {#if discard}
      <div class="editor-discard" role="alert"><strong>Discard unsaved changes?</strong><span><kbd>y</kbd> discard · <kbd>n</kbd> or <kbd>Esc</kbd> keep editing</span><div class="flex gap-2"><button class="danger" onclick={() => close(false)}>Discard</button><button onclick={() => { discard = false; void focus(); }}>Keep editing</button></div></div>
    {:else}
      {#if !noteMode}<div class="editor-actions"><button onclick={() => insert()} disabled={!!field || app.busy}><kbd>i</kbd> Insert</button><button onclick={() => prompt('title')} disabled={app.busy}><kbd>R</kbd> Rename</button><button onclick={() => prompt('due')} disabled={app.busy}><kbd>r</kbd> Reschedule</button><button onclick={() => prompt('priority')} disabled={app.busy}><kbd>p</kbd> Priority</button><button onclick={() => prompt('projects')} disabled={app.busy}><kbd>+</kbd> Projects</button><button onclick={() => prompt('contexts')} disabled={app.busy}><kbd>@</kbd> Contexts</button><button onclick={() => openNote(true)} disabled={app.busy}><kbd>O</kbd> Note</button><button aria-expanded={help} onclick={() => help = !help}><kbd>?</kbd> Help</button></div>{/if}
      {#if help}<div class="editor-help"><p><kbd>i</kbd> insert at cursor · <kbd>I</kbd> insert at start · <kbd>a</kbd> append · <kbd>A</kbd> append at end</p><p><kbd>h/l</kbd> move · <kbd>w/b</kbd> words · <kbd>0/$</kbd> start/end · <kbd>x</kbd> delete character</p><p><kbd>u</kbd> undo draft · <kbd>Ctrl+r</kbd> redo · <kbd>Ctrl/⌘+z</kbd> undo in either mode</p><p><kbd>R</kbd> rename task text · <kbd>r</kbd> due date · <kbd>p</kbd> priority · <kbd>+</kbd> projects · <kbd>@</kbd> or <kbd>c</kbd> contexts</p><p><kbd>o</kbd> open linked note · <kbd>O</kbd> create or open Markdown note</p><p><kbd>Enter</kbd> applies a field or saves in Normal mode. <kbd>Ctrl/⌘+Enter</kbd> saves from any mode. <kbd>Esc</kbd> goes back one level.</p></div>{/if}
      <footer class="editor-footer"><span>{dirty ? 'Unsaved draft' : 'No changes'} · shortcuts act in Normal mode</span><button class="primary" disabled={app.busy} onclick={save}>Save <kbd>Ctrl ↵</kbd></button></footer>
    {/if}
  </div>
</dialog>
