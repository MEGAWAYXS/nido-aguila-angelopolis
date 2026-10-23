import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AttendanceStatus } from '../domain/types';

export const STATUS_META: Record<AttendanceStatus, { label: string; short: string }> = {
  present: { label: 'Presente', short: 'PRES.' },
  absent: { label: 'Ausente', short: 'AUS.' },
  sick: { label: 'Enfermo', short: 'ENF.' },
  justified: { label: 'Motivo justificado', short: 'JUST.' },
};

export function StatusPill({ status }: { status: AttendanceStatus | 'pending' }) {
  const text = status === 'pending' ? 'Pendiente' : STATUS_META[status].label;
  return <span className={`pill pill-${status}`}>{text}</span>;
}

/** Carga asíncrona con estado de error y recarga. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);
  const reload = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    run()
      .then((d) => { if (id === seq.current) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (id === seq.current) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (id === seq.current) setLoading(false); });
  }, [run]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload };
}

export function Loading() {
  return <div className="empty" role="status">Cargando…</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="error-box" role="alert">{message}</div>;
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" />
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

type ToastState = { text: string; error?: boolean } | null;
let pushToast: (t: ToastState) => void = () => {};
export function toast(text: string, error = false) {
  pushToast({ text, error });
}
export function ToastHost() {
  const [t, setT] = useState<ToastState>(null);
  useEffect(() => {
    pushToast = setT;
  }, []);
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(() => setT(null), 3500);
    return () => clearTimeout(id);
  }, [t]);
  if (!t) return null;
  return <div className={`toast${t.error ? ' error' : ''}`} role="status" aria-live="polite">{t.text}</div>;
}

const PATHS: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  users: 'M16 19c0-2.5-2-4-4-4s-4 1.5-4 4M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 18c0-1.8-1.2-3-3-3.5M17 6.5a2.5 2.5 0 0 1 0 5',
  check: 'M5 12l5 5 9-10',
  table: 'M3 5h18v14H3zM3 10h18M9 5v14',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  rules: 'M4 6h16M4 12h10M4 18h6',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 6l6 6-6 6',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  logout: 'M15 4h4v16h-4M10 17l5-5-5-5M15 12H3',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  camera: 'M4 8h4l2-3h4l2 3h4v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21c0-4 4-6 8-6s8 2 8 6',
  lock: 'M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3',
};

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

export function downloadFile(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
