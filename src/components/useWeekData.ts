import { addDays } from '../domain/dates';
import type { WeekData } from '../domain/report';
import type { ISODate } from '../domain/types';
import { dataService } from '../services';
import { useAsync } from './ui';

/** Carga todo lo necesario para calcular faltas y convocatorias de una semana. */
export function useWeekData(weekStart: ISODate) {
  return useAsync<WeekData>(async () => {
    const [categories, players, sessions, rules, exceptions, callUps] = await Promise.all([
      dataService.listCategories(),
      dataService.listPlayers(),
      dataService.listSessions(weekStart, addDays(weekStart, 6)),
      dataService.listRules(),
      dataService.listExceptions(weekStart),
      dataService.listCallUps(weekStart),
    ]);
    const attendance = await dataService.listAttendance(sessions.map((s) => s.id));
    return { categories, players, sessions, attendance, rules, exceptions, callUps };
  }, [weekStart]);
}
