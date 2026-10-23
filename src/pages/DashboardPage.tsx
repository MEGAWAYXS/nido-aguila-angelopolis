import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { WeekPicker } from '../components/WeekPicker';
import { ErrorBox, Loading } from '../components/ui';
import { useWeekData } from '../components/useWeekData';
import { countableSessions } from '../domain/absences';
import { formatDate, todayISO, weekStartOf } from '../domain/dates';
import { buildReport } from '../domain/report';
import type { AttendanceStatus } from '../domain/types';

const COLORS: Record<AttendanceStatus | 'pending', string> = {
  present: 'var(--present)',
  absent: 'var(--absent)',
  sick: 'var(--sick)',
  justified: 'var(--justified)',
  pending: '#fff',
};
const LABELS: Record<AttendanceStatus | 'pending', string> = { present: 'Presente', absent: 'Ausente', sick: 'Enfermo', justified: 'Justificado', pending: 'Pendiente' };

export function DashboardPage() {
  const today = todayISO();
  const [week, setWeek] = useState(weekStartOf(today));
  const [categoryId, setCategoryId] = useState('');
  const { data, error, loading } = useWeekData(week);

  const view = useMemo(() => {
    if (!data) return null;
    const cats = data.categories.filter((c) => c.status === 'active' && (!categoryId || c.id === categoryId));
    // El panel resume a los jugadores activos; los archivados solo aparecen en el reporte.
    const rows = buildReport(data, week, today, categoryId || undefined).filter((r) => !r.archived);
    const perCat = cats.map((c) => {
      const counts: Record<AttendanceStatus | 'pending', number> = { present: 0, absent: 0, sick: 0, justified: 0, pending: 0 };
      const players = data.players.filter((p) => p.active && p.categoryId === c.id);
      for (const s of countableSessions(data.sessions, c.id, week, today)) {
        for (const p of players) {
          const a = data.attendance.find((x) => x.sessionId === s.id && x.playerId === p.id);
          counts[a ? a.status : 'pending']++;
        }
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return { category: c, counts, total, pct: total ? Math.round((counts.present / total) * 100) : null };
    });
    const allCounts = perCat.reduce((acc, c) => acc + c.counts.present, 0);
    const allTotal = perCat.reduce((acc, c) => acc + c.total, 0);
    const sessions = data.sessions.filter((s) => !categoryId || s.categoryId === categoryId);
    return {
      cats,
      rows,
      perCat,
      activePlayers: data.players.filter((p) => p.active && (!categoryId || p.categoryId === categoryId)).length,
      inactive: data.players.filter((p) => !p.active).length,
      pct: allTotal ? Math.round((allCounts / allTotal) * 100) : null,
      done: sessions.filter((s) => s.status !== 'cancelled' && s.date <= today).length,
      cancelled: sessions.filter((s) => s.status === 'cancelled').length,
      alerts: rows.filter((r) => r.summary.level !== 'green' || r.summary.pendingDates.length > 0).sort((a, b) => b.summary.absences - a.summary.absences),
    };
  }, [data, week, today, categoryId]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Panel general</h1>
          <p>Resumen de la semana seleccionada</p>
        </div>
        <div className="toolbar">
          <WeekPicker value={week} onChange={setWeek} />
          <label className="field">
            <span>Categoría</span>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ minWidth: 160 }}>
              <option value="">Todas</option>
              {data?.categories.filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {loading && !view && <Loading />}
      {view && (
        <>
          <div className="grid grid-kpi">
            <div className="card"><div className="kpi-label">Jugadores activos</div><div className="kpi-value">{view.activePlayers}</div><div className="small muted">{view.inactive} archivados</div></div>
            <div className="card"><div className="kpi-label">Categorías activas</div><div className="kpi-value">{view.cats.length}</div><div className="small muted"><Link to="/categorias">Gestionar</Link></div></div>
            <div className="card"><div className="kpi-label">Asistencia semanal</div><div className="kpi-value">{view.pct === null ? '—' : `${view.pct}%`}</div><div className="small muted">{view.done} sesiones a la fecha · {view.cancelled} canceladas</div></div>
            <div className="card"><div className="kpi-label">Alertas por faltas</div><div className="kpi-value">{view.rows.filter((r) => r.summary.level !== 'green').length}</div><div className="small muted">{view.rows.filter((r) => r.summary.level === 'red').length} no elegibles por cálculo</div></div>
          </div>

          <div className="grid grid-2">
            <section className="card stack">
              <h2>Asistencia por categoría</h2>
              <div className="row wrap small muted">
                {(Object.keys(COLORS) as (AttendanceStatus | 'pending')[]).map((k) => (
                  <span key={k} className="row" style={{ gap: 5 }}>
                    <span className="dot" style={{ background: COLORS[k], border: k === 'pending' ? '1.5px dashed var(--muted-2)' : undefined, borderRadius: 3 }} />
                    {LABELS[k]}
                  </span>
                ))}
              </div>
              {view.perCat.map(({ category, counts, total, pct }) => (
                <div key={category.id} className="row">
                  <span style={{ width: 70, fontWeight: 700 }}>{category.name}</span>
                  <div style={{ flex: 1, display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', gap: 2, background: 'var(--bg)' }} role="img" aria-label={`${category.name}: ${(Object.keys(counts) as (keyof typeof counts)[]).map((k) => `${counts[k]} ${LABELS[k]}`).join(', ')}`}>
                    {total > 0 && (Object.keys(counts) as (keyof typeof counts)[]).map((k) => counts[k] > 0 && (
                      <span key={k} style={{ flex: `${counts[k]} 1 0`, background: COLORS[k], border: k === 'pending' ? '1.5px dashed var(--muted-2)' : undefined }} />
                    ))}
                  </div>
                  <span style={{ width: 48, textAlign: 'right', fontWeight: 700 }}>{pct === null ? '—' : `${pct}%`}</span>
                </div>
              ))}
              {view.perCat.length === 0 && <div className="empty">No hay categorías activas.</div>}
            </section>

            <section className="card stack">
              <h2>Alertas por faltas</h2>
              {view.alerts.length === 0 && <div className="empty">Sin alertas esta semana.</div>}
              {view.alerts.slice(0, 8).map((r) => (
                <Link key={r.player.id} to={`/plantilla/${r.player.id}`} className="row" style={{ textDecoration: 'none', color: 'inherit', borderBottom: '1px solid #eef1f6', paddingBottom: 8 }}>
                  <span className="dot" style={{ background: r.summary.level === 'red' ? 'var(--absent)' : r.summary.level === 'yellow' ? 'var(--sick)' : '#fff', border: r.summary.level === 'green' ? '2px dashed var(--muted-2)' : undefined }} />
                  <span style={{ flex: 1 }}>
                    <b>{r.player.fullName}</b>
                    <span className="small muted" style={{ display: 'block' }}>
                      {r.category?.name} · {r.summary.absences > 0 ? r.summary.absenceDates.map((d) => formatDate(d, { weekday: 'short', day: 'numeric' })).join(', ') : `${r.summary.pendingDates.length} registro(s) pendiente(s)`}
                    </span>
                  </span>
                  <span className={`pill ${r.summary.level === 'red' ? 'pill-absent' : r.summary.level === 'yellow' ? 'pill-sick' : 'pill-pending'}`}>
                    {r.summary.level === 'green' ? 'Revisar' : `${r.summary.absences} falta${r.summary.absences === 1 ? '' : 's'}`}
                  </span>
                </Link>
              ))}
              <Link to="/reporte" className="small" style={{ fontWeight: 700 }}>Ver reporte semanal completo</Link>
            </section>
          </div>

          <div className="grid grid-2">
            <section className="card stack" style={{ background: 'var(--navy)', color: '#fff', borderColor: 'var(--navy)' }}>
              <h2>Convocatoria de la semana</h2>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
                {[
                  ['Convocados', view.rows.filter((r) => r.final === 'CONVOCADO').length, 'var(--yellow)'],
                  ['Desconvocados', view.rows.filter((r) => r.final === 'DESCONVOCADO').length, '#fff'],
                  ['Por revisar', view.rows.filter((r) => r.final === 'PENDIENTE DE REVISIÓN').length, '#fff'],
                ].map(([label, value, color]) => (
                  <div key={String(label)} style={{ background: 'var(--navy-2)', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 700, color: String(color) }}>{value}</div>
                    <div className="small" style={{ fontWeight: 600 }}>{String(label).toUpperCase()}</div>
                  </div>
                ))}
              </div>
              <span className="small" style={{ color: '#c9d0e0' }}>La elegibilidad es un cálculo; la convocatoria oficial la confirma el personal en el reporte semanal.</span>
            </section>
            <section className="card stack">
              <h2>Accesos rápidos</h2>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                <Link to="/asistencia" className="btn btn-accent">Pasar lista</Link>
                <Link to="/plantilla?nuevo=1" className="btn">Nuevo jugador</Link>
                <Link to="/reporte" className="btn">Confirmar convocatoria</Link>
                <Link to="/calendario?nueva=1" className="btn">Nueva sesión</Link>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
