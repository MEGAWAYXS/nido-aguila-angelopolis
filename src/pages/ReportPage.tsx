import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { can, useAuth } from '../auth/AuthContext';
import { WeekPicker } from '../components/WeekPicker';
import { downloadFile, ErrorBox, Icon, Loading, Modal, toast } from '../components/ui';
import { useWeekData } from '../components/useWeekData';
import type { DayCell, FinalStatus } from '../domain/absences';
import { dayShort, formatDate, todayISO, weekDays, weekStartOf } from '../domain/dates';
import { buildReport, CELL_TEXT, ELIGIBILITY_TEXT, reportToCsv, type ReportRow } from '../domain/report';
import type { CallUpStatus, EligibilityDecision } from '../domain/types';
import { dataService } from '../services';

const CELL_SHORT: Record<string, string> = { present: 'PRES', absent: 'AUS', sick: 'ENF', justified: 'JUST', pending: 'PEND', none: '—', cancelled: 'CANC', future: 'PROG' };

function Cell({ cell }: { cell: DayCell }) {
  const key = cell.kind === 'status' ? cell.status : cell.kind;
  const excused = cell.kind === 'status' && cell.status === 'absent' && !cell.computable;
  const title = `${CELL_TEXT[key]}${excused ? ' (justificación aprobada)' : ''}${cell.kind === 'status' && cell.reason ? ` · ${cell.reason}` : ''}`;
  return <span className={`cell cell-${key}${excused ? ' cell-excused' : ''}`} title={title} aria-label={title}>{CELL_SHORT[key]}{excused ? '*' : ''}</span>;
}

const FINAL_CLASS: Record<FinalStatus, string> = { CONVOCADO: 'pill-navy', DESCONVOCADO: 'pill-out', 'PENDIENTE DE REVISIÓN': 'pill-pending' };
const ELIG_CLASS = { eligible: 'pill-present', eligible_alert: 'pill-sick', not_eligible: 'pill-absent' } as const;
type SortKey = 'jersey' | 'name' | 'absences' | 'folio';

export function ReportPage() {
  const { user } = useAuth();
  const today = todayISO();
  const [week, setWeek] = useState(weekStartOf(today));
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [finalFilter, setFinalFilter] = useState<FinalStatus | ''>('');
  const [sort, setSort] = useState<SortKey>('jersey');
  const [confirming, setConfirming] = useState(false);
  const [exceptionFor, setExceptionFor] = useState<ReportRow | null>(null);
  const { data, error, loading, reload } = useWeekData(week);
  const activeCats = data?.categories.filter((c) => c.status === 'active') ?? [];
  const cat = categoryId || activeCats[0]?.id || '';

  const rows = useMemo(() => {
    if (!data || !cat) return [];
    const needle = q.trim().toLowerCase();
    const all = buildReport(data, week, today, cat).filter(
      (r) => (!finalFilter || r.final === finalFilter) && (!needle || [r.player.fullName, r.player.folio, String(r.player.jerseyNumber ?? '')].some((v) => v.toLowerCase().includes(needle))),
    );
    const cmp: Record<SortKey, (a: ReportRow, b: ReportRow) => number> = {
      jersey: (a, b) => (a.player.jerseyNumber ?? 999) - (b.player.jerseyNumber ?? 999),
      name: (a, b) => a.player.fullName.localeCompare(b.player.fullName),
      folio: (a, b) => a.player.folio.localeCompare(b.player.folio),
      absences: (a, b) => b.summary.absences - a.summary.absences,
    };
    return all.sort(cmp[sort]);
  }, [data, week, today, cat, q, finalFilter, sort]);

  const catName = activeCats.find((c) => c.id === cat)?.name ?? '';
  const days = weekDays(week);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reporte semanal{catName ? ` · ${catName}` : ''}</h1>
          <p>Faltas, elegibilidad calculada y convocatoria oficial</p>
        </div>
        <div className="toolbar no-print">
          <button type="button" className="btn" onClick={() => window.print()}><Icon name="print" size={18} /> Imprimir</button>
          <button type="button" className="btn" disabled={rows.length === 0} onClick={() => downloadFile(`reporte-${catName}-${week}.csv`, reportToCsv(rows, week))}><Icon name="download" size={18} /> Exportar CSV</button>
          {can(user, 'manage') && <button type="button" className="btn btn-primary" disabled={rows.length === 0} onClick={() => setConfirming(true)}>Confirmar convocatoria</button>}
        </div>
      </div>
      <div className="toolbar no-print">
        <WeekPicker value={week} onChange={setWeek} />
        <label className="field"><span>Categoría</span>
          <select className="select" value={cat} onChange={(e) => setCategoryId(e.target.value)} style={{ minWidth: 150 }}>
            {activeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 200px' }}><span>Buscar</span><input className="input" type="search" placeholder="Nombre, folio o camiseta" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="field"><span>Estatus final</span>
          <select className="select" value={finalFilter} onChange={(e) => setFinalFilter(e.target.value as FinalStatus | '')}>
            <option value="">Todos</option><option>CONVOCADO</option><option>DESCONVOCADO</option><option>PENDIENTE DE REVISIÓN</option>
          </select>
        </label>
        <label className="field"><span>Ordenar por</span>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="jersey">Camiseta</option><option value="name">Nombre</option><option value="folio">Folio</option><option value="absences">Faltas</option>
          </select>
        </label>
      </div>
      <div className="row wrap small muted">
        {Object.keys(CELL_SHORT).map((k) => <span key={k} className="row" style={{ gap: 6 }}><span className={`cell cell-${k}`} style={{ minWidth: 44, height: 24 }}>{CELL_SHORT[k]}</span>{CELL_TEXT[k].toLowerCase()}</span>)}
        <span>* ausencia con justificación aprobada</span>
      </div>
      {error && <ErrorBox message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th>#</th><th>Folio</th><th>Cam.</th><th>Nombre completo</th>
                {days.map((d) => <th key={d} className="center">{dayShort(d)}<div className="small" style={{ fontWeight: 400, color: '#c9d0e0' }}>{d.slice(8)}</div></th>)}
                <th className="center">Faltas</th><th>Elegibilidad</th><th>Convocatoria final</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.player.id}>
                  <td className="muted">{i + 1}</td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{r.player.folio}</td>
                  <td className="jersey">{r.player.jerseyNumber ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><Link to={`/plantilla/${r.player.id}`} style={{ fontWeight: 600, color: 'inherit' }}>{r.player.fullName}</Link></td>
                  {r.days.map((d) => <td key={d.date} className="center" style={{ padding: '6px 3px' }}><Cell cell={d.cell} /></td>)}
                  <td className="center">
                    <b style={{ fontFamily: 'var(--display)', fontSize: 20 }}>{r.summary.absences}</b>
                    {r.summary.absenceDates.length > 0 && <div className="small muted">{r.summary.absenceDates.map((d) => formatDate(d, { day: 'numeric' })).join(', ')}</div>}
                  </td>
                  <td>
                    <span className={`pill ${ELIG_CLASS[r.eligibility.effective]}`}>{ELIGIBILITY_TEXT[r.eligibility.effective]}</span>
                    {r.eligibility.exception && <div className="small muted" title={r.eligibility.exception.reason}>Excepción · cálculo: {ELIGIBILITY_TEXT[r.eligibility.computed].toLowerCase()}</div>}
                    {r.summary.pendingDates.length > 0 && <div className="small muted">{r.summary.pendingDates.length} sin registro</div>}
                    {can(user, 'manage') && <button type="button" className="btn btn-sm btn-ghost no-print" style={{ paddingLeft: 0 }} onClick={() => setExceptionFor(r)}>Excepción…</button>}
                  </td>
                  <td>
                    <span className={`pill ${FINAL_CLASS[r.final]}`}>{r.final}</span>
                    {r.callUp?.note && <div className="small muted">{r.callUp.note}</div>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={14} className="empty">No hay jugadores para mostrar.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted">
        Regla aplicada: {rows[0] ? `${rows[0].rule.yellowFrom}+ faltas alerta, ${rows[0].rule.redFrom}+ desconvocado` : '—'}. Cuenta como falta solo AUSENTE sin justificación aprobada
        {rows[0]?.rule.countSick ? ', y también ENFERMO' : ''}{rows[0]?.rule.countJustified ? ', y también MOTIVO JUSTIFICADO' : ''}. Las sesiones canceladas o futuras y los registros pendientes no generan faltas.{' '}
        <Link to="/reglas" className="no-print">Configurar reglas</Link>
      </p>
      {confirming && <ConfirmCallUps rows={rows} week={week} onClose={() => setConfirming(false)} onDone={() => { setConfirming(false); reload(); }} />}
      {exceptionFor && <ExceptionModal row={exceptionFor} week={week} onClose={() => setExceptionFor(null)} onDone={() => { setExceptionFor(null); reload(); }} />}
    </>
  );
}

function ConfirmCallUps({ rows, week, onClose, onDone }: { rows: ReportRow[]; week: string; onClose: () => void; onDone: () => void }) {
  // Propuesta inicial = convocatoria ya confirmada o, si no existe, la elegibilidad calculada.
  const [choice, setChoice] = useState<Record<string, { status: CallUpStatus; note: string }>>(() =>
    Object.fromEntries(rows.map((r) => [r.player.id, { status: r.callUp?.status ?? (r.eligibility.effective === 'not_eligible' ? 'not_called' : 'called'), note: r.callUp?.note ?? '' }])),
  );
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await dataService.confirmCallUps(week, rows.map((r) => ({ playerId: r.player.id, ...choice[r.player.id] })));
      toast('Convocatoria confirmada');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title="Confirmar convocatoria oficial" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Guardando…' : `Confirmar ${rows.length} jugadores`}</button></>}>
      <p className="small muted" style={{ margin: 0 }}>La propuesta parte de la elegibilidad calculada. Puedes modificar cada decisión; se guardará como convocatoria oficial de la semana.</p>
      <div className="stack" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        {rows.map((r) => {
          const c = choice[r.player.id];
          const differs = (c.status === 'called') !== (r.eligibility.effective !== 'not_eligible');
          return (
            <div key={r.player.id} className="row wrap" style={{ borderBottom: '1px solid #eef1f6', paddingBottom: 8 }}>
              <span style={{ flex: '1 1 180px' }}><b>{r.player.jerseyNumber ?? '—'} · {r.player.fullName}</b><span className={`pill ${ELIG_CLASS[r.eligibility.effective]}`} style={{ marginLeft: 6 }}>{ELIGIBILITY_TEXT[r.eligibility.effective]}</span></span>
              <select className="select" style={{ width: 170 }} aria-label={`Decisión para ${r.player.fullName}`} value={c.status} onChange={(e) => setChoice({ ...choice, [r.player.id]: { ...c, status: e.target.value as CallUpStatus } })}>
                <option value="called">Convocado</option><option value="not_called">Desconvocado</option>
              </select>
              {differs && <input className="input" style={{ flex: '1 1 200px' }} placeholder="Motivo de la decisión distinta al cálculo" aria-label="Nota" value={c.note} onChange={(e) => setChoice({ ...choice, [r.player.id]: { ...c, note: e.target.value } })} />}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function ExceptionModal({ row, week, onClose, onDone }: { row: ReportRow; week: string; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState<EligibilityDecision>(row.eligibility.computed === 'not_eligible' ? 'eligible' : 'not_eligible');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  async function run(action: () => Promise<unknown>, msg: string) {
    setSaving(true);
    try {
      await action();
      toast(msg);
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title={`Excepción · ${row.player.fullName}`} onClose={onClose}>
      <p className="small" style={{ margin: 0 }}>Cálculo: <b>{ELIGIBILITY_TEXT[row.eligibility.computed]}</b> ({row.summary.absences} falta{row.summary.absences === 1 ? '' : 's'}). La excepción sustituye al cálculo solo esta semana y queda en el historial.</p>
      {row.eligibility.exception && (
        <div className="card small row wrap">
          <span style={{ flex: 1 }}>Vigente: {row.eligibility.exception.decision === 'eligible' ? 'habilitado' : 'inhabilitado'} · {row.eligibility.exception.reason}</span>
          <button type="button" className="btn btn-sm btn-danger" disabled={saving} onClick={() => run(() => dataService.revokeException(row.eligibility.exception!.id), 'Excepción revocada')}>Revocar</button>
        </div>
      )}
      <label className="field"><span>Decisión</span>
        <select className="select" value={decision} onChange={(e) => setDecision(e.target.value as EligibilityDecision)}>
          <option value="eligible">Habilitar (elegible)</option><option value="not_eligible">Inhabilitar (no elegible)</option>
        </select>
      </label>
      <label className="field"><span>Motivo (obligatorio)</span><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <div className="modal-foot">
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={saving || !reason.trim()} onClick={() => run(() => dataService.addException({ playerId: row.player.id, weekStart: week, decision, reason }), 'Excepción registrada')}>Registrar excepción</button>
      </div>
    </Modal>
  );
}
