import { addDays, todayISO, weekStartOf } from '../../domain/dates';
import type { AbsenceRule, Attendance, AttendanceStatus, Category, Player, Session } from '../../domain/types';

// DATOS FICTICIOS para el modo demostración. Ningún nombre corresponde a un
// jugador real. Las fechas se generan alrededor de la semana actual.

export interface DemoData {
  categories: Category[];
  players: Player[];
  sessions: Session[];
  attendance: Attendance[];
  rules: AbsenceRule[];
}

const FIRST = ['Santiago', 'Emiliano', 'Diego', 'Iker', 'Leonardo', 'Mateo', 'Sebastián', 'Gael', 'Rodrigo', 'Andrés', 'Tomás', 'Bruno', 'Valentina', 'Regina', 'Ximena', 'Daniel', 'Julián', 'Renata', 'Axel', 'Camila', 'Nicolás', 'Sofía', 'Hugo', 'Emilio'];
const LAST = ['Ruiz', 'Torres', 'Castañeda', 'Mendoza', 'Vega', 'Herrera', 'Lara', 'Navarro', 'Pineda', 'Molina', 'Aguirre', 'Salas', 'Ríos', 'Fuentes', 'Ortega', 'Cruz', 'Ramos', 'Delgado'];
const POS = ['Portero', 'Defensa', 'Defensa', 'Medio', 'Medio', 'Extremo', 'Delantero'];

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function buildSeed(): DemoData {
  const rand = rng(20261022);
  const today = todayISO();
  const thisWeek = weekStartOf(today);
  const year = Number(today.slice(0, 4));

  const categories: Category[] = [
    { id: 'cat-sub10', name: 'Sub-10', season: `${year}–${year + 1}`, coachName: 'Entrenador A (demo)', status: 'active', description: 'Nacidos en 2016–2017' },
    { id: 'cat-sub12', name: 'Sub-12', season: `${year}–${year + 1}`, coachName: 'Entrenador B (demo)', status: 'active', description: 'Nacidos en 2014–2015' },
    { id: 'cat-sub14', name: 'Sub-14', season: `${year}–${year + 1}`, coachName: 'Entrenador C (demo)', status: 'active' },
  ];
  const birthYear: Record<string, number> = { 'cat-sub10': year - 10, 'cat-sub12': year - 12, 'cat-sub14': year - 14 };

  const players: Player[] = [];
  let folio = 101;
  for (const c of categories) {
    const used = new Set<number>();
    for (let i = 0; i < 9; i++) {
      let jersey = 1 + Math.floor(rand() * 23);
      while (used.has(jersey)) jersey = (jersey % 23) + 1;
      used.add(jersey);
      const name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
      const month = String(1 + Math.floor(rand() * 12)).padStart(2, '0');
      const day = String(1 + Math.floor(rand() * 28)).padStart(2, '0');
      players.push({
        id: `ply-${folio}`,
        folio: `NAA-${String(folio).padStart(4, '0')}`,
        fullName: name,
        jerseyNumber: jersey,
        birthDate: `${birthYear[c.id] + (rand() < 0.5 ? 0 : 1)}-${month}-${day}`,
        weightKg: Math.round(18 + (year - birthYear[c.id]) * 2.2 + rand() * 8),
        heightCm: Math.round(128 + (year - birthYear[c.id] - 10) * 7 + rand() * 12),
        categoryId: c.id,
        position: POS[i % POS.length],
        dominantFoot: rand() < 0.75 ? 'right' : 'left',
        nationality: 'Mexicana',
        active: true,
      });
      folio++;
    }
  }
  players[players.length - 1].active = false;

  const sessions: Session[] = [];
  let sid = 1;
  for (const w of [addDays(thisWeek, -14), addDays(thisWeek, -7), thisWeek, addDays(thisWeek, 7)]) {
    for (const c of categories) {
      for (const offset of [0, 1, 2, 3]) {
        const date = addDays(w, offset);
        const cancelled = w === thisWeek && offset === 1 && c.id === 'cat-sub14';
        sessions.push({
          id: `ses-${sid++}`,
          categoryId: c.id,
          date,
          startTime: c.id === 'cat-sub10' ? '16:00' : '17:30',
          endTime: c.id === 'cat-sub10' ? '17:30' : '19:00',
          type: 'training',
          location: 'Cancha 2 (demo)',
          coachName: c.coachName,
          status: cancelled ? 'cancelled' : date < today ? 'done' : 'scheduled',
          notes: cancelled ? 'Cancelada por lluvia' : undefined,
        });
      }
      const sat = addDays(w, 5);
      sessions.push({
        id: `ses-${sid++}`,
        categoryId: c.id,
        date: sat,
        startTime: '10:00',
        type: 'match',
        location: 'Campo visitante (demo)',
        coachName: c.coachName,
        status: sat < today ? 'done' : 'scheduled',
      });
    }
  }

  const attendance: Attendance[] = [];
  let aid = 1;
  for (const s of sessions) {
    if (s.status === 'cancelled' || s.date > today) continue;
    const roster = players.filter((p) => p.categoryId === s.categoryId && p.active);
    for (const p of roster) {
      const r = rand();
      // Algunos registros quedan sin capturar (más hoy) para probar "pendiente de revisión".
      if (r < (s.date === today ? 0.25 : 0.03)) continue;
      let status: AttendanceStatus = 'present';
      let reason: string | undefined;
      if (r > 0.93) status = 'absent';
      else if (r > 0.88) { status = 'sick'; reason = 'Aviso de la familia'; }
      else if (r > 0.84) { status = 'justified'; reason = 'Compromiso escolar'; }
      attendance.push({ id: `att-${aid++}`, sessionId: s.id, playerId: p.id, status, reason, justificationApproved: false, updatedAt: `${s.date}T20:00:00Z` });
    }
  }

  // Un jugador con 3 faltas en la semana actual para ver un caso desconvocado.
  const target = players.find((p) => p.categoryId === 'cat-sub12' && p.active)!;
  for (const s of sessions.filter((x) => x.categoryId === 'cat-sub12' && x.date >= thisWeek && x.date < today && x.status !== 'cancelled')) {
    const rec = attendance.find((a) => a.sessionId === s.id && a.playerId === target.id);
    if (rec) { rec.status = 'absent'; rec.reason = undefined; }
    else attendance.push({ id: `att-${aid++}`, sessionId: s.id, playerId: target.id, status: 'absent', justificationApproved: false, updatedAt: `${s.date}T20:00:00Z` });
  }

  const rules: AbsenceRule[] = [{ id: 'rule-global', categoryId: null, yellowFrom: 1, redFrom: 3, countSick: false, countJustified: false }];

  return { categories, players, sessions, attendance, rules };
}
