import type { Attendance, AttendanceInput, ID, Session } from '../../domain/types';
import type { DataService } from '../DataService';
import type { OfflineStore } from './storage';

/** Cambio guardado en el teléfono pendiente de enviar. */
export type OutboxOp =
  | { kind: 'session'; session: Session; createdAt: string }
  | { kind: 'attendance'; sessionId: ID; records: AttendanceInput[]; markDone?: Session; createdAt: string };

export type StoredOp = OutboxOp & { id: number };

export interface OutboxState {
  pending: number;
  syncing: boolean;
  /** Error que no es de conexión (p. ej. permisos): requiere atención. */
  error: string | null;
  online: boolean;
}

type Service = Pick<DataService, 'insertSession' | 'saveAttendance' | 'saveSession'>;

/** ¿El error se debe a falta de conexión (y por tanto conviene reintentar después)? */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const e = err as { message?: unknown; name?: unknown } | null;
  const text = `${String(e?.name ?? '')} ${String(e?.message ?? err ?? '')}`;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|retryablefetch|sin conexi[oó]n/i.test(text);
}

/**
 * Cola de envío: guarda los cambios en el teléfono y los envía en orden cuando hay
 * conexión. Si falla por red se detiene y reintenta más tarde; si falla por otra causa
 * se detiene y muestra el error (sin borrar nada).
 */
export class Outbox {
  private listeners = new Set<(s: OutboxState) => void>();
  private sentListeners = new Set<(n: number) => void>();
  private flushing: Promise<void> | null = null;
  private again = false;
  state: OutboxState = { pending: 0, syncing: false, error: null, online: true };

  constructor(private store: OfflineStore, private service: Service, private isOnline: () => boolean = () => true) {}

  subscribe(fn: (s: OutboxState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Aviso cuando se termina de enviar lo pendiente (n = cambios enviados). */
  onSent(fn: (n: number) => void): () => void {
    this.sentListeners.add(fn);
    return () => {
      this.sentListeners.delete(fn);
    };
  }

  private set(patch: Partial<OutboxState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  async refresh() {
    const ops = await this.store.listOps<OutboxOp>();
    this.set({ pending: ops.length, online: this.isOnline() });
  }

  async list(): Promise<StoredOp[]> {
    return (await this.store.listOps<OutboxOp>()).sort((a, b) => a.id - b.id);
  }

  async enqueue(op: OutboxOp) {
    await this.store.addOp(op);
    await this.refresh();
    void this.flush();
  }

  async clear() {
    await this.store.clearOps();
    this.set({ error: null });
    await this.refresh();
  }

  private async apply(op: OutboxOp) {
    if (op.kind === 'session') {
      await this.service.insertSession(op.session);
      return;
    }
    await this.service.saveAttendance(op.records);
    if (op.markDone) await this.service.saveSession({ ...op.markDone, status: 'done' });
  }

  /** Envía lo pendiente, en orden. Varias llamadas simultáneas comparten el mismo envío. */
  flush(): Promise<void> {
    if (this.flushing) {
      // Algo se encoló durante el envío en curso: se envía en cuanto termine.
      this.again = true;
      return this.flushing;
    }
    this.flushing = (async () => {
      this.set({ online: this.isOnline() });
      if (!this.isOnline()) return;
      const ops = await this.list();
      if (ops.length === 0) return;
      this.set({ syncing: true });
      let sent = 0;
      try {
        for (const op of ops) {
          try {
            await this.apply(op);
          } catch (err) {
            if (!isNetworkError(err)) this.set({ error: err instanceof Error ? err.message : String(err) });
            break;
          }
          await this.store.removeOp(op.id);
          sent++;
          if (this.state.error) this.set({ error: null });
        }
      } finally {
        this.set({ syncing: false });
        await this.refresh();
        if (sent > 0) this.sentListeners.forEach((l) => l(sent));
      }
    })().finally(() => {
      this.flushing = null;
      if (this.again) {
        this.again = false;
        void this.flush();
      }
    });
    return this.flushing;
  }
}

/** Sesiones con lo pendiente aplicado (las creadas sin conexión y las marcadas como realizadas). */
export function overlaySessions(sessions: Session[], ops: OutboxOp[]): Session[] {
  const out = sessions.map((s) => ({ ...s }));
  for (const op of ops) {
    if (op.kind === 'session' && !out.some((s) => s.id === op.session.id)) out.push({ ...op.session });
    if (op.kind === 'attendance' && op.markDone) {
      const s = out.find((x) => x.id === op.markDone!.id);
      if (s && s.status === 'scheduled') s.status = 'done';
    }
  }
  return out;
}

/** Asistencias con lo pendiente aplicado (lo más reciente gana). */
export function overlayAttendance(attendance: Attendance[], ops: OutboxOp[]): Attendance[] {
  const byKey = new Map(attendance.map((a) => [`${a.sessionId}|${a.playerId}`, a]));
  for (const op of ops) {
    if (op.kind !== 'attendance') continue;
    for (const r of op.records) {
      const key = `${r.sessionId}|${r.playerId}`;
      byKey.set(key, {
        id: byKey.get(key)?.id ?? `pendiente-${key}`,
        sessionId: r.sessionId,
        playerId: r.playerId,
        status: r.status,
        reason: r.reason?.trim() || undefined,
        justificationApproved: r.justificationApproved ?? false,
        updatedAt: op.createdAt,
      });
    }
  }
  return [...byKey.values()];
}

/** Sesiones con asistencia aún sin enviar (para marcarlas en pantalla). */
export function pendingSessionIds(ops: OutboxOp[]): Set<ID> {
  return new Set(ops.flatMap((o) => (o.kind === 'attendance' ? [o.sessionId] : [o.session.id])));
}
