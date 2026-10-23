import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { can, useAuth } from '../auth/AuthContext';
import { WeekPicker } from '../components/WeekPicker';
import { ErrorBox, Icon, Loading, Modal, toast, useAsync } from '../components/ui';
import { addDays, DAY_NAMES, formatDate, todayISO, weekDays, weekStartOf } from '../domain/dates';
import type { Session } from '../domain/types';
import { dataService } from '../services';

type Draft = Omit<Session, 'id'> & { id?: string };
const STATUS_TEXT = { scheduled: 'Programada', done: 'Realizada', cancelled: 'Cancelada' };
const STATUS_CLASS = { scheduled: 'pill-gray', done: 'pill-navy', cancelled: 'pill-out' };

export function CalendarPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [week, setWeek] = useState(weekStartOf(todayISO()));
  const [categoryId, setCategoryId] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const editable = can(user, 'write');

  const { data, error, loading, reload } = useAsync(async () => {
    const [categories, sessions] = await Promise.all([dataService.listCategories(), dataService.listSessions(week, addDays(week, 6))]);
    return { categories: categories.filter((c) => c.status === 'active'), sessions };
  }, [week]);

  const newDraft = (date = todayISO()): Draft => {
    const cat = data?.categories.find((c) => c.id === categoryId) ?? data?.categories[0];
    return { categoryId: cat?.id ?? '', date, startTime: '17:00', endTime: '18:30', type: 'training', status: 'scheduled', location: '', coachName: cat?.coachName ?? '' };
  };
  if (params.get('nueva') === '1' && data && !draft) {
    setDraft(newDraft());
    setParams({});
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setFormError(null);
    if (draft.endTime && draft.endTime <= draft.startTime) return setFormError('La hora de fin debe ser posterior al inicio.');
    setSaving(true);
    try {
      await dataService.saveSession(draft);
      toast(draft.id ? 'Sesión actualizada' : 'Sesión creada');
      setDraft(null);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const catName = (id: string) => data?.categories.find((c) => c.id === id)?.name ?? '—';
  const sessions = (data?.sessions ?? []).filter((s) => !categoryId || s.categoryId === categoryId);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Calendario</h1>
          <p>Entrenamientos y partidos. Las sesiones canceladas no generan faltas.</p>
        </div>
        {editable && <button type="button" className="btn btn-primary" onClick={() => setDraft(newDraft())}><Icon name="plus" /> Nueva sesión</button>}
      </div>
      <div className="toolbar">
        <WeekPicker value={week} onChange={setWeek} />
        <label className="field"><span>Categoría</span>
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ minWidth: 150 }}>
            <option value="">Todas</option>
            {data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      {error && <ErrorBox message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="stack">
          {weekDays(week).map((d, i) => {
            const items = sessions.filter((s) => s.date === d);
            return (
              <section key={d} className="card" style={{ padding: 14, borderColor: d === todayISO() ? 'var(--navy)' : undefined }}>
                <div className="row wrap" style={{ marginBottom: items.length ? 10 : 0 }}>
                  <h3 style={{ flex: 1 }}>{DAY_NAMES[i]} <span className="muted" style={{ fontFamily: 'var(--body)', fontWeight: 500, fontSize: 14 }}>{formatDate(d, { day: 'numeric', month: 'long' })}</span></h3>
                  {items.length === 0 && <span className="small muted">Sin entrenamiento</span>}
                  {editable && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDraft(newDraft(d))} aria-label={`Añadir sesión el ${DAY_NAMES[i]}`}><Icon name="plus" size={16} /></button>}
                </div>
                <div className="stack">
                  {items.map((s) => (
                    <div key={s.id} className="row wrap" style={{ borderTop: '1px solid #eef1f6', paddingTop: 8 }}>
                      <b style={{ width: 96 }}>{s.startTime}{s.endTime ? `–${s.endTime}` : ''}</b>
                      <span style={{ flex: '1 1 200px' }}>
                        <b>{catName(s.categoryId)}</b> · {s.type === 'match' ? 'Partido' : 'Entrenamiento'}
                        <span className="small muted" style={{ display: 'block' }}>{[s.location, s.coachName, s.notes].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className={`pill ${STATUS_CLASS[s.status]}`}>{STATUS_TEXT[s.status]}</span>
                      {editable && <button type="button" className="btn btn-sm" onClick={() => setDraft({ ...s })}>Editar</button>}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {draft && data && (
        <Modal title={draft.id ? 'Editar sesión' : 'Nueva sesión'} onClose={() => setDraft(null)}>
          <form className="stack" onSubmit={save}>
            <div className="form-grid">
              <label className="field"><span>Categoría *</span>
                <select className="select" required value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                  {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="field"><span>Tipo</span>
                <select className="select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as Session['type'] })}>
                  <option value="training">Entrenamiento</option><option value="match">Partido</option>
                </select>
              </label>
              <label className="field"><span>Fecha *</span><input className="input" type="date" required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
              <label className="field"><span>Inicio *</span><input className="input" type="time" required value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} /></label>
              <label className="field"><span>Fin</span><input className="input" type="time" value={draft.endTime ?? ''} onChange={(e) => setDraft({ ...draft, endTime: e.target.value || undefined })} /></label>
              <label className="field"><span>Estado</span>
                <select className="select" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Session['status'] })}>
                  <option value="scheduled">Programada</option><option value="done">Realizada</option><option value="cancelled">Cancelada</option>
                </select>
              </label>
              <label className="field"><span>Lugar</span><input className="input" value={draft.location ?? ''} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></label>
              <label className="field"><span>Entrenador</span><input className="input" value={draft.coachName ?? ''} onChange={(e) => setDraft({ ...draft, coachName: e.target.value })} /></label>
            </div>
            <label className="field"><span>Notas</span><input className="input" value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Ej. cancelada por lluvia" /></label>
            {draft.status === 'cancelled' && <p className="small muted" style={{ margin: 0 }}>Al cancelarla, las asistencias de esta sesión dejan de contar como faltas.</p>}
            {formError && <ErrorBox message={formError} />}
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setDraft(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
