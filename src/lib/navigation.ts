export const views = [
  { id: 'all', label: 'All tasks', key: '1' },
  { id: 'kanban', label: 'Kanban', key: '2' },
  { id: 'inbox', label: 'Inbox', key: '3' },
  { id: 'today', label: 'Today', key: '4' },
  { id: 'upcoming', label: 'Upcoming', key: '5' },
  { id: 'completed', label: 'Completed', key: '6' },
  { id: 'archive', label: 'Archive', key: '7' }
] as const;
export type ViewId = typeof views[number]['id'];
export interface PaletteCommand {
  label: string;
  key: string;
  action: () => void;
}
