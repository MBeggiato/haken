<script lang="ts">
  let { name, size = 18 }: {name:string;size?:number} = $props();
  const paths: Record<string,string> = {
    kanban:'M3 4h5v16H3V4Zm7 0h5v10h-5V4Zm7 0h4v13h-4V4',
    all:'M4 5h16M4 12h16M4 19h16', inbox:'M4 4h16l2 12v4H2v-4L4 4Zm-2 12h6l2 3h4l2-3h6',
    today:'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', upcoming:'M8 2v4M16 2v4M3 10h18M4 5h16v16H4V5',
    completed:'m5 12 4 4L19 6', archive:'M3 3h18v5H3V3Zm2 5v13h14V8M9 12h6', search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    plus:'M12 5v14M5 12h14', close:'m6 6 12 12M6 18 18 6', settings:'M4 7h16M4 17h16M8 4v6M16 14v6',
    command:'M9 7V5a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v14a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2V7',
    undo:'M9 4 4 9l5 5M4 9h9a7 7 0 0 1 7 7', chevron:'m9 5 7 7-7 7', file:'M5 2h9l5 5v15H5V2Zm9 0v6h5',
    trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7', copy:'M8 8h13v13H8V8ZM16 4V2H2v14h2',
    up:'m6 14 6-6 6 6', down:'m6 10 6 6 6-6', image:'M4 4h16v16H4V4Zm0 12 5-5 4 4 3-3 4 4M9 9h.01', help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    menu:'M3 6h18M3 12h18M3 18h18', repeat:'m17 2 4 4-4 4M3 11V6h18M7 22l-4-4 4-4M21 13v5H3'
  };
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name] || paths.file}/></svg>
