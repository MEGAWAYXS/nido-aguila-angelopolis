import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { can, useAuth } from '../auth/AuthContext';
import { ImportPlayers } from '../components/ImportPlayers';
import { PlayerForm } from '../components/PlayerForm';
import { PlayerPhoto } from '../components/PlayerPhoto';
import { ErrorBox, Icon, Loading, useAsync } from '../components/ui';
import { ageOn } from '../domain/dates';
import { dataService } from '../services';

export function PlayersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const [players, categories] = await Promise.all([dataService.listPlayers(), dataService.listCategories()]);
    return { players, categories };
  }, []);
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState(params.get('categoria') ?? '');
  const [state, setState] = useState<'active' | 'inactive' | 'all'>('active');
  const creating = params.get('nuevo') === '1';
  const importing = params.get('importar') === '1';

  const list = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.players
      .filter((p) => (state === 'all' ? true : state === 'active' ? p.active : !p.active))
      .filter((p) => !categoryId || p.categoryId === categoryId)
      .filter((p) => !needle || [p.fullName, p.nickname, p.folio, p.jerseyNumber?.toString()].some((v) => v?.toLowerCase().includes(needle)))
      .sort((a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999) || a.fullName.localeCompare(b.fullName));
  }, [data, q, categoryId, state]);

  const catName = (id: string) => data?.categories.find((c) => c.id === id)?.name ?? '—';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Plantilla</h1>
          <p>{list.length} jugador{list.length === 1 ? '' : 'es'} en la vista</p>
        </div>
        {can(user, 'write') && (
          <div className="row wrap">
            <button type="button" className="btn" onClick={() => setParams({ importar: '1' })}><Icon name="download" /> Importar desde Excel</button>
            <button type="button" className="btn btn-primary" onClick={() => setParams({ nuevo: '1' })}><Icon name="plus" /> Nuevo jugador</button>
          </div>
        )}
      </div>
      <div className="toolbar">
        <label className="field" style={{ flex: '1 1 260px' }}><span>Buscar</span><input className="input" type="search" placeholder="Nombre, folio o camiseta" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="field"><span>Categoría</span>
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">Todas</option>
            {data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status === 'archived' ? ' (archivada)' : ''}</option>)}
          </select>
        </label>
        <label className="field"><span>Estado</span>
          <select className="select" value={state} onChange={(e) => setState(e.target.value as typeof state)} style={{ minWidth: 140 }}>
            <option value="active">Activos</option><option value="inactive">Archivados</option><option value="all">Todos</option>
          </select>
        </label>
      </div>
      {error && <ErrorBox message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="player-grid">
          {list.map((p) => (
            <Link key={p.id} to={`/plantilla/${p.id}`} className={`player-card${p.active ? '' : ' inactive'}`}>
              <div className="photo" style={{ height: 160 }}>
                <PlayerPhoto path={p.photoPath} name={p.fullName} />
                {p.jerseyNumber !== undefined && <span className="jersey-badge">{p.jerseyNumber}</span>}
              </div>
              <div style={{ padding: '12px 14px 14px' }}>
                <b style={{ fontSize: 16 }}>{p.fullName}</b>
                <div className="small muted">{p.folio} · {catName(p.categoryId)}</div>
                <div className="small muted">{[p.position, p.birthDate && `${ageOn(p.birthDate)} años`].filter(Boolean).join(' · ')}</div>
                {!p.active && <span className="pill pill-gray" style={{ marginTop: 6 }}>Archivado</span>}
              </div>
            </Link>
          ))}
          {list.length === 0 && <div className="empty" style={{ gridColumn: '1 / -1' }}>No hay jugadores que coincidan.</div>}
        </div>
      )}
      {importing && data && (
        <ImportPlayers
          categories={data.categories}
          players={data.players}
          onClose={() => setParams({})}
          onDone={() => { setParams({}); reload(); }}
        />
      )}
      {creating && data && (
        <PlayerForm
          categories={data.categories}
          defaultCategoryId={categoryId || undefined}
          onClose={() => setParams({})}
          onSaved={(p) => { setParams({}); reload(); navigate(`/plantilla/${p.id}`); }}
        />
      )}
    </>
  );
}
