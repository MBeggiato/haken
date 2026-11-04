export interface Task {
  raw: string; completed: boolean; priority: string; created: string; finished: string;
  body: string; projects: string[]; contexts: string[]; metadata: Record<string, string>; title: string;
}
const datePrefix = /^(\d{4}-\d{2}-\d{2})(?: |$)/;
export function parse(raw: string): Task {
  let body = raw;
  const completed = body.startsWith('x ');
  if (completed) body = body.slice(2);
  let finished = '', created = '', priority = '';
  if (completed && datePrefix.test(body)) { finished = body.slice(0, 10); body = body.slice(11); }
  const pri = /^\(([A-Z])\) /.exec(body);
  if (pri) { priority = pri[1]; body = body.slice(4); }
  if (datePrefix.test(body)) { created = body.slice(0, 10); body = body.slice(11); }
  const tokens = body.split(/\s+/);
  const metadata: Record<string, string> = Object.create(null);
  for (const token of tokens) { const m = /^([^\s:]+):([^\s:]+)$/.exec(token); if (m) metadata[m[1]] = m[2]; }
  return { raw, completed, priority, created, finished, body,
    projects: tokens.filter(t => /^\+\S+$/.test(t)).map(t => t.slice(1)),
    contexts: tokens.filter(t => /^@\S+$/.test(t)).map(t => t.slice(1)), metadata,
    title: tokens.filter(t => !/^([+@]\S+|[^\s:]+:[^\s:]+)$/.test(t)).join(' ') };
}
export function serialize(task: Task): string { return task.raw; }
export function setDescription(raw: string, title: string): string {
  if (/[\r\n\0]/.test(title)) throw new Error('Description must be a single line.');
  const t = parse(raw);
  const metadata = t.body.split(/\s+/).filter(token => /^([+@]\S+|[^\s:]+:[^\s:]+)$/.test(token));
  return raw.slice(0,raw.length-t.body.length) + [title.trim(),...metadata].filter(Boolean).join(' ');
}
export function setPriority(raw: string, priority: string): string {
  if (priority && !/^[A-Z]$/.test(priority)) throw new Error('Priority must be A–Z.');
  const t = parse(raw);
  const prefix = t.completed ? `x ${t.finished ? t.finished + ' ' : ''}` : '';
  const rest = raw.slice(prefix.length).replace(/^\([A-Z]\) /, '');
  return prefix + (priority ? `(${priority}) ` : '') + rest;
}
export function setTokens(raw: string, kind: string, values: string[]): string {
  if (values.some(v => /\s/.test(v))) throw new Error('Metadata values cannot contain spaces.');
  const match = (t: string) => kind === '+' || kind === '@' ? t.startsWith(kind) && t.length > 1 : t.startsWith(kind + ':') && /^[^:]+:[^:]+$/.test(t);
  // Keep every unrelated token and its whitespace exactly as it was.
  let result = raw.replace(/(^|\s+)(\S+)/g, (whole, _space: string, token: string) => match(token) ? '' : whole);
  const suffix = values.filter(Boolean).map(v => kind === '+' || kind === '@' ? kind + v : kind + ':' + v).join(' ');
  if (suffix) result += (result && !/\s$/.test(result) ? ' ' : '') + suffix;
  return result;
}
export function today(): string {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function addInterval(base: string, amount: number, unit: string): string {
  if (!validDate(base) || !Number.isSafeInteger(amount) || Math.abs(amount) > 10000) throw new Error('Invalid recurrence date or interval (maximum 10000).');
  const d = new Date(base + 'T12:00:00Z');
  if (unit === 'm' || unit === 'y') {
    const day = d.getUTCDate(); d.setUTCDate(1);
    if (unit === 'm') d.setUTCMonth(d.getUTCMonth() + amount); else d.setUTCFullYear(d.getUTCFullYear() + amount);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last));
  } else if (unit === 'b') {
    let left = Math.abs(amount); const direction = Math.sign(amount);
    while (left) { d.setUTCDate(d.getUTCDate() + direction); if (![0,6].includes(d.getUTCDay())) left--; }
  } else if (unit === 'd' || unit === 'w') d.setUTCDate(d.getUTCDate() + amount * (unit === 'w' ? 7 : 1));
  else throw new Error('Unknown recurrence unit.');
  const result = d.toISOString().slice(0,10);
  if (!validDate(result)) throw new Error('Date is outside the supported range.');
  return result;
}
export function incomplete(raw: string): string {
  return raw.replace(/^x (?:\d{4}-\d{2}-\d{2}(?: |$))?/, '');
}
export function complete(raw: string, date = today()): string[] {
  const t = parse(raw); if (t.completed) return [raw];
  const result = [`x ${date} ${raw}`];
  const rec = /^(\+)?([1-9]\d*)([dbwmy])$/.exec(t.metadata.rec || '');
  if (rec) {
    const base = rec[1] && validDate(t.metadata.due || '') ? t.metadata.due : date;
    const due = addInterval(base, Number(rec[2]), rec[3]);
    let next = setTokens(raw, 'due', [due]);
    if (validDate(t.metadata.t || '') && validDate(t.metadata.due || '')) {
      const offset = Math.round((Date.parse(t.metadata.t) - Date.parse(t.metadata.due)) / 86400000);
      next = setTokens(next, 't', [addInterval(due, offset, 'd')]);
    }
    if (t.created) next = next.replace(new RegExp(`^(\\([A-Z]\\) )?${t.created}`), (_m, p: string) => (p || '') + date);
    if (t.metadata.kanban === 'doing') next = setTokens(next, 'kanban', []);
    result.push(next);
  }
  return result;
}
export function natural(input: string, date = today()): string {
  let raw = input.trim();
  if (/\bhigh priority\b/i.test(raw)) { raw = raw.replace(/\bhigh priority\b/i, '').trim(); raw = setPriority(raw, 'A'); }
  let due = '';
  if (/\bevery month on the first\b/i.test(raw)) {
    raw = raw.replace(/\bevery month on the first\b/i, '').trim();
    due = addInterval(date.slice(0,8) + '01', 1, 'm'); raw = setTokens(raw, 'rec', ['+1m']);
  } else if (/\btomorrow\b/i.test(raw)) { raw = raw.replace(/\btomorrow\b/i, '').trim(); due = addInterval(date,1,'d'); }
  else if (/\btoday\b/i.test(raw)) { raw = raw.replace(/\btoday\b/i, '').trim(); due = date; }
  const day = /\bnext (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(raw);
  if (day) { const target = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(day[1].toLowerCase()); const current = new Date(date+'T12:00:00Z').getUTCDay(); due = addInterval(date, (target-current+7)%7 || 7, 'd'); raw = raw.replace(day[0], '').trim(); }
  if (due) raw = setTokens(raw, 'due', [due]);
  return raw;
}
export function matches(raw: string, query: string, date = today()): boolean {
  return query.trim().split(/\s+/).filter(Boolean).every(term => {
    const relative = /^due:([+-]\d+)([dwmyb])$/.exec(term);
    if (relative) { const due = parse(raw).metadata.due; try { return !!due && validDate(due) && due <= addInterval(date, Number(relative[1]), relative[2]); } catch { return false; } }
    return raw.toLowerCase().includes(term.toLowerCase());
  });
}
