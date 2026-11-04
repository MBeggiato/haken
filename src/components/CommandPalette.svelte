<script lang="ts">
  import { onMount } from 'svelte';
  import type { PaletteCommand } from '../lib/navigation';
  import Icon from './Icon.svelte';

  let { commands, close, execute }: {
    commands: PaletteCommand[];
    close: () => void;
    execute: (command: PaletteCommand) => void;
  } = $props();
  let query = $state('');
  let active = $state(0);
  let input: HTMLInputElement;
  let results: HTMLDivElement;
  let filtered = $derived(commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase())));

  onMount(() => { const frame = requestAnimationFrame(() => input.focus()); return () => cancelAnimationFrame(frame); });

  function keydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!filtered.length) return;
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
      results.querySelectorAll<HTMLButtonElement>('[role="option"]')[active]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && filtered[active]) {
      event.preventDefault(); execute(filtered[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close();
    }
  }
</script>

<input
  bind:this={input!}
  class="palette-search"
  aria-label="Search commands"
  aria-controls="command-results"
  aria-activedescendant={filtered.length ? `command-${active}` : undefined}
  placeholder="Switch views, open a task, or find an action…"
  bind:value={query}
  oninput={() => { active = 0; }}
  onkeydown={keydown}
/>
<div bind:this={results!} id="command-results" class="command-list" role="listbox" aria-label="Commands">
  {#each filtered as command, index (command.label)}
    <button id={`command-${index}`} role="option" aria-selected={index === active} class:command-active={index === active} onclick={() => execute(command)}>
      <span>{command.label}</span>{#if command.key}<kbd>{command.key}</kbd>{/if}
    </button>
  {:else}
    <p class="command-empty">No matching actions. Try a view name or task action.</p>
  {/each}
</div>
<p class="palette-hint"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>↵</kbd> open <kbd>esc</kbd> close</p>
