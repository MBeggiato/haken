<script lang="ts">
  import {app,persistPreferences} from '../lib/state.svelte';
</script>
<div class="settings" onchange={persistPreferences}>
  <label>Appearance<select bind:value={app.preferences.theme}><option value="light">Light</option><option value="dark">Dark</option></select></label>
  <label>List density<select bind:value={app.preferences.density}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
  <label>Default sorting<select bind:value={app.preferences.sort}><option value="file">File order</option><option value="priority">Priority</option><option value="due">Due date</option><option value="created">Creation date</option></select></label>
  <label class="check-label"><input type="checkbox" bind:checked={app.preferences.metadata}/>Show projects, contexts and recurrence</label>
  <label class="check-label"><input type="checkbox" bind:checked={app.preferences.hideFuture}/>Hide tasks before their threshold date</label>
  <h3>Private files</h3><p class="field-hint">This account's task files are stored separately on the server.</p>
  {#each Object.entries(app.snapshot?.paths || {}) as [key,path]}<div>{key==='todo'?'TODO_FILE':key==='done'?'DONE_FILE':'INBOX_FILE'}<code class="path-display">{path}</code></div>{/each}
  <h3>Capture on your phone</h3><p>Start with <code>HOST=0.0.0.0 npm start</code>, then open <code>http://YOUR-LAN-IP:3000/capture</code> and sign in with Pocket ID.</p><p class="field-hint">Use HTTPS when accessing Haken over a network.</p>
  <p>Signed in as {app.user?.name}{#if app.user?.email} ({app.user.email}){/if}</p><a class="logout-link" href="/auth/logout">Sign out</a>
</div>
