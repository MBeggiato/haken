<script lang="ts">
  let { local = false }: { local?: boolean } = $props();
</script>

<div class="brand">
  <svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
    <path class="brand-frame" d="M37 10H20a10 10 0 0 0-10 10v9a10 10 0 0 0 10 10h9a10 10 0 0 0 10-10v-4"/>
    <path class="brand-check" d="m17 24 7 7 16-17"/>
  </svg>
  <strong>Haken</strong>
  {#if local}<span class="local-label">LOCAL</span>{/if}
</div>
