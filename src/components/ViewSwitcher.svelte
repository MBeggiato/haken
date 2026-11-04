<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { views as defaultViews } from '../lib/navigation';
  import type { ViewId } from '../lib/navigation';
  import Icon from './Icon.svelte';

  type Item = { id: string; label: string };
  let { current, choose, close, items = defaultViews, heading = 'Switch view', modeLabel = 'NAVIGATION MODE', hint = 'views' }: {
    current: string;
    choose: (view: string) => boolean;
    close: () => void;
    items?: readonly Item[];
    heading?: string;
    modeLabel?: string;
    hint?: string;
  } = $props();
  let active = $state(0);
  let commandMode = $state(false);
  let command = $state('');
  let error = $state('');
  let buttons: HTMLButtonElement[] = [];
  let commandInput = $state<HTMLInputElement>();
  let dialog: HTMLDivElement;

  onMount(() => {
    active = Math.max(0, items.findIndex(view => view.id === current));
    const frame = requestAnimationFrame(() => buttons[active]?.focus());
    return () => cancelAnimationFrame(frame);
  });

  function select(index: number) {
    active = (index + items.length) % items.length;
    buttons[active]?.focus();
  }
  function openCommand() {
    commandMode = true;
    command = '';
    error = '';
    void tick().then(() => commandInput?.focus());
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape' || (event.ctrlKey && event.key === '[')) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (commandMode) {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (command.trim().toLowerCase() === 'q') close();
        else error = `Unknown view command: :${command.trim()}`;
      }
      return;
    }
    if (event.key === ':') { event.preventDefault(); openCommand(); return; }
    if (event.key.toLowerCase() === 'q') { event.preventDefault(); close(); return; }
    if (event.key === 'j' || event.key === 'ArrowDown') { event.preventDefault(); select(active + 1); return; }
    if (event.key === 'k' || event.key === 'ArrowUp') { event.preventDefault(); select(active - 1); return; }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (choose(items[active].id)) close();
      return;
    }
    const number = Number(event.key);
    if (number === 0 && items[0]?.id === '') { event.preventDefault(); if (choose(items[0].id)) close(); return; }
    if (number >= 1 && number <= Math.min(items.length, 9)) {
      event.preventDefault();
      if (choose(items[number - 1].id)) close();
    }
  }
</script>

<div bind:this={dialog!} class="view-mode" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="view-mode-title" onkeydown={keydown}>
  <div class="view-mode-card">
    <header><div class="view-mode-label"><span class="view-mode-mark">g</span><div><span class="section-label">{modeLabel}</span><h2 id="view-mode-title">{heading}</h2></div></div><button class="icon-button" aria-label="Close view selection" onclick={close}><Icon name="close"/></button></header>
    <p class="view-mode-intro">Choose {hint}. This mode stays open until you switch or quit.</p>
    <nav class="view-options" aria-label="Views">
      {#each items as view, index (view.id)}
        <button bind:this={buttons[index]} class:view-option-active={active === index} aria-current={current === view.id ? 'page' : undefined} onclick={() => { active = index; if (choose(view.id)) close(); }}>
          {#if index < 9}<kbd>{index === 0 && view.id === '' ? '0' : index + 1}</kbd>{/if}<span>{view.label}</span>{#if current === view.id}<small>CURRENT</small>{/if}
        </button>
      {/each}
    </nav>
    {#if commandMode}
      <label class="view-command-label" for="view-command">COMMAND</label>
      <div class="view-command-row"><span>:</span><input id="view-command" bind:this={commandInput!} bind:value={command} aria-label="View mode command" placeholder="q to quit"/></div>
      {#if error}<p class="editor-error" role="alert">{error}</p>{/if}
    {:else}<p class="field-hint"><kbd>j</kbd> / <kbd>k</kbd> or arrows move <span>·</span> <kbd>1–9</kbd> jump <span>·</span> <kbd>Enter</kbd> switch</p>{/if}
    <footer class="view-mode-footer"><span><kbd>Esc</kbd> or <kbd>Ctrl [</kbd> cancel</span><span><kbd>:q</kbd> quit</span></footer>
  </div>
</div>
