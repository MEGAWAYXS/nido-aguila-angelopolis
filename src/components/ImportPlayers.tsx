import { useMemo, useState } from 'react';
import {
  autoMap,
  buildRows,
  categoryKey,
  FIELD_LABELS,
  findHeaderRow,
  parseCsv,
  planImport,
  templateCsv,
  unknownCategories,
  type Cell,
  type ImportField,
  type ImportPlan,
} from '../domain/import';
import type { Category, ID, Player } from '../domain/types';
import { dataService } from '../services';
import { downloadFile, ErrorBox, Icon, Modal, toast } from './ui';

type Sheet = { name: string; rows: Cell[][] };
type Result = { created: number; updated: number; categories: string[]; skipped: ImportPlan['skip']; warnings: { line: number; text: string }[] };

const FIELDS = Object.keys(FIELD_LABELS) as ImportField[];

async function readFile(file: File): Promise<Sheet[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) return [{ name: file.name, rows: parseCsv(await file.text()) }];
  if (name.endsWith('.xls')) throw new Error('Los archivos .xls antiguos no se pueden leer. En Excel usa "Guardar como" › "Libro de Excel (.xlsx)" o "CSV UTF-8".');
  // Se carga solo cuando se usa, para no hacer más pesada la app.
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = await readXlsxFile(file);
  return sheets.map((s) => ({ name: s.sheet, rows: s.data as unknown as Cell[][] }));
}

function preview(v: Cell): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v === null || v === undefined ? '' : String(v);
}

export function ImportPlayers({ categories, players, onClose, onDone }: { categories: Category[]; players: Player[]; onClose: () => void; onDone: () => void }) {
  const activeCats = categories.filter((c) => c.status === 'active');
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [mapping, setMapping] = useState<(ImportField | null)[]>([]);
  const [defaultCat, setDefaultCat] = useState(activeCats[0]?.id ?? '');
  const [createCats, setCreateCats] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const rows = sheets?.[sheetIdx]?.rows ?? [];
  const headers = rows[headerIdx] ?? [];
  const width = Math.max(headers.length, ...rows.slice(headerIdx + 1, headerIdx + 30).map((r) => r.length), 0);

  function selectSheet(list: Sheet[], idx: number) {
    const h = findHeaderRow(list[idx].rows);
    setSheetIdx(idx);
    setHeaderIdx(h);
    setMapping(autoMap(list[idx].rows[h] ?? []));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy('Leyendo archivo…');
    try {
      const list = (await readFile(file)).filter((s) => s.rows.some((r) => r.some((c) => preview(c).trim())));
      if (list.length === 0) throw new Error('El archivo no tiene datos.');
      setSheets(list);
      selectSheet(list, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    } finally {
      setBusy(null);
    }
  }

  const built = useMemo(() => (sheets ? buildRows(rows, headerIdx, mapping) : []), [sheets, rows, headerIdx, mapping]);
  const newCats = useMemo(() => unknownCategories(built, categories), [built, categories]);
  const plan = useMemo(() => {
    const placeholder = new Map(newCats.map((n) => [categoryKey(n), `nueva:${n}`]));
    return planImport(built, players, categories, { defaultCategoryId: defaultCat, createdCategories: createCats ? placeholder : undefined, updateExisting });
  }, [built, players, categories, defaultCat, createCats, updateExisting, newCats]);
  const catLabel = (id: ID) => (id.startsWith('nueva:') ? `${id.slice(6)} (nueva)` : categories.find((c) => c.id === id)?.name ?? '—');
  const nameMapped = mapping.includes('fullName') || mapping.includes('firstName') || mapping.includes('lastName1');
  const duplicatedFields = FIELDS.filter((f) => mapping.filter((m) => m === f).length > 1);
  const warnings = built.flatMap((r) => r.warnings.map((text) => ({ line: r.line, text })));

  async function runImport() {
    setError(null);
    try {
      const created = new Map<string, ID>();
      if (createCats && newCats.length) {
        setBusy('Creando categorías…');
        const season = activeCats[0]?.season ?? `${new Date().getFullYear()}–${new Date().getFullYear() + 1}`;
        for (const name of newCats) {
          const c = await dataService.saveCategory({ name, season, status: 'active' });
          created.set(categoryKey(name), c.id);
        }
      }
      const finalPlan = planImport(built, players, [...categories], { defaultCategoryId: defaultCat, createdCategories: created, updateExisting });
      setBusy(`Guardando ${finalPlan.create.length} jugadores…`);
      await dataService.createPlayers(finalPlan.create.map((c) => c.input));
      for (const [i, u] of finalPlan.update.entries()) {
        setBusy(`Actualizando ${i + 1} de ${finalPlan.update.length}…`);
        await dataService.savePlayer(u.input, 'Importación desde Excel');
      }
      setResult({ created: finalPlan.create.length, updated: finalPlan.update.length, categories: [...created.keys()].length ? newCats : [], skipped: finalPlan.skip, warnings });
      toast(`Importación terminada: ${finalPlan.create.length} nuevos, ${finalPlan.update.length} actualizados`);
    } catch (err) {
      setError(`${err instanceof Error ? err.message : String(err)}. Lo que ya se guardó se conserva; revisa la plantilla antes de reintentar.`);
    } finally {
      setBusy(null);
    }
  }

  function downloadReport() {
    if (!result) return;
    const lines = [
      'Fila,Nombre,Resultado,Detalle',
      ...result.skipped.map((s) => [s.line, s.name ?? '', 'Omitido', s.reason]),
      ...result.warnings.map((w) => [w.line, built.find((b) => b.line === w.line)?.data.fullName ?? '', 'Dato omitido', w.text]),
    ].map((l) => (Array.isArray(l) ? l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',') : l));
    downloadFile('reporte-importacion.csv', '﻿' + lines.join('\n'));
  }

  if (result) {
    return (
      <Modal title="Importación terminada" onClose={onDone} footer={<button type="button" className="btn btn-primary" onClick={onDone}>Listo</button>}>
        <div className="grid grid-kpi">
          <div className="card"><div className="kpi-label">Jugadores nuevos</div><div className="kpi-value">{result.created}</div></div>
          <div className="card"><div className="kpi-label">Actualizados</div><div className="kpi-value">{result.updated}</div></div>
          <div className="card"><div className="kpi-label">Omitidos</div><div className="kpi-value">{result.skipped.length}</div></div>
        </div>
        {result.categories.length > 0 && <p style={{ margin: 0 }}>Categorías creadas: <b>{result.categories.join(', ')}</b>. Revisa su temporada y entrenador en Categorías.</p>}
        {(result.skipped.length > 0 || result.warnings.length > 0) && (
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>{result.skipped.length} fila(s) no se importaron y {result.warnings.length} dato(s) no se pudieron interpretar (el resto de esas filas sí se guardó).</p>
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={downloadReport}><Icon name="download" size={16} /> Descargar detalle</button>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal title="Importar jugadores desde Excel" onClose={onClose}>
      {!sheets && (
        <div className="stack">
          <p style={{ margin: 0 }}>Sube tu base de jugadores en <b>Excel (.xlsx)</b> o <b>CSV</b>. No necesita tener todos los datos: basta con el nombre. Las columnas se reconocen por su encabezado y podrás revisarlas antes de guardar.</p>
          <label className="field">
            <span>Archivo</span>
            <input className="input" type="file" accept=".xlsx,.csv,.txt,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => onFile(e.target.files?.[0])} disabled={!!busy} />
          </label>
          <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => downloadFile('plantilla-jugadores.csv', templateCsv())}><Icon name="download" size={16} /> Descargar plantilla</button>
          <p className="small muted" style={{ margin: 0 }}>El archivo se lee en tu navegador. Solo se guardan las columnas que correspondan a la ficha del jugador; otras (CURP, teléfonos, direcciones…) se ignoran.</p>
        </div>
      )}

      {sheets && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="form-grid">
            {sheets.length > 1 && (
              <label className="field"><span>Hoja</span>
                <select className="select" value={sheetIdx} onChange={(e) => selectSheet(sheets, Number(e.target.value))}>
                  {sheets.map((s, i) => <option key={s.name + i} value={i}>{s.name}</option>)}
                </select>
              </label>
            )}
            <label className="field"><span>Fila de encabezados</span>
              <input className="input" type="number" min={1} max={rows.length} value={headerIdx + 1}
                onChange={(e) => { const h = Math.max(0, Math.min(rows.length - 1, Number(e.target.value) - 1)); setHeaderIdx(h); setMapping(autoMap(rows[h] ?? [])); }} />
            </label>
          </div>

          <div>
            <h3 style={{ marginBottom: 8 }}>Columnas</h3>
            <div className="map-list">
              {Array.from({ length: width }, (_, i) => {
                const example = rows.slice(headerIdx + 1).map((r) => preview(r[i])).find((v) => v.trim()) ?? '';
                if (!preview(headers[i]).trim() && !example) return null;
                const title = preview(headers[i]) || `Columna ${i + 1}`;
                return (
                  <div key={i} className="map-row">
                    <div style={{ minWidth: 0 }}>
                      <b>{title}</b>
                      <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{example || '—'}</div>
                    </div>
                    <select className="select" aria-label={`Guardar la columna ${title} como`} value={mapping[i] ?? ''}
                      onChange={(e) => { const next = [...mapping]; next[i] = (e.target.value || null) as ImportField | null; setMapping(next); }}>
                      <option value="">— No importar —</option>
                      {FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            {!nameMapped && <ErrorBox message='Indica qué columna tiene el nombre del jugador ("Nombre completo" o "Nombre(s)" + apellidos).' />}
            {duplicatedFields.length > 0 && <p className="small" style={{ color: 'var(--absent-ink)' }}>Hay más de una columna asignada a: {duplicatedFields.map((f) => FIELD_LABELS[f]).join(', ')}. Solo se usará la primera.</p>}
          </div>

          <div className="form-grid">
            <label className="field"><span>Categoría para quienes no tengan una</span>
              <select className="select" value={defaultCat} onChange={(e) => setDefaultCat(e.target.value)}>
                {activeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          {newCats.length > 0 && (
            <label className="check"><input type="checkbox" checked={createCats} onChange={(e) => setCreateCats(e.target.checked)} />
              Crear las categorías que no existen: <b>{newCats.join(', ')}</b> (si no, esos jugadores van a la categoría predeterminada)</label>
          )}
          <label className="check"><input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
            Actualizar jugadores que ya existen (mismo folio, o mismo nombre y fecha de nacimiento) solo con los datos que traiga el archivo</label>

          <div className="row wrap">
            <span className="pill pill-present">{plan.create.length} nuevos</span>
            {plan.update.length > 0 && <span className="pill pill-justified">{plan.update.length} a actualizar</span>}
            {plan.skip.length > 0 && <span className="pill pill-gray">{plan.skip.length} omitidos</span>}
            {warnings.length > 0 && <span className="pill pill-sick">{warnings.length} datos no reconocidos</span>}
          </div>

          <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="table">
              <thead><tr><th>Fila</th><th>Nombre</th><th>Cam.</th><th>Nacimiento</th><th>Categoría</th><th>Resultado</th></tr></thead>
              <tbody>
                {built.slice(0, 200).map((r) => {
                  const c = plan.create.find((x) => x.line === r.line);
                  const u = plan.update.find((x) => x.line === r.line);
                  const s = plan.skip.find((x) => x.line === r.line);
                  const input = c?.input ?? u?.input;
                  return (
                    <tr key={r.line}>
                      <td className="muted">{r.line}</td>
                      <td>{r.data.fullName ?? <span className="muted">—</span>}</td>
                      <td>{r.data.jerseyNumber ?? ''}</td>
                      <td>{r.data.birthDate ?? ''}</td>
                      <td>{input ? catLabel(input.categoryId) : ''}</td>
                      <td>
                        {c && <span className="pill pill-present">Nuevo</span>}
                        {u && <span className="pill pill-justified">Actualizar</span>}
                        {s && <span className="pill pill-gray" title={s.reason}>Omitir</span>}
                        {s && <div className="small muted">{s.reason}</div>}
                        {r.warnings.map((w) => <div key={w} className="small" style={{ color: 'var(--sick-ink)' }}>{w}</div>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {built.length > 200 && <p className="small muted" style={{ margin: 0 }}>Vista previa de las primeras 200 filas; se importarán todas ({built.length}).</p>}
        </div>
      )}

      {error && <ErrorBox message={error} />}
      {busy && <div className="small" role="status">{busy}</div>}
      <div className="modal-foot">
        {sheets && <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => { setSheets(null); setError(null); }}>Elegir otro archivo</button>}
        <button type="button" className="btn" onClick={onClose} disabled={!!busy}>Cancelar</button>
        {sheets && (
          <button type="button" className="btn btn-primary" disabled={!!busy || !nameMapped || !defaultCat || plan.create.length + plan.update.length === 0} onClick={runImport}>
            Importar {plan.create.length + plan.update.length} jugador{plan.create.length + plan.update.length === 1 ? '' : 'es'}
          </button>
        )}
      </div>
    </Modal>
  );
}
