import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { dataService } from '../services';
import { OfflineBar } from './OfflineBar';
import { Icon } from './ui';

const LOGO = `${import.meta.env.BASE_URL}escudo.png`;

const NAV = [
  { to: '/', label: 'Panel', icon: 'home', mobile: true },
  { to: '/asistencia', label: 'Asistencia', icon: 'check', mobile: true },
  { to: '/plantilla', label: 'Plantilla', icon: 'users', mobile: true },
  { to: '/reporte', label: 'Reporte semanal', short: 'Reporte', icon: 'table', mobile: true },
  { to: '/calendario', label: 'Calendario', icon: 'calendar', mobile: true },
  { to: '/categorias', label: 'Categorías', icon: 'layers', mobile: false },
  { to: '/reglas', label: 'Reglas de faltas', icon: 'rules', mobile: false },
];

export function Brand() {
  return (
    <NavLink to="/" className="brand" aria-label="Nido Águila Angelópolis, inicio">
      <img src={LOGO} alt="" />
      <span>
        <span className="brand-name" style={{ display: 'block' }}>NIDO ÁGUILA</span>
        <span className="brand-sub">ANGELÓPOLIS</span>
      </span>
    </NavLink>
  );
}

export function Layout() {
  const { user, signOut } = useAuth();
  const demo = dataService.mode === 'demo';
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav" aria-label="Principal">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          {demo && <span className="demo-chip" style={{ alignSelf: 'flex-start' }}>MODO DEMOSTRACIÓN</span>}
          <span>{user?.displayName}{user?.shared ? ' · cuenta compartida' : ''}</span>
          <button type="button" className="btn btn-sm" style={{ background: 'transparent', color: '#fff', borderColor: '#4a5578' }} onClick={signOut}>
            <Icon name="logout" size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header className="topbar">
          <Brand />
          <span className="spacer" />
          {demo && <span className="demo-chip">DEMO</span>}
          <NavLink to="/categorias" className="btn btn-sm btn-ghost" style={{ color: '#fff' }} aria-label="Categorías"><Icon name="layers" /></NavLink>
          <NavLink to="/reglas" className="btn btn-sm btn-ghost" style={{ color: '#fff' }} aria-label="Reglas de faltas"><Icon name="rules" /></NavLink>
          <button type="button" className="btn btn-sm btn-ghost" style={{ color: '#fff' }} onClick={signOut} aria-label="Cerrar sesión"><Icon name="logout" /></button>
        </header>
        <main className="main">
          {demo && (
            <div className="demo-banner no-print" role="note">
              MODO DEMOSTRACIÓN · Datos ficticios en memoria: los cambios se pierden al recargar y no se comparten entre dispositivos.
            </div>
          )}
          <OfflineBar />
          <Outlet />
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navegación móvil">
        {NAV.filter((n) => n.mobile).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            <Icon name={n.icon} size={22} />
            {n.short ?? n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
