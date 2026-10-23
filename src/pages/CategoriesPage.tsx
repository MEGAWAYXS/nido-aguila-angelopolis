import { useState, type FormEvent } from 'react';
import { can, useAuth } from '../auth/AuthContext';
import { ErrorBox, Icon, Loading, Modal, toast, useAsync } from '../components/ui';
import type { Category } from '../domain/types';
import { dataService } from '../services';

type Draft = Omit<Category, 'id'> & { id?: string };
const EMPTY: Draft = { name: '', season: `${new Date().getFullYear()}–${new Date().getFullYear() + 1}`, description: '', coachName: '', status: 'active' };

export function CategoriesPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(async () => {
    const [categories, players] = await Promise.all([dataService.listCategories(), dataService.listPlayers()]);
    return { categories, players };
  }, []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const canManage = can(user, 'manage');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setFormError(null);
    try {
      await dataService.saveCategory(draft);
      toast(draft.id ? 'Categoría actualizada' : 'Categoría creada');
      setDraft(null);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(c: Category) {
    try {
      await dataService.saveCategory({ ...c, status: c.status === 'active' ? 'archived' : 'active' });
      toast(c.status === 'active' ? 'Categoría archivada' : 'Categoría reactivada');
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    }
  }

  const list = data?.categories.filter((c) => showArchived || c.status === 'active') ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Categorías</h1>
          <p>Crea, edita y archiva categorías. Sin límite de categorías.</p>
        </div>
        <div className="toolbar">
          <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar archivadas</label>
          {canManage && <button type="button" className="btn btn-primary" onClick={() => setDraft({ ...EMPTY })}><Icon name="plus" /> Nueva categoría</button>}
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Nombre</th><th>Temporada</th><th>Entrenador responsable</th><th className="center">Jugadores activos</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b>{c.description && <div className="small muted">{c.description}</div>}</td>
                  <td>{c.season}</td>
                  <td>{c.coachName || <span className="muted">—</span>}</td>
                  <td className="center">{data.players.filter((p) => p.active && p.categoryId === c.id).length}</td>
                  <td><span className={`pill ${c.status === 'active' ? 'pill-present' : 'pill-gray'}`}>{c.status === 'active' ? 'Activa' : 'Archivada'}</span></td>
                  <td>
                    {canManage && (
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-sm" onClick={() => setDraft({ ...c })}>Editar</button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggleArchive(c)}>{c.status === 'active' ? 'Archivar' : 'Reactivar'}</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="empty">No hay categorías. Crea la primera.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {draft && (
        <Modal title={draft.id ? 'Editar categoría' : 'Nueva categoría'} onClose={() => setDraft(null)}>
          <form className="stack" onSubmit={save}>
            <div className="form-grid">
              <label className="field"><span>Nombre *</span><input className="input" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Sub-12" /></label>
              <label className="field"><span>Temporada *</span><input className="input" required value={draft.season} onChange={(e) => setDraft({ ...draft, season: e.target.value })} /></label>
              <label className="field"><span>Entrenador responsable</span><input className="input" value={draft.coachName ?? ''} onChange={(e) => setDraft({ ...draft, coachName: e.target.value })} /></label>
              <label className="field"><span>Estado</span>
                <select className="select" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Category['status'] })}>
                  <option value="active">Activa</option><option value="archived">Archivada</option>
                </select>
              </label>
            </div>
            <label className="field"><span>Descripción (opcional)</span><textarea className="textarea" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
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
