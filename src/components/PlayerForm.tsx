import { useState, type FormEvent } from 'react';
import { ageOn, normalizeHeightCm } from '../domain/dates';
import type { Category, Player, PlayerInput } from '../domain/types';
import { dataService } from '../services';
import { shrinkPhoto } from '../services/photo';
import { ErrorBox, Modal, toast } from './ui';

type Draft = PlayerInput & { id?: string };

function emptyDraft(categoryId: string): Draft {
  return { fullName: '', categoryId, active: true, nationality: '' };
}

export function PlayerForm({ player, categories, defaultCategoryId, onClose, onSaved }: {
  player?: Player;
  categories: Category[];
  defaultCategoryId?: string;
  onClose: () => void;
  onSaved: (p: Player) => void;
}) {
  const [d, setD] = useState<Draft>(player ? { ...player } : emptyDraft(defaultCategoryId ?? categories.find((c) => c.status === 'active')?.id ?? ''));
  const [heightText, setHeightText] = useState(player?.heightCm ? String(player.heightCm) : '');
  const [reason, setReason] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const categoryChanged = player && player.categoryId !== d.categoryId;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!d.categoryId) return setError('Selecciona una categoría.');
    if (d.birthDate && d.birthDate > new Date().toISOString().slice(0, 10)) return setError('La fecha de nacimiento no puede ser futura.');
    setSaving(true);
    try {
      const h = heightText.trim() ? normalizeHeightCm(Number(heightText.replace(',', '.'))) : undefined;
      if (h !== undefined && (Number.isNaN(h) || h < 50 || h > 250)) throw new Error('Estatura no válida. Escribe por ejemplo 1.48 o 148.');
      const saved = await dataService.savePlayer({ ...d, heightCm: h }, reason || undefined);
      // Se reduce antes de subir (≈ 800 px, JPEG): pesa unas 15–20 veces menos.
      if (photo) await dataService.uploadPlayerPhoto(saved.id, await shrinkPhoto(photo));
      toast(player ? 'Ficha actualizada' : `Jugador creado · folio ${saved.folio}`);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={player ? `Editar ficha · ${player.folio}` : 'Nuevo jugador'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field" style={{ gridColumn: '1 / -1' }}><span>Nombre completo *</span><input className="input" required value={d.fullName} onChange={(e) => set('fullName', e.target.value)} /></label>
          <label className="field"><span>Nombre deportivo</span><input className="input" value={d.nickname ?? ''} onChange={(e) => set('nickname', e.target.value)} /></label>
          <label className="field"><span>Folio</span><input className="input" value={d.folio ?? ''} onChange={(e) => set('folio', e.target.value)} placeholder="Automático si se deja vacío" /></label>
          <label className="field"><span>Número de camiseta</span><input className="input" type="number" min={0} max={999} inputMode="numeric" value={d.jerseyNumber ?? ''} onChange={(e) => set('jerseyNumber', e.target.value === '' ? undefined : Number(e.target.value))} /></label>
          <label className="field">
            <span>Fecha de nacimiento {d.birthDate && <b style={{ color: 'var(--navy)' }}>· {ageOn(d.birthDate)} años</b>}</span>
            <input className="input" type="date" value={d.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value || undefined)} />
          </label>
          <label className="field"><span>Peso (kg)</span><input className="input" type="number" step="0.1" min={1} max={199} inputMode="decimal" value={d.weightKg ?? ''} onChange={(e) => set('weightKg', e.target.value === '' ? undefined : Number(e.target.value))} /></label>
          <label className="field"><span>Estatura (m o cm)</span><input className="input" inputMode="decimal" value={heightText} onChange={(e) => setHeightText(e.target.value)} placeholder="1.48 o 148" /></label>
          <label className="field"><span>Categoría *</span>
            <select className="select" required value={d.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">Selecciona…</option>
              {categories.filter((c) => c.status === 'active' || c.id === d.categoryId).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.season}</option>)}
            </select>
          </label>
          <label className="field"><span>Posición</span><input className="input" list="positions" value={d.position ?? ''} onChange={(e) => set('position', e.target.value)} /></label>
          <label className="field"><span>Pie dominante</span>
            <select className="select" value={d.dominantFoot ?? ''} onChange={(e) => set('dominantFoot', (e.target.value || undefined) as Draft['dominantFoot'])}>
              <option value="">—</option><option value="right">Derecho</option><option value="left">Izquierdo</option><option value="both">Ambos</option>
            </select>
          </label>
          <label className="field"><span>Nacionalidad (opcional)</span><input className="input" value={d.nationality ?? ''} onChange={(e) => set('nationality', e.target.value)} /></label>
          <label className="field"><span>Fotografía</span><input className="input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></label>
        </div>
        {categoryChanged && (
          <label className="field"><span>Motivo del cambio de categoría (queda en el historial)</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        )}
        <label className="field"><span>Observaciones deportivas</span><textarea className="textarea" value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label>
        <datalist id="positions">
          {['Portero', 'Defensa central', 'Lateral', 'Medio defensivo', 'Medio', 'Medio ofensivo', 'Extremo', 'Delantero'].map((p) => <option key={p} value={p} />)}
        </datalist>
        <p className="small muted" style={{ margin: 0 }}>Registra solo los datos necesarios. Las fotografías se guardan en almacenamiento privado.</p>
        {error && <ErrorBox message={error} />}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
