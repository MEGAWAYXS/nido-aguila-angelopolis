import { describe, expect, it } from 'vitest';
import { addDays, ageOn, todayISO, weekStartOf } from '../../domain/dates';
import { buildReport, reportToCsv, type WeekData } from '../../domain/report';
import type { DataService } from '../DataService';
import { DemoService } from './DemoService';

// Flujo completo contra la capa de servicios (mismo contrato que Supabase).

async function loadWeek(ds: DataService, week: string): Promise<WeekData> {
  const [categories, players, sessions, rules, exceptions, callUps] = await Promise.all([
    ds.listCategories(), ds.listPlayers(), ds.listSessions(week, addDays(week, 6)), ds.listRules(), ds.listExceptions(week), ds.listCallUps(week),
  ]);
  const attendance = await ds.listAttendance(sessions.map((s) => s.id));
  return { categories, players, sessions, attendance, rules, exceptions, callUps };
}

describe('flujo de la academia (modo demo)', async () => {
  const ds = new DemoService();
  await ds.signIn();
  const today = todayISO();
  const week = weekStartOf(today);
  const monday = week;

  // Escenario aislado: categoría y sesiones propias, pasadas respecto a "hoy" de la prueba.
  const cat = await ds.saveCategory({ name: 'Prueba', season: '2026–27', status: 'active' });
  const s = await Promise.all(
    [0, 1, 2].map((i) => ds.saveSession({ categoryId: cat.id, date: addDays(monday, i), startTime: '17:00', type: 'training', status: 'done' })),
  );
  const reportToday = addDays(monday, 6); // domingo: todas las sesiones de la semana ya pasaron

  it('1. crea y edita categorías', async () => {
    const edited = await ds.saveCategory({ ...cat, name: 'Prueba Sub-11', coachName: 'Coach X' });
    expect(edited.name).toBe('Prueba Sub-11');
    expect((await ds.listCategories()).find((c) => c.id === cat.id)?.coachName).toBe('Coach X');
    await ds.saveCategory({ ...edited, status: 'archived' });
    expect((await ds.listCategories()).find((c) => c.id === cat.id)?.status).toBe('archived');
    await ds.saveCategory({ ...edited, status: 'active' });
  });

  it('2. crea jugadores con folio único y calcula la edad', async () => {
    const p = await ds.savePlayer({ fullName: 'Jugador Uno', birthDate: '2014-03-14', categoryId: cat.id, active: true, jerseyNumber: 7 });
    expect(p.folio).toMatch(/^NAA-\d{4}$/);
    expect(ageOn(p.birthDate, '2026-10-22')).toBe(12);
    await expect(ds.savePlayer({ fullName: 'Duplicado', birthDate: '2014-01-01', categoryId: cat.id, active: true, folio: p.folio })).rejects.toThrow(/folio/);
  });

  it('3–5. registra los cuatro estados; 0, 1 y 3 faltas; pendientes y canceladas no cuentan', async () => {
    const mk = (name: string) => ds.savePlayer({ fullName: name, birthDate: '2014-05-01', categoryId: cat.id, active: true });
    const [zero, one, three, mixed, pend] = await Promise.all([mk('Cero'), mk('Una'), mk('Tres'), mk('Mixto'), mk('Pendiente')]);
    await ds.saveAttendance([
      ...s.map((x) => ({ sessionId: x.id, playerId: zero.id, status: 'present' as const })),
      { sessionId: s[0].id, playerId: one.id, status: 'absent' },
      { sessionId: s[1].id, playerId: one.id, status: 'present' },
      { sessionId: s[2].id, playerId: one.id, status: 'present' },
      ...s.map((x) => ({ sessionId: x.id, playerId: three.id, status: 'absent' as const })),
      { sessionId: s[0].id, playerId: mixed.id, status: 'sick', reason: 'Gripe' },
      { sessionId: s[1].id, playerId: mixed.id, status: 'justified', reason: 'Escuela' },
      { sessionId: s[2].id, playerId: mixed.id, status: 'absent', justificationApproved: true },
      { sessionId: s[0].id, playerId: pend.id, status: 'present' },
    ]);
    const rows = buildReport(await loadWeek(ds, week), week, reportToday, cat.id);
    const by = (id: string) => rows.find((r) => r.player.id === id)!;
    expect(by(zero.id).summary).toMatchObject({ absences: 0, level: 'green' });
    expect(by(one.id).summary).toMatchObject({ absences: 1, level: 'yellow' });
    expect(by(three.id).summary).toMatchObject({ absences: 3, level: 'red' });
    expect(by(three.id).eligibility.effective).toBe('not_eligible');
    expect(by(mixed.id).summary.absences).toBe(0);
    expect(by(pend.id).summary).toMatchObject({ absences: 0, pendingDates: [addDays(monday, 1), addDays(monday, 2)] });

    // Guardar dos veces no duplica.
    await ds.saveAttendance([{ sessionId: s[0].id, playerId: one.id, status: 'absent' }]);
    expect((await ds.listAttendance([s[0].id])).filter((a) => a.playerId === one.id)).toHaveLength(1);

    // Cancelar una sesión elimina sus faltas.
    await ds.saveSession({ ...s[0], status: 'cancelled' });
    const after = buildReport(await loadWeek(ds, week), week, reportToday, cat.id);
    expect(after.find((r) => r.player.id === three.id)!.summary.absences).toBe(2);
    expect(after.find((r) => r.player.id === one.id)!.summary.absences).toBe(0);
    await ds.saveSession({ ...s[0], status: 'done' });

    // Corregir un registro actualiza el cálculo.
    await ds.saveAttendance([{ sessionId: s[0].id, playerId: one.id, status: 'justified', reason: 'Médico' }]);
    const corrected = buildReport(await loadWeek(ds, week), week, reportToday, cat.id);
    expect(corrected.find((r) => r.player.id === one.id)!.summary.absences).toBe(0);
  });

  it('6. cambiar umbrales (por categoría y contando ENFERMO) cambia los resultados', async () => {
    await ds.saveRule({ categoryId: cat.id, yellowFrom: 2, redFrom: 4, countSick: true, countJustified: false });
    const rows = buildReport(await loadWeek(ds, week), week, reportToday, cat.id);
    const three = rows.find((r) => r.player.fullName === 'Tres')!;
    const mixed = rows.find((r) => r.player.fullName === 'Mixto')!;
    expect(three.summary.level).toBe('yellow'); // 3 faltas con rojo en 4
    expect(mixed.summary.absences).toBe(1); // ENFERMO ahora cuenta
    expect(mixed.summary.level).toBe('green'); // 1 < amarillo en 2
    const rule = (await ds.listRules()).find((r) => r.categoryId === cat.id)!;
    await ds.deleteRule(rule.id);
    await expect(ds.deleteRule('rule-global')).rejects.toThrow();
  });

  it('7. reporte semanal: 7 días, semanas anteriores y exportación', async () => {
    const data = await loadWeek(ds, week);
    const rows = buildReport(data, week, reportToday, cat.id);
    expect(rows[0].days).toHaveLength(7);
    expect(rows[0].days[3].cell.kind).toBe('none'); // jueves sin sesión en el escenario
    const prev = buildReport(await loadWeek(ds, addDays(week, -7)), addDays(week, -7), reportToday, cat.id);
    expect(prev.every((r) => r.summary.absences === 0 && r.days.every((d) => d.cell.kind === 'none'))).toBe(true);
    const csv = reportToCsv(rows, week);
    expect(csv.split('\n')[0]).toContain('Convocatoria final');
    expect(csv).toContain('Tres');
  });

  it('8. excepciones con historial y convocatoria confirmada', async () => {
    const players = await ds.listPlayers();
    const three = players.find((p) => p.fullName === 'Tres')!;
    const one = players.find((p) => p.fullName === 'Una')!;
    await expect(ds.addException({ playerId: three.id, weekStart: week, decision: 'eligible', reason: '  ' })).rejects.toThrow();
    const ex = await ds.addException({ playerId: three.id, weekStart: week, decision: 'eligible', reason: 'Lesión acreditada' });
    let rows = buildReport(await loadWeek(ds, week), week, reportToday, cat.id);
    let r = rows.find((x) => x.player.id === three.id)!;
    expect(r.eligibility.computed).toBe('not_eligible');
    expect(r.eligibility.effective).toBe('eligible');
    expect(r.final).toBe('PENDIENTE DE REVISIÓN'); // la elegibilidad no es la convocatoria

    await ds.confirmCallUps(week, [{ playerId: three.id, status: 'called' }, { playerId: one.id, status: 'not_called', note: 'Decisión técnica' }]);
    rows = buildReport(await loadWeek(ds, week), week, reportToday, cat.id);
    expect(rows.find((x) => x.player.id === three.id)!.final).toBe('CONVOCADO');
    expect(rows.find((x) => x.player.id === one.id)!.final).toBe('DESCONVOCADO');

    await ds.revokeException(ex.id);
    const history = await ds.listPlayerExceptions(three.id);
    expect(history).toHaveLength(1);
    expect(history[0].revoked).toBe(true);
    r = buildReport(await loadWeek(ds, week), week, reportToday, cat.id).find((x) => x.player.id === three.id)!;
    expect(r.eligibility.effective).toBe('not_eligible');
  });

  it('historial de cambio de categoría y archivar/reactivar', async () => {
    const other = await ds.saveCategory({ name: 'Otra', season: '2026–27', status: 'active' });
    const p = (await ds.listPlayers()).find((x) => x.fullName === 'Jugador Uno')!;
    await ds.savePlayer({ ...p, categoryId: other.id }, 'Subió de categoría');
    const hist = await ds.listCategoryHistory(p.id);
    expect(hist[0]).toMatchObject({ fromCategoryId: cat.id, toCategoryId: other.id, reason: 'Subió de categoría' });
    await ds.setPlayerActive(p.id, false);
    expect((await ds.getPlayer(p.id))!.active).toBe(false);
    await ds.setPlayerActive(p.id, true);
    expect((await ds.getPlayer(p.id))!.active).toBe(true);
    expect(today).toBeTruthy();
  });
});
