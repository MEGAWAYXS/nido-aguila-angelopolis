import { useState } from 'react';
import { can, useAuth } from '../auth/AuthContext';
import { ErrorBox, Icon, Loading, Modal, toast, useAsync } from '../components/ui';
import { DEFAULT_RULE, validateRule } from '../domain/absences';
import type { AbsenceRule } from '../domain/types';
import { dataService } from '../services';

type Draft = Omit<AbsenceRule, 'id'> & { id?: string };

function describe(r: Pick<AbsenceRule, 'yellowFrom' | 'redFrom' | 'countSick' | 'countJustified'>) {
  const extra = [r.countSick && 'ENFERMO', r.countJustified && 'MOTIVO JUSTIFICADO'].filter(Boolean).join(' y ');
  return `0 → elegible · ${r.yellowFrom}${r.redFrom - 1 > r.yellowFrom ? `–${r.redFrom - 1}` : ''} → alerta · ${r.redFrom}+ → desconvocado. Cuenta AUSENTE sin justificación aprobada${extra ? ` y ${extra}` : ''}.`;
}

export function RulesPage() {
  const { user } = useAuth();
  const editable = can(user, 'manage');
  const { data, error, loading, reload } = useAsync(async () => {
    const [rules, categories] = await Promise.all([dataService.listRules(), dataService.listCategories()]);
    return { rules, categories };
  }, []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const validation = draft ? validateRule(draft) : null;

  async function save() {
    if (!draft || validation) return;
    setSaving(true);
    try {
      await dataService.saveRule(draft);
      toast('Regla guardada. Los cálculos se actualizan de inmediato.');
      setDraft(null);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setSaving(false);
    }
  }
  async function remove(r: AbsenceRule) {
    try {
      await dataService.deleteRule(r.id);
      toast('La categoría vuelve a usar la regla global');
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    }
  }

  const global = data?.rules.find((r) => r.categoryId === null);
  const catRules = data?.rules.filter((r) => r.categoryId !== null) ?? [];
  const withoutRule = data?.categories.filter((c) => c.status === 'active' && !catRules.some((r) => r.categoryId === c.id)) ?? [];
  const catName = (id: string | null) => data?.categories.find((c) => c.id === id)?.name ?? '—';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reglas de faltas</h1>
          <p>Umbrales globales o por categoría. Una regla de categoría sustituye a la global.</p>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <>
          <section className="card stack">
            <div className="row wrap"><h2 style={{ flex: 1 }}>Regla global</h2>{editable && <button type="button" className="btn btn-sm" onClick={() => setDraft(global ? { ...global } : { ...DEFAULT_RULE })}>Editar</button>}</div>
            <p style={{ margin: 0 }}>{describe(global ?? { id: '', ...DEFAULT_RULE })}</p>
          </section>
          <section className="card stack">
            <h2>Reglas por categoría</h2>
            {catRules.length === 0 && <p className="muted" style={{ margin: 0 }}>Todas las categorías usan la regla global.</p>}
            {catRules.map((r) => (
              <div key={r.id} className="row wrap" style={{ borderTop: '1px solid #eef1f6', paddingTop: 8 }}>
                <b style={{ width: 90 }}>{catName(r.categoryId)}</b>
                <span style={{ flex: '1 1 260px' }} className="small">{describe(r)}</span>
                {editable && <><button type="button" className="btn btn-sm" onClick={() => setDraft({ ...r })}>Editar</button><button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(r)}>Quitar</button></>}
              </div>
            ))}
            {editable && withoutRule.length > 0 && (
              <div className="row wrap">
                <span className="small muted">Crear regla para:</span>
                {withoutRule.map((c) => (
                  <button key={c.id} type="button" className="btn btn-sm" onClick={() => setDraft({ ...(global ?? DEFAULT_RULE), id: undefined, categoryId: c.id })}><Icon name="plus" size={14} /> {c.name}</button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {draft && (
        <Modal title={draft.categoryId ? `Regla · ${catName(draft.categoryId)}` : 'Regla global'} onClose={() => setDraft(null)}
          footer={<><button type="button" className="btn" onClick={() => setDraft(null)}>Cancelar</button><button type="button" className="btn btn-primary" disabled={saving || !!validation} onClick={save}>Guardar</button></>}>
          <div className="form-grid">
            <label className="field"><span>Alerta amarilla desde (faltas)</span><input className="input" type="number" min={1} value={draft.yellowFrom} onChange={(e) => setDraft({ ...draft, yellowFrom: Number(e.target.value) })} /></label>
            <label className="field"><span>Desconvocado desde (faltas)</span><input className="input" type="number" min={2} value={draft.redFrom} onChange={(e) => setDraft({ ...draft, redFrom: Number(e.target.value) })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={draft.countSick} onChange={(e) => setDraft({ ...draft, countSick: e.target.checked })} /> ENFERMO cuenta como falta</label>
          <label className="check"><input type="checkbox" checked={draft.countJustified} onChange={(e) => setDraft({ ...draft, countJustified: e.target.checked })} /> MOTIVO JUSTIFICADO cuenta como falta</label>
          {validation ? <ErrorBox message={validation} /> : <p className="small muted" style={{ margin: 0 }}>{describe(draft)}</p>}
        </Modal>
      )}
    </>
  );
}
