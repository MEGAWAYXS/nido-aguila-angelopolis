import { isInWeek } from './dates';
import type {
  AbsenceRule,
  Attendance,
  CallUp,
  EligibilityException,
  ID,
  ISODate,
  Player,
  Session,
} from './types';

export const DEFAULT_RULE: Omit<AbsenceRule, 'id'> = {
  categoryId: null,
  yellowFrom: 1,
  redFrom: 3,
  countSick: false,
  countJustified: false,
};

/** La regla de la categoría tiene prioridad sobre la global. */
export function resolveRule(rules: AbsenceRule[], categoryId: ID): AbsenceRule {
  return (
    rules.find((r) => r.categoryId === categoryId) ??
    rules.find((r) => r.categoryId === null) ?? { id: 'default', ...DEFAULT_RULE }
  );
}

export function validateRule(rule: Pick<AbsenceRule, 'yellowFrom' | 'redFrom'>): string | null {
  if (!Number.isInteger(rule.yellowFrom) || !Number.isInteger(rule.redFrom)) return 'Los umbrales deben ser números enteros.';
  if (rule.yellowFrom < 1) return 'La alerta amarilla debe empezar en 1 falta o más.';
  if (rule.redFrom <= rule.yellowFrom) return 'El umbral rojo debe ser mayor que el amarillo.';
  return null;
}

/** ¿Este registro cuenta como falta según la regla? */
export function isComputableAbsence(a: Attendance, rule: AbsenceRule): boolean {
  switch (a.status) {
    case 'absent':
      return !a.justificationApproved;
    case 'sick':
      return rule.countSick;
    case 'justified':
      return rule.countJustified;
    default:
      return false;
  }
}

/**
 * Sesiones que pueden generar faltas: de la categoría, dentro de la semana,
 * no canceladas y no futuras.
 */
export function countableSessions(sessions: Session[], categoryId: ID, weekStart: ISODate, today: ISODate): Session[] {
  return sessions.filter(
    (s) => s.categoryId === categoryId && isInWeek(s.date, weekStart) && s.status !== 'cancelled' && s.date <= today,
  );
}

export type Level = 'green' | 'yellow' | 'red';

export interface AbsenceSummary {
  playerId: ID;
  absences: number;
  /** Fechas (con sesión) que generan falta. */
  absenceDates: ISODate[];
  /** Sesiones pasadas sin registro: quedan pendientes de revisión, nunca son falta. */
  pendingDates: ISODate[];
  level: Level;
}

export function levelFor(absences: number, rule: AbsenceRule): Level {
  if (absences >= rule.redFrom) return 'red';
  if (absences >= rule.yellowFrom) return 'yellow';
  return 'green';
}

export function summarizePlayerWeek(
  player: Player,
  sessions: Session[],
  attendance: Attendance[],
  rule: AbsenceRule,
  weekStart: ISODate,
  today: ISODate,
): AbsenceSummary {
  const relevant = countableSessions(sessions, player.categoryId, weekStart, today);
  const bySession = new Map<ID, Attendance>();
  // Un registro por jugador y sesión: si llegaran duplicados, gana el más reciente.
  for (const a of attendance) {
    if (a.playerId !== player.id) continue;
    const prev = bySession.get(a.sessionId);
    if (!prev || a.updatedAt > prev.updatedAt) bySession.set(a.sessionId, a);
  }
  const absenceDates: ISODate[] = [];
  const pendingDates: ISODate[] = [];
  for (const s of relevant) {
    const a = bySession.get(s.id);
    if (!a) pendingDates.push(s.date);
    else if (isComputableAbsence(a, rule)) absenceDates.push(s.date);
  }
  absenceDates.sort();
  pendingDates.sort();
  return {
    playerId: player.id,
    absences: absenceDates.length,
    absenceDates,
    pendingDates,
    level: levelFor(absenceDates.length, rule),
  };
}

export type Eligibility = 'eligible' | 'eligible_alert' | 'not_eligible';

export interface EligibilityResult {
  computed: Eligibility;
  /** Excepción vigente, si la hay; sustituye al cálculo. */
  exception?: EligibilityException;
  effective: Eligibility;
}

export function eligibilityFromLevel(level: Level): Eligibility {
  return level === 'green' ? 'eligible' : level === 'yellow' ? 'eligible_alert' : 'not_eligible';
}

export function resolveEligibility(summary: AbsenceSummary, exceptions: EligibilityException[], weekStart: ISODate): EligibilityResult {
  const computed = eligibilityFromLevel(summary.level);
  const exception = exceptions
    .filter((e) => e.playerId === summary.playerId && e.weekStart === weekStart && !e.revoked)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const effective: Eligibility = exception ? (exception.decision === 'eligible' ? 'eligible' : 'not_eligible') : computed;
  return { computed, exception, effective };
}

export type FinalStatus = 'CONVOCADO' | 'DESCONVOCADO' | 'PENDIENTE DE REVISIÓN';

/**
 * La convocatoria oficial la confirma el personal. Mientras no exista, o si
 * hay registros pendientes sin confirmación, el estatus es PENDIENTE DE REVISIÓN.
 */
export function finalStatus(callUp: CallUp | undefined): FinalStatus {
  if (!callUp) return 'PENDIENTE DE REVISIÓN';
  return callUp.status === 'called' ? 'CONVOCADO' : 'DESCONVOCADO';
}

export type DayCell =
  | { kind: 'none' }
  | { kind: 'cancelled' }
  | { kind: 'future' }
  | { kind: 'pending' }
  | { kind: 'status'; status: Attendance['status']; computable: boolean; reason?: string };

/** Celda del reporte semanal para un jugador y un día. */
export function dayCell(
  player: Player,
  date: ISODate,
  sessions: Session[],
  attendance: Attendance[],
  rule: AbsenceRule,
  today: ISODate,
): DayCell {
  const daySessions = sessions.filter((s) => s.categoryId === player.categoryId && s.date === date);
  if (daySessions.length === 0) return { kind: 'none' };
  const active = daySessions.filter((s) => s.status !== 'cancelled');
  if (active.length === 0) return { kind: 'cancelled' };
  if (date > today) return { kind: 'future' };
  // Si hay varias sesiones el mismo día se muestra la peor situación.
  let pending = false;
  let best: DayCell | null = null;
  const rank = { absent: 4, sick: 3, justified: 2, present: 1 } as const;
  for (const s of active) {
    const a = attendance.find((x) => x.sessionId === s.id && x.playerId === player.id);
    if (!a) {
      pending = true;
      continue;
    }
    const cell: DayCell = { kind: 'status', status: a.status, computable: isComputableAbsence(a, rule), reason: a.reason };
    if (!best || (best.kind === 'status' && rank[a.status] > rank[best.status])) best = cell;
  }
  if (best && best.kind === 'status' && best.computable) return best;
  if (pending) return { kind: 'pending' };
  return best ?? { kind: 'pending' };
}
