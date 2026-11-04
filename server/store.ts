import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { columns, moveToColumn } from '../src/lib/kanban.ts';
import { complete, incomplete, parse } from '../src/lib/todo.ts';
import type { Action, FileKey, Snapshot } from '../src/lib/types.ts';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export function atomic(path: string, text: string) {
  const temp = path + '.' + randomUUID() + '.tmp';
  let fd: number | undefined;
  try {
    fd = openSync(temp, 'wx', existsSync(path) ? statSync(path).mode & 0o777 : 0o600);
    writeFileSync(fd, text, 'utf8'); fsyncSync(fd); closeSync(fd); fd = undefined; renameSync(temp, path);
  } finally { if (fd !== undefined) closeSync(fd); if (existsSync(temp)) unlinkSync(temp); }
}
interface Line { raw: string; eol: string }
export function split(text: string): Line[] {
  return [...text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)].filter(m => m[0] !== '').map(m => ({raw: m[1], eol: m[2]}));
}
const join = (lines: Line[]) => lines.map(l => l.raw+l.eol).join('');
const keys: FileKey[] = ['todo','done','inbox'];
type Contents = Record<FileKey, string>;
export class Store {
  paths: Record<FileKey, string>;
  private history: {before: Contents; after: string}[] = [];
  private journal: string;
  constructor(paths: Record<FileKey, string>) {
    this.paths = Object.fromEntries(keys.map(k => [k, resolve(paths[k])])) as Record<FileKey, string>;
    if (new Set(Object.values(this.paths)).size !== 3) throw new Error('TODO_FILE, DONE_FILE and INBOX_FILE must be different files.');
    this.journal = this.paths.todo + '.transaction.json';
    if (existsSync(this.journal)) throw new Error(`Interrupted transaction: inspect ${this.journal} before restarting. It contains the before/after copies. Reconcile files, then remove the journal.`);
    for (const path of Object.values(this.paths)) { mkdirSync(dirname(path), { recursive: true }); if (!existsSync(path)) writeFileSync(path, '', { flag: 'wx', mode: 0o600 }); }
  }
  private read(): Contents { return Object.fromEntries(keys.map(k => [k, readFileSync(this.paths[k], 'utf8')])) as Contents; }
  private revision(contents: Contents) { return hash(JSON.stringify(contents)); }
  snapshot(): Snapshot {
    const content = this.read(), revision = this.revision(content);
    if (this.history.length && this.history.at(-1)!.after !== revision) this.history = [];
    return { revision, files: Object.fromEntries(keys.map(k => [k, split(content[k]).flatMap((l,id) => l.raw.trim() ? [{id,raw:l.raw}] : [])])) as Snapshot['files'], undo: this.history.length, paths: this.paths };
  }
  apply(revision: string, action: Action): Snapshot {
    const before = this.read();
    if (revision !== this.revision(before)) throw new HttpError(409, 'Files changed. Your edit was not saved. Review the refreshed list and try again.');
    if (this.history.length && this.history.at(-1)!.after !== revision) this.history = [];
    if (action.type === 'undo') {
      const previous = this.history.at(-1); if (!previous) throw new HttpError(400, 'Nothing to undo.');
      this.commit(before, previous.before); this.history.pop(); return this.snapshot();
    }
    const file = action.file || 'todo';
    if (!keys.includes(file)) throw new HttpError(400, 'Unknown file.');
    const lines = Object.fromEntries(keys.map(k => [k, split(before[k])])) as Record<FileKey, Line[]>;
    const list = lines[file];
    const ids = [...new Set(action.ids || [])];
    if (ids.some(id => !Number.isInteger(id) || !list[id] || !list[id].raw.trim())) throw new HttpError(400, 'Invalid task selection.');
    const append = (key: FileKey, raw: string) => {
      const target = lines[key], eol = target.find(l => l.eol)?.eol || '\n';
      if (target.length && !target.at(-1)!.eol) target.at(-1)!.eol = eol;
      target.push({raw, eol});
    };
    const remove = (selected: number[]) => { lines[file] = list.filter((_, i) => !selected.includes(i)); };
    const validRaw = () => {
      if (typeof action.raw !== 'string' || !action.raw.trim() || /[\r\n\0]/.test(action.raw) || action.raw.length > 20000) throw new HttpError(400, 'Enter one task line (up to 20,000 characters).');
      return action.raw;
    };
    switch (action.type) {
      case 'add': append(file, validRaw()); break;
      case 'edit': if (ids.length !== 1) throw new HttpError(400,'Select one task.'); list[ids[0]].raw = validRaw(); break;
      case 'delete': remove(ids); break;
      case 'duplicate': for (const id of ids) append(file, incomplete(list[id].raw)); break;
      case 'toggle': case 'complete':
        if (file === 'done') throw new HttpError(400, 'Restore archived tasks first.');
        for (const id of ids) {
          const raw = list[id].raw;
          if (parse(raw).completed) { if (action.type === 'toggle') list[id].raw = incomplete(raw); }
          else { const [done, next] = complete(raw); list[id].raw = done; if (next) append(file, next); }
        } break;
      case 'kanban': {
        if (file !== 'todo' || !columns.some(c => c.id === action.column) || !ids.length) {
          throw new HttpError(400, 'Select main-file tasks and a valid Kanban column.');
        }
        for (const id of ids) {
          const [updated, next] = moveToColumn(list[id].raw, action.column!);
          list[id].raw = updated;
          if (next) append(file, next);
        }
        break;
      }
      case 'move': {
        if (ids.length !== 1 || ![-1,1].includes(action.direction || 0)) throw new HttpError(400, 'Select one task and a direction.');
        const index = ids[0], other = index + action.direction!;
        if (other >= 0 && other < list.length) [list[index].raw,list[other].raw] = [list[other].raw,list[index].raw];
        break;
      }
      case 'archive': {
        if (file !== 'todo') throw new HttpError(400,'Archive from All tasks.');
        const selected = list.flatMap((l,i) => parse(l.raw).completed ? [i] : []);
        for (const id of selected) append('done',list[id].raw); remove(selected); break;
      }
      case 'restore': case 'import': {
        if (file !== (action.type === 'restore' ? 'done' : 'inbox')) throw new HttpError(400,'Wrong source file.');
        for (const id of ids) append('todo',action.type === 'restore' ? incomplete(list[id].raw) : list[id].raw);
        remove(ids); break;
      }
      default: throw new HttpError(400,'Unknown action.');
    }
    const after = Object.fromEntries(keys.map(k => [k,join(lines[k])])) as Contents;
    if (this.revision(after) !== revision) {
      const order: FileKey[] = action.type === 'archive' ? ['done','todo','inbox'] : ['todo','done','inbox'];
      this.commit(before, after, order);
      this.history.push({before,after:this.revision(after)}); if (this.history.length > 50) this.history.shift();
    }
    return this.snapshot();
  }
  private commit(before: Contents, after: Contents, order: FileKey[] = keys) {
    if (existsSync(this.journal)) throw new HttpError(409, 'A transaction needs recovery. Restart after inspecting the journal.');
    if (this.revision(this.read()) !== this.revision(before)) throw new HttpError(409,'Files changed before save. Reload and retry.');
    writeFileSync(this.journal, JSON.stringify({ paths: this.paths, before, after }, null, 2), {flag:'wx',mode:0o600});
    let wrote = false;
    try {
      for (const key of order) if (before[key] !== after[key]) {
        if (readFileSync(this.paths[key],'utf8') !== before[key]) throw new HttpError(409,'An external edit interrupted saving. Recovery copies are in the transaction journal.');
        // shortcut: external writers can race this check/rename; require a shared writer protocol for simultaneous saves.
        atomic(this.paths[key], after[key]); wrote = true;
      }
      unlinkSync(this.journal);
    } catch (e) { if (!wrote) unlinkSync(this.journal); throw e; }
  }
}
