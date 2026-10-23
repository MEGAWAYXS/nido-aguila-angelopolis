import type { ISODate } from './types';

// Todas las fechas de calendario se manejan como cadenas locales YYYY-MM-DD
// para evitar desfases de zona horaria.

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Lunes de la semana (lunes a domingo) que contiene la fecha. */
export function weekStartOf(s: ISODate): ISODate {
  const d = parseISODate(s);
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function weekDays(weekStart: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isInWeek(date: ISODate, weekStart: ISODate): boolean {
  return date >= weekStart && date <= addDays(weekStart, 6);
}

/** Edad en años cumplidos a una fecha de referencia. */
export function ageOn(birthDate: ISODate, ref: ISODate = todayISO()): number {
  const b = parseISODate(birthDate);
  const r = parseISODate(ref);
  let age = r.getFullYear() - b.getFullYear();
  const beforeBirthday =
    r.getMonth() < b.getMonth() || (r.getMonth() === b.getMonth() && r.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function dayShort(s: ISODate): string {
  return DAY_SHORT[(parseISODate(s).getDay() + 6) % 7];
}

export function formatDate(s: ISODate, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return parseISODate(s).toLocaleDateString('es-MX', opts);
}

export function formatWeek(weekStart: ISODate): string {
  const end = addDays(weekStart, 6);
  return `${formatDate(weekStart, { day: 'numeric', month: 'short' })} – ${formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** Convierte estatura escrita en m (1.48) o cm (148) a cm. */
export function normalizeHeightCm(value: number): number {
  return value > 0 && value < 3 ? Math.round(value * 100) : Math.round(value);
}
