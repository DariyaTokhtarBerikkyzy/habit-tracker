// Даты хранятся строками YYYY-MM-DD; арифметика ведётся в UTC, чтобы не зависеть от часового пояса сервера.
// Дни недели: 0 = понедельник ... 6 = воскресенье.

const parse = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (dt: Date) => dt.toISOString().slice(0, 10);

export function isDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  try {
    return fmt(parse(s)) === s;
  } catch {
    return false;
  }
}

export function addDays(d: string, n: number): string {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
}

export const dow = (d: string) => (parse(d).getUTCDay() + 6) % 7;
export const weekStart = (d: string) => addDays(d, -dow(d));
export const utcToday = () => fmt(new Date());

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}
