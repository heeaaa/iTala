export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const pct = (made: number, att: number): string =>
  att === 0 ? '—' : `${Math.round((made / att) * 100)}%`;

// stat line shorthand like "22/9/5" (pts/reb/ast)
export const triple = (pts: number, reb: number, ast: number): string =>
  `${pts}/${reb}/${ast}`;

export const avg = (total: number, games: number, dp = 1): string =>
  games === 0 ? '0.0' : (total / games).toFixed(dp);

export const dateLabel = (ts?: number): string => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// Date + time, e.g. "Mar 8, 7:30 PM" — for individual game cards.
export const dateTimeLabel = (ts?: number): string => {
  if (!ts) return '';
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
};

// Stable local-day key (YYYY-MM-DD) for grouping games by date.
export const dayKey = (ts?: number): string => {
  const d = ts ? new Date(ts) : new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Friendly full date for a day header, e.g. "Sat, Mar 8".
export const dayLabel = (ts?: number): string => {
  if (!ts) return 'Unscheduled';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};
