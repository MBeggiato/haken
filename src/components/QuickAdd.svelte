<script lang="ts">
  import { natural } from '../lib/todo';
  import { app, act } from '../lib/state.svelte';
  import type { FileKey } from '../lib/types';
  import Icon from './Icon.svelte';
  let { file = 'todo' }: {file?:FileKey} = $props();
  let input = $state('');
  async function save() { if (input.trim() && !app.busy && await act({type:'add',file,raw:natural(input)})) input=''; }
</script>
<form class="quick-add" onsubmit={(e)=>{e.preventDefault();void save();}}>
  <Icon name="plus"/><input id="quick-add" aria-label="New task" placeholder="Add a task… try “Call dentist next Friday”" bind:value={input}/><button type="submit" disabled={!input.trim() || app.busy}>Add task <kbd>N</kbd></button>
</form>
