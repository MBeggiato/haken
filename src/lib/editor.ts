import { addInterval, parse, setDescription, setPriority, setTokens, today, validDate } from './todo';

export type EditField = 'due' | 'priority' | 'projects' | 'contexts' | 'title';

export function editField(raw: string, field: EditField, value: string, date = today()): string {
  const text = value.trim();
  if (field === 'title') {
    if (!text) throw new Error('Task text cannot be empty.');
    return setDescription(raw, text);
  }
  if (field === 'priority') return setPriority(raw, text === '-' ? '' : text.toUpperCase());
  if (field === 'projects' || field === 'contexts') {
    const prefix = field === 'projects' ? '+' : '@';
    const tags = text === '-' ? [] : text.split(/\s+/).filter(Boolean).map(t => t.startsWith(prefix) ? t.slice(1) : t);
    if (tags.some(t => !t || /^[+@]/.test(t))) throw new Error(`Use space-separated ${field}, with or without ${prefix}.`);
    return setTokens(raw, prefix, [...new Set(tags)]);
  }
  let due = text.toLowerCase();
  if (!due || due === '-') return setTokens(raw, 'due', []);
  if (due === 'today') due = date;
  else if (due === 'tomorrow') due = addInterval(date, 1, 'd');
  else {
    const relative = /^([+-]\d+)([dbwmy])$/.exec(due);
    if (relative) {
      const current = parse(raw).metadata.due;
      due = addInterval(validDate(current || '') ? current : date, Number(relative[1]), relative[2]);
    }
  }
  if (!validDate(due)) throw new Error('Use YYYY-MM-DD, today, tomorrow, +3d, -1w, or - to remove the due date.');
  return setTokens(raw, 'due', [due]);
}
