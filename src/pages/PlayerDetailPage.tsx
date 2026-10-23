import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { can, useAuth } from '../auth/AuthContext';
import { PlayerForm } from '../components/PlayerForm';
import { PlayerPhoto } from '../components/PlayerPhoto';
import { ErrorBox, Icon, Loading, StatusPill, toast, useAsync } from '../components/ui';
import { resolveEligibility, resolveRule, summarizePlayerWeek } from '../domain/absences';
import { addDays, ageOn, formatDate, formatWeek, todayISO, weekStartOf } from '../domain/dates';
import { ELIGIBILITY_TEXT } from '../domain/report';
import { dataService } from '../services';

const FOOT = { right: 'Derecho', left: 'Izquierdo', both: 'Ambos' };

export function PlayerDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const today = todayISO();
  const week = weekStartOf(today);

  const { data, error, loading, reload } = useAsync(async () => {
    const player = await dataService.getPlayer(id);
    if (!player) return null;
    const [categories, attendance, sessions, history, callUps, exceptions, rules] = await Promise.all([
      dataService.listCategories(),
      dataService.listPlayerAttendance(id),
      dataService.listSessions(addDays(today, -120), addDays(today, 30)),
      dataService.listCategoryHistory(id),
      dataService.listPlayerCallUps(id),
      dataService.listPlayerExceptions(id),
      dataService.listRules(),
    ]);
    return { player, categories, attendance, sessions, history, callUps, exceptions, rules };
  }, [id]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <div className="empty">Jugador no encontrado o sin permiso. <Link to="/plantilla">Volver a la plantilla</Link></div>;

  const { player, categories, attendance, sessions, history, callUps, exceptions, rules } = data;
  const cat = (cid?: string) => categories.find((c) => c.id === cid)?.name ?? '—';
  const rule = resolveRule(rules, player.categoryId);
  const summary = summarizePlayerWeek(player, sessions, attendance, rule, week, today);
  const elig = resolveEligibility(summary, exceptions, week);
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const recent = attendance
    .map((a) => ({ a, s: sessionById.get(a.sessionId) }))
    .filter((x) => x.s)
    .sort((x, y) => y.s!.date.localeCompare(x.s!.date))
    .slice(0, 15);
  const eligClass = elig.effective === 'eligible' ? 'pill-present' : elig.effective === 'eligible_alert' ? 'pill-sick' : 'pill-absent';

  async function toggleActive() {
    try {
      await dataService.setPlayerActive(player.id, !player.active);
      toast(player.active ? 'Jugador archivado' : 'Jugador reactivado');
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    }
  }

  const facts: [string, string][] = [
    ['Folio', player.folio],
    ['Nacimiento', formatDate(player.birthDate)],
    ['Edad', `${ageOn(player.birthDate)} años`],
    ['Peso', player.weightKg ? `${player.weightKg} kg` : '—'],
    ['Estatura', player.heightCm ? `${(player.heightCm / 100).toFixed(2)} m` : '—'],
    ['Categoría', cat(player.categoryId)],
    ['Posición', player.position || '—'],
    ['Pie dominante', player.dominantFoot ? FOOT[player.dominantFoot] : '—'],
    ['Nacionalidad', player.nationality || '—'],
  ];

  return (
    <>
      <div className="row wrap no-print"><Link to="/plantilla" className="btn btn-sm btn-ghost"><Icon name="left" size={16} /> Plantilla</Link></div>
      <section className="card" style={{ background: 'var(--navy)', color: '#fff', borderColor: 'var(--navy)', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="photo" style={{ width: 130, height: 156, borderRadius: 12, border: '2px solid var(--yellow)' }}>
          <PlayerPhoto path={player.photoPath} name={player.fullName} />
          {player.jerseyNumber !== undefined && <span className="jersey-badge" style={{ top: 'auto', left: 'auto', bottom: 6, right: 6 }}>{player.jerseyNumber}</span>}
        </div>
        <div style={{ flex: '1 1 240px' }}>
          <h1 style={{ color: '#fff' }}>{player.fullName}</h1>
          {player.nickname && <div style={{ color: 'var(--yellow)', fontWeight: 600 }}>“{player.nickname}”</div>}
          <div style={{ color: '#c9d0e0' }}>Folio {player.folio} · {cat(player.categoryId)}</div>
          <span className={`pill ${player.active ? 'pill-present' : 'pill-gray'}`} style={{ marginTop: 8 }}>{player.active ? 'Activo' : 'Inactivo'}</span>
        </div>
        {can(user, 'write') && (
          <div className="row wrap">
            <button type="button" className="btn btn-accent" onClick={() => setEditing(true)}><Icon name="edit" size={16} /> Editar ficha</button>
            <button type="button" className="btn" style={{ background: 'transparent', color: '#fff', borderColor: '#4a5578' }} onClick={toggleActive}>{player.active ? 'Archivar' : 'Reactivar'}</button>
          </div>
        )}
      </section>

      <div className="grid grid-2">
        <section className="card stack">
          <div className="row wrap">
            <h2 style={{ flex: 1 }}>Semana actual</h2>
            <span className={`pill ${eligClass}`}>{ELIGIBILITY_TEXT[elig.effective]}</span>
          </div>
          <div className="small muted">{formatWeek(week)} · Regla: {rule.yellowFrom}+ alerta, {rule.redFrom}+ desconvocado</div>
          <div><b style={{ fontFamily: 'var(--display)', fontSize: 34 }}>{summary.absences}</b> falta{summary.absences === 1 ? '' : 's'} computable{summary.absences === 1 ? '' : 's'}</div>
          {summary.absenceDates.length > 0 && <div className="small">Fechas: {summary.absenceDates.map((d) => formatDate(d, { weekday: 'short', day: 'numeric', month: 'short' })).join(', ')}</div>}
          {summary.pendingDates.length > 0 && <div className="small"><span className="pill pill-pending">Pendiente de revisión</span> Sin registro: {summary.pendingDates.map((d) => formatDate(d, { weekday: 'short', day: 'numeric' })).join(', ')}</div>}
          {elig.exception && <div className="small"><b>Excepción autorizada:</b> {elig.exception.reason}</div>}
        </section>
        <section className="card">
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            {facts.map(([k, v]) => (
              <div key={k}><div className="small muted" style={{ fontWeight: 600 }}>{k.toUpperCase()}</div><div style={{ fontWeight: 600 }}>{v}</div></div>
            ))}
          </div>
        </section>
      </div>

      <section className="card stack">
        <h2>Observaciones deportivas</h2>
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{player.notes || <span className="muted">Sin observaciones.</span>}</p>
      </section>

      <div className="grid grid-2">
        <section className="card stack">
          <h2>Historial de asistencias</h2>
          {recent.length === 0 && <div className="empty">Sin registros.</div>}
          {recent.map(({ a, s }) => (
            <div key={a.id} className="row" style={{ borderBottom: '1px solid #eef1f6', paddingBottom: 6 }}>
              <span style={{ width: 110 }} className="small muted">{formatDate(s!.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span style={{ flex: 1 }} className="small">{s!.type === 'match' ? 'Partido' : 'Entrenamiento'}{a.reason ? ` · ${a.reason}` : ''}</span>
              <StatusPill status={a.status} />
            </div>
          ))}
        </section>
        <section className="card stack">
          <h2>Convocatorias</h2>
          {callUps.length === 0 && <div className="empty">Sin convocatorias confirmadas.</div>}
          {callUps.map((c) => (
            <div key={c.id} className="row">
              <span style={{ flex: 1 }} className="small">{formatWeek(c.weekStart)}{c.note ? ` · ${c.note}` : ''}</span>
              <span className={`pill ${c.status === 'called' ? 'pill-navy' : 'pill-out'}`}>{c.status === 'called' ? 'Convocado' : 'Desconvocado'}</span>
            </div>
          ))}
          <h3 style={{ marginTop: 10 }}>Excepciones</h3>
          {exceptions.length === 0 && <div className="small muted">Ninguna.</div>}
          {exceptions.map((e) => (
            <div key={e.id} className="small" style={{ textDecoration: e.revoked ? 'line-through' : undefined }}>
              {formatWeek(e.weekStart)} · {e.decision === 'eligible' ? 'Habilitado' : 'Inhabilitado'} · {e.reason}{e.revoked ? ' (revocada)' : ''}
            </div>
          ))}
          <h3 style={{ marginTop: 10 }}>Historial de categoría</h3>
          {history.map((h) => (
            <div key={h.id} className="small">{formatDate(h.changedAt.slice(0, 10))} · {h.fromCategoryId ? `${cat(h.fromCategoryId)} → ` : ''}{cat(h.toCategoryId)}{h.reason ? ` · ${h.reason}` : ''}</div>
          ))}
          {history.length === 0 && <div className="small muted">Sin cambios registrados.</div>}
        </section>
      </div>

      {editing && (
        <PlayerForm player={player} categories={categories} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />
      )}
    </>
  );
}
