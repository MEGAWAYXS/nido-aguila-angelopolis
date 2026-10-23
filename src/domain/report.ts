import {
  dayCell,
  finalStatus,
  resolveEligibility,
  resolveRule,
  summarizePlayerWeek,
  type AbsenceSummary,
  type DayCell,
  type EligibilityResult,
  type FinalStatus,
} from './absences';
import { isInWeek, weekDays } from './dates';
import type { AbsenceRule, Attendance, CallUp, Category, EligibilityException, ID, ISODate, Player, Session } from './types';

export interface WeekData {
  categories: Category[];
  players: Player[];
  sessions: Session[];
  attendance: Attendance[];
  rules: AbsenceRule[];
  exceptions: EligibilityException[];
  callUps: CallUp[];
}

export interface ReportRow {
  player: Player;
  category?: Category;
  rule: AbsenceRule;
  days: { date: ISODate; cell: ReportCell }[];
  summary: AbsenceSummary;
  eligibility: EligibilityResult;
  callUp?: CallUp;
  final: FinalStatus;
  /** Jugador archivado que aparece porque tuvo registros esa semana. */
  archived: boolean;
}

/** Celda del reporte: añade "sin registro" para jugadores archivados. */
export type ReportCell = DayCell | { kind: 'unrecorded' };

/**
 * Filas del reporte semanal: jugadores activos y, además, los archivados que
 * tuvieron algún registro de asistencia esa semana (para no alterar reportes pasados).
 */
export function buildReport(data: WeekData, weekStart: ISODate, today: ISODate, categoryId?: ID): ReportRow[] {
  const days = weekDays(weekStart);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const weekSessions = new Set(data.sessions.filter((s) => isInWeek(s.date, weekStart)).map((s) => s.id));
  const recorded = new Set(data.attendance.filter((a) => weekSessions.has(a.sessionId)).map((a) => a.playerId));
  return data.players
    .filter((p) => (p.active || recorded.has(p.id)) && (!categoryId || p.categoryId === categoryId))
    .map((player) => {
      const archived = !player.active;
      const rule = resolveRule(data.rules, player.categoryId);
      const raw = summarizePlayerWeek(player, data.sessions, data.attendance, rule, weekStart, today);
      // Un archivado no tiene registros pendientes: lo que falta es porque ya no estaba.
      const summary = archived ? { ...raw, pendingDates: [] } : raw;
      const callUp = data.callUps.find((c) => c.playerId === player.id && c.weekStart === weekStart);
      return {
        player,
        category: cats.get(player.categoryId),
        rule,
        days: days.map((date) => {
          const cell: ReportCell = dayCell(player, date, data.sessions, data.attendance, rule, today);
          return { date, cell: archived && cell.kind === 'pending' ? { kind: 'unrecorded' as const } : cell };
        }),
        summary,
        eligibility: resolveEligibility(summary, data.exceptions, weekStart),
        callUp,
        final: finalStatus(callUp),
        archived,
      };
    })
    .sort((a, b) => (a.player.jerseyNumber ?? 999) - (b.player.jerseyNumber ?? 999) || a.player.fullName.localeCompare(b.player.fullName));
}

function csvEscape(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CELL_TEXT: Record<string, string> = {
  present: 'PRESENTE',
  absent: 'AUSENTE',
  sick: 'ENFERMO',
  justified: 'JUSTIFICADO',
  pending: 'PENDIENTE',
  none: 'SIN ENTRENAMIENTO',
  cancelled: 'CANCELADA',
  future: 'PROGRAMADA',
  unrecorded: 'SIN REGISTRO',
};

export const ELIGIBILITY_TEXT = { eligible: 'ELEGIBLE', eligible_alert: 'CON ALERTA', not_eligible: 'NO ELEGIBLE' } as const;

export function reportToCsv(rows: ReportRow[], weekStart: ISODate): string {
  const days = weekDays(weekStart);
  const header = ['#', 'Folio', 'Camiseta', 'Nombre completo', 'Categoría', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo', 'Total faltas', 'Fechas de falta', 'Elegibilidad', 'Excepción', 'Convocatoria final'];
  const lines = rows.map((r, i) => [
    i + 1,
    r.player.folio,
    r.player.jerseyNumber ?? '',
    r.player.fullName + (r.archived ? ' (archivado)' : ''),
    r.category?.name ?? '',
    ...days.map((_, d) => {
      const c = r.days[d].cell;
      return c.kind === 'status' ? CELL_TEXT[c.status] : CELL_TEXT[c.kind];
    }),
    r.summary.absences,
    r.summary.absenceDates.join(' '),
    ELIGIBILITY_TEXT[r.eligibility.effective],
    r.eligibility.exception?.reason ?? '',
    r.archived && !r.callUp ? 'ARCHIVADO' : r.final,
  ]);
  // BOM para que Excel reconozca UTF-8 (acentos).
  return '﻿' + [header, ...lines].map((l) => l.map(csvEscape).join(',')).join('\n');
}
