import { describe, expect, it } from 'vitest';
import {
  dayCell,
  finalStatus,
  resolveEligibility,
  resolveRule,
  summarizePlayerWeek,
  validateRule,
} from './absences';
import type { AbsenceRule, Attendance, AttendanceStatus, EligibilityException, Player, Session } from './types';

const WEEK = '2026-10-19'; // lunes
const TODAY = '2026-10-22'; // jueves

const player: Player = {
  id: 'p1',
  folio: 'NAA-0001',
  fullName: 'Jugador Prueba',
  birthDate: '2014-03-14',
  categoryId: 'c1',
  active: true,
};

const globalRule: AbsenceRule = { id: 'r0', categoryId: null, yellowFrom: 1, redFrom: 3, countSick: false, countJustified: false };

function session(id: string, date: string, status: Session['status'] = 'done', categoryId = 'c1'): Session {
  return { id, categoryId, date, startTime: '17:00', type: 'training', status };
}

function att(sessionId: string, status: AttendanceStatus, extra: Partial<Attendance> = {}): Attendance {
  return { id: `a-${sessionId}`, sessionId, playerId: 'p1', status, justificationApproved: false, updatedAt: '2026-10-22T10:00:00Z', ...extra };
}

const sessions = [
  session('s1', '2026-10-19'),
  session('s2', '2026-10-20'),
  session('s3', '2026-10-21'),
  session('s4', '2026-10-22'),
];

describe('cálculo de faltas', () => {
  it('cero faltas → verde', () => {
    const a = sessions.map((s) => att(s.id, 'present'));
    const r = summarizePlayerWeek(player, sessions, a, globalRule, WEEK, TODAY);
    expect(r.absences).toBe(0);
    expect(r.level).toBe('green');
  });

  it('una falta → amarillo, con su fecha', () => {
    const a = [att('s1', 'absent'), att('s2', 'present'), att('s3', 'present'), att('s4', 'present')];
    const r = summarizePlayerWeek(player, sessions, a, globalRule, WEEK, TODAY);
    expect(r.absences).toBe(1);
    expect(r.absenceDates).toEqual(['2026-10-19']);
    expect(r.level).toBe('yellow');
  });

  it('tres faltas → rojo', () => {
    const a = [att('s1', 'absent'), att('s2', 'absent'), att('s3', 'absent'), att('s4', 'present')];
    const r = summarizePlayerWeek(player, sessions, a, globalRule, WEEK, TODAY);
    expect(r.absences).toBe(3);
    expect(r.level).toBe('red');
  });

  it('ENFERMO y MOTIVO JUSTIFICADO no cuentan por defecto', () => {
    const a = [att('s1', 'sick'), att('s2', 'justified'), att('s3', 'present'), att('s4', 'present')];
    const r = summarizePlayerWeek(player, sessions, a, globalRule, WEEK, TODAY);
    expect(r.absences).toBe(0);
  });

  it('AUSENTE con justificación aprobada no cuenta', () => {
    const a = [att('s1', 'absent', { justificationApproved: true }), att('s2', 'present'), att('s3', 'present'), att('s4', 'present')];
    expect(summarizePlayerWeek(player, sessions, a, globalRule, WEEK, TODAY).absences).toBe(0);
  });

  it('si la regla lo indica, ENFERMO sí cuenta', () => {
    const rule = { ...globalRule, countSick: true };
    const a = [att('s1', 'sick'), att('s2', 'present'), att('s3', 'present'), att('s4', 'present')];
    expect(summarizePlayerWeek(player, sessions, a, rule, WEEK, TODAY).absences).toBe(1);
  });

  it('los registros pendientes nunca son falta y quedan para revisión', () => {
    const a = [att('s1', 'present')];
    const r = summarizePlayerWeek(player, sessions, a, globalRule, WEEK, TODAY);
    expect(r.absences).toBe(0);
    expect(r.pendingDates).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
  });

  it('sesiones canceladas y futuras no generan faltas ni pendientes', () => {
    const s = [session('s1', '2026-10-19', 'cancelled'), session('s5', '2026-10-24', 'scheduled')];
    const a = [att('s1', 'absent'), att('s5', 'absent')];
    const r = summarizePlayerWeek(player, s, a, globalRule, WEEK, TODAY);
    expect(r.absences).toBe(0);
    expect(r.pendingDates).toEqual([]);
  });

  it('sesiones de otra categoría u otra semana no cuentan', () => {
    const s = [session('x1', '2026-10-19', 'done', 'c2'), session('x2', '2026-10-12')];
    const a = [att('x1', 'absent'), att('x2', 'absent')];
    expect(summarizePlayerWeek(player, s, a, globalRule, WEEK, TODAY).absences).toBe(0);
  });

  it('registros duplicados de la misma sesión cuentan una sola vez (gana el más reciente)', () => {
    const a = [
      att('s1', 'absent', { id: 'old', updatedAt: '2026-10-19T10:00:00Z' }),
      att('s1', 'present', { id: 'new', updatedAt: '2026-10-19T12:00:00Z' }),
    ];
    expect(summarizePlayerWeek(player, [sessions[0]], a, globalRule, WEEK, TODAY).absences).toBe(0);
  });

  it('corregir un registro actualiza el cálculo', () => {
    const a = [att('s1', 'absent')];
    expect(summarizePlayerWeek(player, [sessions[0]], a, globalRule, WEEK, TODAY).absences).toBe(1);
    a[0] = { ...a[0], status: 'justified' };
    expect(summarizePlayerWeek(player, [sessions[0]], a, globalRule, WEEK, TODAY).absences).toBe(0);
  });
});

describe('umbrales configurables', () => {
  it('la regla de categoría tiene prioridad sobre la global', () => {
    const catRule: AbsenceRule = { ...globalRule, id: 'r1', categoryId: 'c1', yellowFrom: 2, redFrom: 4 };
    expect(resolveRule([globalRule, catRule], 'c1')).toBe(catRule);
    expect(resolveRule([globalRule, catRule], 'c2')).toBe(globalRule);
  });

  it('cambiar los umbrales cambia el resultado', () => {
    const a = [att('s1', 'absent'), att('s2', 'absent'), att('s3', 'absent'), att('s4', 'present')];
    const strict = summarizePlayerWeek(player, sessions, a, globalRule, WEEK, TODAY);
    const lenient = summarizePlayerWeek(player, sessions, a, { ...globalRule, yellowFrom: 2, redFrom: 4 }, WEEK, TODAY);
    expect(strict.level).toBe('red');
    expect(lenient.level).toBe('yellow');
    const oneAbs = [att('s1', 'absent')];
    expect(summarizePlayerWeek(player, [sessions[0]], oneAbs, { ...globalRule, yellowFrom: 2, redFrom: 4 }, WEEK, TODAY).level).toBe('green');
  });

  it('valida umbrales incoherentes', () => {
    expect(validateRule({ yellowFrom: 1, redFrom: 3 })).toBeNull();
    expect(validateRule({ yellowFrom: 3, redFrom: 3 })).not.toBeNull();
    expect(validateRule({ yellowFrom: 0, redFrom: 3 })).not.toBeNull();
  });
});

describe('elegibilidad y convocatoria', () => {
  const red = { playerId: 'p1', absences: 3, absenceDates: [], pendingDates: [], level: 'red' as const };

  it('una excepción autorizada sustituye al cálculo y conserva el cálculo original', () => {
    const ex: EligibilityException = { id: 'e1', playerId: 'p1', weekStart: WEEK, decision: 'eligible', reason: 'Lesión acreditada', createdAt: '2026-10-22T10:00:00Z', revoked: false };
    const r = resolveEligibility(red, [ex], WEEK);
    expect(r.computed).toBe('not_eligible');
    expect(r.effective).toBe('eligible');
  });

  it('las excepciones revocadas o de otra semana se ignoran', () => {
    const ex: EligibilityException = { id: 'e1', playerId: 'p1', weekStart: WEEK, decision: 'eligible', reason: 'x', createdAt: '2026-10-22', revoked: true };
    const other = { ...ex, id: 'e2', revoked: false, weekStart: '2026-10-12' };
    expect(resolveEligibility(red, [ex, other], WEEK).effective).toBe('not_eligible');
  });

  it('sin convocatoria confirmada → PENDIENTE DE REVISIÓN', () => {
    expect(finalStatus(undefined)).toBe('PENDIENTE DE REVISIÓN');
    expect(finalStatus({ id: 'c', playerId: 'p1', weekStart: WEEK, status: 'called', confirmedAt: '' })).toBe('CONVOCADO');
    expect(finalStatus({ id: 'c', playerId: 'p1', weekStart: WEEK, status: 'not_called', confirmedAt: '' })).toBe('DESCONVOCADO');
  });
});

describe('celdas del reporte semanal', () => {
  it('distingue sin entrenamiento, cancelada, futura, pendiente y estatus', () => {
    const s = [
      session('s1', '2026-10-19'),
      session('s2', '2026-10-20'),
      session('s3', '2026-10-21', 'cancelled'),
      session('s5', '2026-10-24', 'scheduled'),
    ];
    const a = [att('s1', 'sick')];
    expect(dayCell(player, '2026-10-19', s, a, globalRule, TODAY)).toMatchObject({ kind: 'status', status: 'sick', computable: false });
    expect(dayCell(player, '2026-10-20', s, a, globalRule, TODAY).kind).toBe('pending');
    expect(dayCell(player, '2026-10-21', s, a, globalRule, TODAY).kind).toBe('cancelled');
    expect(dayCell(player, '2026-10-23', s, a, globalRule, TODAY).kind).toBe('none');
    expect(dayCell(player, '2026-10-24', s, a, globalRule, TODAY).kind).toBe('future');
  });
});
