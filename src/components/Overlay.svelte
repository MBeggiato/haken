<script lang="ts">
  import {onMount} from 'svelte';
  import type {Snippet} from 'svelte';
  import Icon from './Icon.svelte';
  let {title,close,children}: {title:string;close:()=>void;children:Snippet}=$props();
  let dialog:HTMLDialogElement;
  onMount(()=>{const previous=document.activeElement as HTMLElement|null;dialog.showModal();return ()=>previous?.focus();});
</script>
<dialog bind:this={dialog!} oncancel={e=>{e.preventDefault();close();}} onclick={e=>{if(e.target===dialog)close();}}>
  <div class="modal"><header><h2>{title}</h2><button class="icon-button" onclick={close} aria-label="Close dialog"><Icon name="close"/></button></header>{@render children()}</div>
</dialog>
