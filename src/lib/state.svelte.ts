import type { Snapshot, Action, Preferences } from './types';
import { defaults } from './types';
function preferences(): Preferences {
  try { const p = JSON.parse(localStorage.getItem('tuxedo.preferences') || '{}'); const sort=p.sort==='priority'?'priority-asc':p.sort==='due'?'due-asc':p.sort; return {theme:p.theme === 'dark' ? 'dark':'light',density:p.density === 'compact'?'compact':'comfortable',sort:['file','priority-asc','priority-desc','due-asc','due-desc','created'].includes(sort)?sort:'file',metadata:p.metadata !== false,hideFuture:p.hideFuture === true,saved:Array.isArray(p.saved)?p.saved.filter((s: {name?:unknown;query?:unknown})=>typeof s.name==='string' && typeof s.query==='string'):[]}; } catch {return {...defaults};}
}
export const app = $state({ snapshot: null as Snapshot|null, user:null as {name:string;email:string}|null, authReady:false, preferences:preferences(), busy:false, message:'', error:'', connected:false, draftDirty:false });
export function persistPreferences() { localStorage.setItem('tuxedo.preferences',JSON.stringify(app.preferences)); }
export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch('/api/'+path,{method:body === undefined?'GET':'POST',credentials:'same-origin',headers:body === undefined?{}:{'Content-Type':'application/json'},body:body === undefined?undefined:JSON.stringify(body)});
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed.'); return data as T;
}
export async function refresh() {
  if (app.busy) return;
  try {
    const session = await fetch('/api/session',{credentials:'same-origin'}).then(response=>response.json()) as {authenticated:boolean;user?:{name:string;email:string}};
    app.authReady = true;
    if (!session.authenticated) { app.user=null; app.snapshot=null; app.connected=false; return; }
    app.user=session.user || null;
    app.error='';
    const previous = app.snapshot?.revision;
    const next = await request<Snapshot>('state');
    if (app.busy || app.snapshot?.revision !== previous) return;
    if (app.snapshot && next.revision !== app.snapshot.revision) app.message = 'Files changed on disk. List refreshed; open drafts are preserved.';
    app.snapshot = next; app.connected = true;
  } catch (e) { app.authReady=true; app.connected = false; app.error = (e as Error).message; }
}
export async function act(action: Action, revision = app.snapshot?.revision): Promise<boolean> {
  if (app.busy || !revision) return false;
  app.busy = true; app.error = ''; app.message = '';
  try { app.snapshot = await request<Snapshot>('action',{revision,action}); app.message = action.type === 'undo' ? 'Change undone.' : 'Saved to disk.'; return true; }
  catch(e) { app.error = (e as Error).message; return false; }
  finally { app.busy = false; }
}
