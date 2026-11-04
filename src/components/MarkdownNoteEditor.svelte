<script lang="ts">
  import { tick, onDestroy } from 'svelte';
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import Icon from './Icon.svelte';
  import { app } from '../lib/state.svelte';

  let { value = $bindable(), path, editing = $bindable() }: { value: string; path: string; editing: boolean } = $props();
  let input = $state<HTMLTextAreaElement>();
  let picker = $state<HTMLInputElement>();
  let previewButton = $state<HTMLButtonElement>();
  let dragging = $state(false), uploading = $state(false), status = $state('');
  let imageUrls = $state<Record<string, string>>({});
  const pending = new Set<string>();
  const maxBytes = 12 * 1024 * 1024;
  const accepted = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

  function assetPath(url: string) {
    let parts = path.split('/').slice(0, -1);
    try { url = decodeURIComponent(url.split(/[?#]/, 1)[0]); } catch { return ''; }
    if (url.startsWith('/') || url.includes(':')) return '';
    for (const part of url.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { if (!parts.length) return ''; parts.pop(); }
      else parts.push(part);
    }
    const result = parts.join('/');
    return /^assets\/[a-f0-9-]+\.(?:png|jpg|webp|gif)$/i.test(result) ? result : '';
  }
  let html = $derived.by(() => {
    const safe = DOMPurify.sanitize(marked.parse(value) as string);
    const document = new DOMParser().parseFromString(safe, 'text/html');
    for (const image of document.images) {
      const asset = assetPath(image.getAttribute('src') || '');
      if (asset) {
        if (imageUrls[asset]) image.src = imageUrls[asset];
        else image.removeAttribute('src');
      }
    }
    return document.body.innerHTML;
  });

  $effect(() => {
    const markdown = value;
    for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
      const savedPath = assetPath(match[1]);
      if (savedPath && !imageUrls[savedPath] && !pending.has(savedPath)) {
        pending.add(savedPath);
        void fetchImage(savedPath);
      }
    }
  });
  $effect(() => { if (editing) void tick().then(() => input?.focus()); });
  onDestroy(() => Object.values(imageUrls).forEach(URL.revokeObjectURL));

  async function fetchImage(savedPath: string) {
    try {
      const response = await fetch('/api/note-image?path=' + encodeURIComponent(savedPath), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Could not load an attached image.');
      imageUrls[savedPath] = URL.createObjectURL(await response.blob());
    } catch (error) { status = (error as Error).message; }
  }
  function insert(markdown: string) {
    const target = input;
    if (!target) return;
    const start = target.selectionStart, end = target.selectionEnd;
    const before = value.slice(0, start), after = value.slice(end);
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    const suffix = after && !after.startsWith('\n') ? '\n' : '';
    const insertion = `${prefix}${markdown}${suffix}`;
    value = before + insertion + after;
    void tick().then(() => {
      const caret = start + insertion.length;
      input?.focus(); input?.setSelectionRange(caret, caret);
    });
  }
  async function addImages(files: File[]) {
    if (!files.length) return;
    uploading = true; status = '';
    try {
      for (const file of files) {
        if (!accepted.has(file.type)) { status = 'Use a PNG, JPEG, WebP, or GIF image.'; continue; }
        if (file.size > maxBytes) { status = 'Images must be 12 MB or smaller.'; continue; }
        const response = await fetch('/api/note-image', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type }, body: file
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Image upload failed.');
        const depth = Math.max(0, path.split('/').filter(Boolean).length - 1);
        const alt = file.name.replace(/[\[\]\\\r\n]/g, ' ').trim() || 'Image';
        insert(`![${alt}](${ '../'.repeat(depth) + result.path })`);
      }
      if (!status) status = 'Image added to the note. Save the note to keep the link.';
    } catch (error) { status = (error as Error).message; }
    finally { uploading = false; }
  }
  function paste(event: ClipboardEvent) {
    const items = Array.from(event.clipboardData?.items || []);
    const files = items.filter(item => item.kind === 'file' && accepted.has(item.type)).map(item => item.getAsFile()).filter((file): file is File => !!file);
    if (!files.length) return;
    event.preventDefault(); void addImages(files);
  }
  function dragover(event: DragEvent) {
    if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; dragging = true; }
  }
  function drop(event: DragEvent) {
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) { event.preventDefault(); event.stopPropagation(); dragging = false; void addImages(files); }
  }
  function keydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'm') {
      event.preventDefault(); chooseFiles();
    }
  }
  function chooseFiles() {
    if (!picker) return;
    if (picker.showPicker) picker.showPicker();
    else picker.click();
  }
  function toggleMode(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'p') {
      event.preventDefault(); editing = !editing;
      void tick().then(() => editing ? input?.focus() : previewButton?.focus());
    }
  }
  function setEditing(next: boolean) {
    editing = next;
    void tick().then(() => next ? input?.focus() : previewButton?.focus());
  }
</script>

<section class="markdown-note-editor" aria-label="Markdown note editor">
  <header class="markdown-mode-switch"><div><button type="button" aria-pressed={editing} class:active={editing} onclick={()=>setEditing(true)} onkeydown={toggleMode}>Edit</button><button bind:this={previewButton!} type="button" aria-pressed={!editing} class:active={!editing} onclick={()=>setEditing(false)} onkeydown={toggleMode}>Preview</button></div><span><kbd>Ctrl/⌘+Alt+P</kbd> switch mode</span></header>
  {#if editing}
    <div class="markdown-drop-target" role="region" aria-label="Drop images here to attach them" class:drag-over={dragging} ondragover={dragover} ondragleave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))dragging=false;}} ondrop={drop}>
      <textarea bind:this={input!} bind:value readonly={uploading} rows="12" placeholder="Write your task note in Markdown…" onpaste={paste} onkeydown={event=>{keydown(event);toggleMode(event);}}></textarea>
      {#if dragging}<span class="markdown-drop-hint">Drop image to attach</span>{/if}
    </div>
    <p class="field-hint markdown-format-hint"><strong>Markdown:</strong> <code># heading</code> · <code>**bold**</code> · <code>*italic*</code> · <code>- list item</code> · <code>[link](url)</code> · <code>`code`</code> · <code>&gt; quote</code></p>
    <div class="markdown-image-tools"><button type="button" onclick={chooseFiles} disabled={uploading}><Icon name="image" size={15}/>Insert image <kbd>Ctrl+Alt+M</kbd></button><span>Paste or drop PNG, JPEG, WebP, or GIF · up to 12 MB</span></div>
    <input bind:this={picker!} class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple aria-label="Choose images to attach" onchange={event=>{const files=Array.from(event.currentTarget.files||[]);event.currentTarget.value='';void addImages(files);}}/>
    {#if status}<p class="field-hint" role="status">{status}</p>{/if}
  {:else}
    <article class="markdown-preview">{@html html}</article>
    {#if status}<p class="field-hint" role="status">{status}</p>{/if}
  {/if}
</section>
