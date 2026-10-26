import { useEffect, useMemo, useState } from 'react';
import { can, useAuth } from '../auth/AuthContext';
import { ErrorBox, Icon, Loading, STATUS_META, toast, useAsync } from '../components/ui';
import { formatDate, todayISO } from '../domain/dates';
import type { Attendance, AttendanceStatus, Session } from '../domain/types';
import { dataService } from '../services';

/** Suma minutos a una hora HH:MM (sin pasar de 23:59). */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

type Draft = { status?: AttendanceStatus; reason: string; approved: boolean };
const ORDER: AttendanceStatus[] = ['present', 'absent', 'sick', 'justified'];

export function AttendancePage() {
  const { user } = useAuth();
  const editable = can(user, 'write');
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<AttendanceStatus | 'pending' | ''>('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [newSession, setNewSession] = useState({ start: '17:00', end: '18:30', type: 'training' as Session['type'] });

  const base = useAsync(async () => {
    const [categories, players] = await Promise.all([dataService.listCategories(), dataService.listPlayers()]);
    return { categories: categories.filter((c) => c.status === 'active'), players };
  }, []);
  useEffect(() => {
    if (!categoryId && base.data?.categories[0]) setCategoryId(base.data.categories[0].id);
  }, [base.data, categoryId]);

  const day = useAsync(async () => {
    const sessions = (await dataService.listSessions(date, date)).filter((s) => s.categoryId === categoryId);
    const attendance = await dataService.listAttendance(sessions.map((s) => s.id));
    return { sessions, attendance };
  }, [date, categoryId]);

  useEffect(() => {
    const ss = day.data?.sessions ?? [];
    if (!ss.find((s) => s.id === sessionId)) setSessionId(ss.find((s) => s.status !== 'cancelled')?.id ?? ss[0]?.id ?? '');
  }, [day.data, sessionId]);

  const session: Session | undefined = day.data?.sessions.find((s) => s.id === sessionId);
  const roster = useMemo(
    () => (base.data?.players ?? []).filter((p) => p.active && p.categoryId === categoryId).sort((a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999) || a.fullName.localeCompare(b.fullName)),
    [base.data, categoryId],
  );

  // Reconstruye el borrador al cambiar de sesión o tras guardar.
  useEffect(() => {
    const existing = new Map<string, Attendance>((day.data?.attendance ?? []).filter((a) => a.sessionId === sessionId).map((a) => [a.playerId, a]));
    const next: Record<string, Draft> = {};
    for (const p of roster) {
      const a = existing.get(p.id);
      next[p.id] = { status: a?.status, reason: a?.reason ?? '', approved: a?.justificationApproved ?? false };
    }
    setDrafts(next);
    setDirty(false);
  }, [day.data, sessionId, roster]);

  function update(playerId: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [playerId]: { ...d[playerId], ...patch } }));
    setDirty(true);
    setSavedAt(null);
  }

  function markAllPresent() {
    setDrafts((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.status ? v : { ...v, status: 'present' as const }])));
    setDirty(true);
  }

  async function save() {
    if (!session) return;
    setSaving(true);
    try {
      const records = roster
        .filter((p) => drafts[p.id]?.status)
        .map((p) => ({ sessionId: session.id, playerId: p.id, status: drafts[p.id].status!, reason: drafts[p.id].reason, justificationApproved: drafts[p.id].status === 'absent' && drafts[p.id].approved }));
      await dataService.saveAttendance(records);
      if (session.status === 'scheduled' && session.date <= todayISO()) await dataService.saveSession({ ...session, status: 'done' });
      const pending = roster.length - records.length;
      toast(`Asistencia guardada · ${records.length} registro(s)${pending ? ` · ${pending} pendiente(s)` : ''}`);
      setSavedAt(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }));
      day.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setSaving(false);
    }
  }

  async function createSession() {
    try {
      const cat = base.data?.categories.find((c) => c.id === categoryId);
      if (newSession.end && newSession.end <= newSession.start) return toast('La hora de fin debe ser posterior a la de inicio.', true);
      const s = await dataService.saveSession({
        categoryId,
        date,
        startTime: newSession.start,
        endTime: newSession.end || undefined,
        type: newSession.type,
        status: 'scheduled',
        coachName: cat?.coachName,
      });
      toast('Sesión creada');
      setSessionId(s.id);
      day.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    }
  }

  const counts = { present: 0, absent: 0, sick: 0, justified: 0, pending: 0 };
  for (const p of roster) counts[drafts[p.id]?.status ?? 'pending']++;
  const needle = q.trim().toLowerCase();
  const visible = roster.filter((p) => {
    const st = drafts[p.id]?.status ?? 'pending';
    return (!filter || st === filter) && (!needle || p.fullName.toLowerCase().includes(needle) || String(p.jerseyNumber ?? '').includes(needle));
  });
  const locked = !editable || session?.status === 'cancelled' || (session ? session.date > todayISO() : true);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Asistencia diaria</h1>
          <p>{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>
      <div className="toolbar">
        <label className="field"><span>Fecha</span><input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        <label className="field"><span>Categoría</span>
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ minWidth: 150 }}>
            {base.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {day.data && day.data.sessions.length > 0 && (
          <label className="field"><span>Sesión</span>
            <select className="select" value={sessionId} onChange={(e) => setSessionId(e.target.value)} style={{ minWidth: 220 }}>
              {day.data.sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.startTime} · {s.type === 'match' ? 'Partido' : 'Entrenamiento'}{s.status === 'cancelled' ? ' (cancelada)' : ''}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {(base.error || day.error) && <ErrorBox message={(base.error || day.error)!} />}
      {(base.loading || day.loading) && !day.data && <Loading />}

      {day.data && day.data.sessions.length === 0 && (
        <div className="card empty stack" style={{ alignItems: 'center' }}>
          <span>No hay sesión programada para esta categoría en esta fecha. Sin sesión no se genera ninguna falta.</span>
          {editable && (
            <div className="toolbar" style={{ justifyContent: 'center' }}>
              <label className="field"><span>Tipo</span>
                <select className="select" value={newSession.type} onChange={(e) => setNewSession({ ...newSession, type: e.target.value as Session['type'] })}>
                  <option value="training">Entrenamiento</option>
                  <option value="match">Partido</option>
                </select>
              </label>
              <label className="field"><span>Hora de inicio</span>
                <input className="input" type="time" required value={newSession.start}
                  onChange={(e) => e.target.value && setNewSession({ ...newSession, start: e.target.value, end: addMinutes(e.target.value, 90) })} />
              </label>
              <label className="field"><span>Hora de fin (opcional)</span>
                <input className="input" type="time" value={newSession.end} onChange={(e) => setNewSession({ ...newSession, end: e.target.value })} />
              </label>
              <button type="button" className="btn btn-primary" onClick={createSession}>
                <Icon name="plus" /> Crear {newSession.type === 'match' ? 'partido' : 'entrenamiento'}
              </button>
            </div>
          )}
        </div>
      )}

      {session && (
        <>
          {session.status === 'cancelled' && <div className="error-box">Sesión cancelada: no se registra asistencia ni se generan faltas.</div>}
          {session.date > todayISO() && session.status !== 'cancelled' && <div className="card small">Sesión futura: la asistencia se podrá registrar el día de la sesión.</div>}
          <div className="counts" aria-label="Resumen">
            <div className="count pill-present"><b>{counts.present}</b>PRES.</div>
            <div className="count pill-absent"><b>{counts.absent}</b>AUS.</div>
            <div className="count pill-sick"><b>{counts.sick}</b>ENF.</div>
            <div className="count pill-justified"><b>{counts.justified}</b>JUST.</div>
            <div className="count pill-pending" style={{ background: '#fff' }}><b>{counts.pending}</b>PEND.</div>
          </div>
          <div className="toolbar">
            <label className="field" style={{ flex: '1 1 240px' }}><span>Buscar</span><input className="input" type="search" placeholder="Nombre o camiseta" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <label className="field"><span>Filtrar</span>
              <select className="select" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                <option value="">Todos</option>
                {ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                <option value="pending">Pendientes</option>
              </select>
            </label>
            {!locked && <button type="button" className="btn" onClick={markAllPresent}>Marcar pendientes como presentes</button>}
          </div>
          <div className="att-list">
            {visible.map((p) => {
              const d = drafts[p.id] ?? { reason: '', approved: false };
              return (
                <div key={p.id} className="att-row">
                  <span className="idx">{roster.indexOf(p) + 1}</span>
                  <span className="num">{p.jerseyNumber ?? '—'}</span>
                  <span>
                    <b>{p.fullName}</b>
                    <span className={`pill ${d.status ? `pill-${d.status}` : 'pill-pending'}`} style={{ marginLeft: 8 }}>{d.status ? STATUS_META[d.status].label : 'Pendiente'}</span>
                  </span>
                  <div className="att-opts" role="group" aria-label={`Asistencia de ${p.fullName}`}>
                    {ORDER.map((s) => (
                      <button key={s} type="button" className={`att-opt ${s}`} aria-pressed={d.status === s} disabled={locked}
                        onClick={() => update(p.id, { status: d.status === s ? undefined : s })}>
                        {STATUS_META[s].short}
                      </button>
                    ))}
                  </div>
                  {d.status && d.status !== 'present' && (
                    <div className="att-extra">
                      <input className="input" aria-label={`Motivo u observaciones de ${p.fullName}`} placeholder="Motivo u observaciones" value={d.reason} disabled={locked} onChange={(e) => update(p.id, { reason: e.target.value })} />
                      {d.status === 'absent' && (
                        <label className="check small"><input type="checkbox" checked={d.approved} disabled={locked} onChange={(e) => update(p.id, { approved: e.target.checked })} /> Justificación aprobada (no cuenta como falta)</label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && <div className="empty">{roster.length === 0 ? 'Esta categoría no tiene jugadores activos.' : 'Ningún jugador coincide con el filtro.'}</div>}
          </div>
          {!locked && (
            <div className="savebar">
              <span className="small muted" style={{ flex: '1 1 200px' }}>
                {savedAt ? `Guardado a las ${savedAt}.` : dirty ? 'Hay cambios sin guardar.' : 'Sin cambios.'} Los pendientes no se cuentan como falta.
              </span>
              <button type="button" className="btn btn-primary" disabled={saving || !dirty} onClick={save}>{saving ? 'Guardando…' : 'Guardar asistencia'}</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
