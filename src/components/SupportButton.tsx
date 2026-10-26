import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { config } from '../config';

const SCREENS: Record<string, string> = {
  '': 'Panel',
  acceso: 'Acceso',
  asistencia: 'Asistencia',
  plantilla: 'Plantilla',
  reporte: 'Reporte semanal',
  calendario: 'Calendario',
  categorias: 'Categorías',
  reglas: 'Reglas de faltas',
};

/** Mensaje inicial: pantalla y usuario, para dar contexto sin incluir datos de jugadores. */
export function supportMessage(pathname: string, userName?: string): string {
  const first = pathname.split('/').filter(Boolean)[0] ?? '';
  const screen = first === 'plantilla' && pathname.split('/').length > 2 ? 'Ficha de jugador' : SCREENS[first] ?? first;
  return [
    'Hola, necesito soporte con la app Nido Águila Angelópolis.',
    `Pantalla: ${screen}`,
    userName ? `Usuario: ${userName}` : null,
    '',
    'Mi duda o problema es: ',
  ].filter((l) => l !== null).join('\n');
}

export function SupportButton() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  if (!config.supportWhatsApp) return null;
  const href = `https://wa.me/${config.supportWhatsApp}?text=${encodeURIComponent(supportMessage(pathname, user?.displayName))}`;
  return (
    <a className={`support-fab no-print${pathname.startsWith('/asistencia') ? ' raised' : ''}`} href={href} target="_blank" rel="noopener noreferrer" aria-label="Soporte por WhatsApp" title="Soporte por WhatsApp">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.6-5.4A8.4 8.4 0 1 1 21 11.5z" />
        <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1a3.5 3.5 0 0 1-2-2l1-1-1-2z" />
      </svg>
      <span>Soporte</span>
    </a>
  );
}
