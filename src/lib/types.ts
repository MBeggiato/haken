import type { Column } from './kanban';
export type FileKey = 'todo' | 'done' | 'inbox';
export interface Row { id: number; raw: string }
export interface Snapshot { revision: string; files: Record<FileKey, Row[]>; undo: number; paths: Record<FileKey, string> }
export interface Action { type: 'add'|'edit'|'delete'|'toggle'|'complete'|'duplicate'|'move'|'archive'|'restore'|'import'|'undo'|'kanban'; file?: FileKey; ids?: number[]; raw?: string; direction?: number; column?: Column }
export interface Preferences { theme: 'light'|'dark'; density: 'comfortable'|'compact'; sort: string; metadata: boolean; hideFuture: boolean; saved: { name: string; query: string }[] }
export const defaults: Preferences = { theme: 'light', density: 'comfortable', sort: 'file', metadata: true, hideFuture: false, saved: [] };
