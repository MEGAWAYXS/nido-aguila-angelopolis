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
import { weekDays } from './dates';
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
  days: { date: ISODate; cell: DayCell }[];
  summary: AbsenceSummary;
  eligibility: EligibilityResult;
  callUp?: CallUp;
  final: FinalStatus;
}

/** Filas del reporte semanal para los jugadores activos (opcionalmente de una categoría). */
export function buildReport(data: WeekData, weekStart: ISODate, today: ISODate, categoryId?: ID): ReportRow[] {
  const days = weekDays(weekStart);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  return data.players
    .filter((p) => p.active && (!categoryId || p.categoryId === categoryId))
    .map((player) => {
      const rule = resolveRule(data.rules, player.categoryId);
      const summary = summarizePlayerWeek(player, data.sessions, data.attendance, rule, weekStart, today);
      const callUp = data.callUps.find((c) => c.playerId === player.id && c.weekStart === weekStart);
      return {
        player,
        category: cats.get(player.categoryId),
        rule,
        days: days.map((date) => ({ date, cell: dayCell(player, date, data.sessions, data.attendance, rule, today) })),
        summary,
        eligibility: resolveEligibility(summary, data.exceptions, weekStart),
        callUp,
        final: finalStatus(callUp),
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
};

export const ELIGIBILITY_TEXT = { eligible: 'ELEGIBLE', eligible_alert: 'CON ALERTA', not_eligible: 'NO ELEGIBLE' } as const;

export function reportToCsv(rows: ReportRow[], weekStart: ISODate): string {
  const days = weekDays(weekStart);
  const header = ['#', 'Folio', 'Camiseta', 'Nombre completo', 'Categoría', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo', 'Total faltas', 'Fechas de falta', 'Elegibilidad', 'Excepción', 'Convocatoria final'];
  const lines = rows.map((r, i) => [
    i + 1,
    r.player.folio,
    r.player.jerseyNumber ?? '',
    r.player.fullName,
    r.category?.name ?? '',
    ...days.map((_, d) => {
      const c = r.days[d].cell;
      return c.kind === 'status' ? CELL_TEXT[c.status] : CELL_TEXT[c.kind];
    }),
    r.summary.absences,
    r.summary.absenceDates.join(' '),
    ELIGIBILITY_TEXT[r.eligibility.effective],
    r.eligibility.exception?.reason ?? '',
    r.final,
  ]);
  // BOM para que Excel reconozca UTF-8 (acentos).
  return '﻿' + [header, ...lines].map((l) => l.map(csvEscape).join(',')).join('\n');
}
