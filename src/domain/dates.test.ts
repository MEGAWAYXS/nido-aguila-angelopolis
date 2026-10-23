import { describe, expect, it } from 'vitest';
import { addDays, ageOn, isInWeek, normalizeHeightCm, weekDays, weekStartOf } from './dates';

describe('fechas', () => {
  it('calcula la edad en años cumplidos', () => {
    expect(ageOn('2014-03-14', '2026-10-22')).toBe(12);
    expect(ageOn('2014-10-22', '2026-10-22')).toBe(12); // cumple hoy
    expect(ageOn('2014-10-23', '2026-10-22')).toBe(11); // cumple mañana
    expect(ageOn('2012-02-29', '2026-02-28')).toBe(13);
  });

  it('las semanas van de lunes a domingo', () => {
    expect(weekStartOf('2026-10-22')).toBe('2026-10-19'); // jueves → lunes
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19'); // domingo → mismo lunes
    expect(weekStartOf('2026-10-26')).toBe('2026-10-26'); // lunes
    expect(weekDays('2026-10-19')).toHaveLength(7);
    expect(weekDays('2026-10-19')[6]).toBe('2026-10-25');
  });

  it('cambia de semana y de mes correctamente', () => {
    expect(addDays('2026-10-26', -7)).toBe('2026-10-19');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(isInWeek('2026-10-25', '2026-10-19')).toBe(true);
    expect(isInWeek('2026-10-26', '2026-10-19')).toBe(false);
  });

  it('acepta estatura en m o cm', () => {
    expect(normalizeHeightCm(1.48)).toBe(148);
    expect(normalizeHeightCm(148)).toBe(148);
  });
});
