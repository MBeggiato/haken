import { complete, incomplete, parse, setTokens, today } from './todo';

export const columns = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'done', label: 'Done' }
] as const;
export type Column = typeof columns[number]['id'];

export function columnFor(raw: string): Column {
  const task = parse(raw);
  return task.completed ? 'done' : task.metadata.kanban === 'doing' ? 'doing' : 'todo';
}

export function moveToColumn(raw: string, column: Column, date = today()): string[] {
  if (columnFor(raw) === column) return [raw];
  if (column === 'done') return complete(raw, date);
  return [setTokens(incomplete(raw), 'kanban', [column])];
}
