import { describe, expect, it } from 'vitest';
import type { Attendance, AttendanceInput, Session } from '../../domain/types';
import { DemoService } from '../demo/DemoService';
import { isNetworkError, Outbox, overlayAttendance, overlaySessions, type OutboxOp } from './outbox';
import { createMemoryStore } from './storage';

const session: Session = { id: 's-offline-1', categoryId: 'c1', date: '2026-10-26', startTime: '09:30', type: 'training', status: 'scheduled' };
const rec = (playerId: string, status: AttendanceInput['status']): AttendanceInput => ({ sessionId: session.id, playerId, status });
const now = '2026-10-26T15:00:00Z';

function fakeService(behavior: { failWith?: Error; failAfter?: number } = {}) {
  const calls: string[] = [];
  let n = 0;
  const maybeFail = () => {
    n++;
    if (behavior.failWith && (behavior.failAfter === undefined || n > behavior.failAfter)) throw behavior.failWith;
  };
  return {
    calls,
    service: {
      insertSession: async (s: Session) => { maybeFail(); calls.push(`session:${s.id}`); return s; },
      saveAttendance: async (r: AttendanceInput[]) => { maybeFail(); calls.push(`attendance:${r.length}`); return [] as Attendance[]; },
      saveSession: async (s: Session) => { maybeFail(); calls.push(`done:${s.id}:${s.status}`); return s; },
    },
  };
}

describe('cola de envío sin conexión', () => {
  it('sin conexión guarda en el teléfono y no envía', async () => {
    const { calls, service } = fakeService();
    const box = new Outbox(createMemoryStore(), service, () => false);
    await box.enqueue({ kind: 'attendance', sessionId: session.id, records: [rec('p1', 'present')], createdAt: now });
    await box.flush();
    expect(calls).toEqual([]);
    expect(box.state.pending).toBe(1);
  });

  it('al volver la conexión envía todo en orden (sesión antes que su asistencia) y vacía la cola', async () => {
    const { calls, service } = fakeService();
    let isOnline = false;
    const box = new Outbox(createMemoryStore(), service, () => isOnline);
    let sentNotice = 0;
    box.onSent((n) => (sentNotice = n));
    await box.enqueue({ kind: 'session', session, createdAt: now });
    await box.enqueue({ kind: 'attendance', sessionId: session.id, records: [rec('p1', 'present'), rec('p2', 'absent')], markDone: session, createdAt: now });
    isOnline = true;
    await box.flush();
    expect(calls).toEqual(['session:s-offline-1', 'attendance:2', 'done:s-offline-1:done']);
    expect(box.state.pending).toBe(0);
    expect(sentNotice).toBe(2);
  });

  it('si la conexión se cae a la mitad, conserva lo no enviado y reintenta después', async () => {
    const { calls, service } = fakeService({ failWith: new TypeError('Failed to fetch'), failAfter: 1 });
    const box = new Outbox(createMemoryStore(), service, () => true);
    await box.enqueue({ kind: 'session', session, createdAt: now });
    await box.enqueue({ kind: 'attendance', sessionId: session.id, records: [rec('p1', 'present')], createdAt: now });
    await box.flush();
    await box.flush();
    expect(calls).toEqual(['session:s-offline-1']);
    expect(box.state.pending).toBe(1);
    expect(box.state.error).toBeNull(); // un corte de red no es un error a mostrar
  });

  it('un error que no es de red (p. ej. permisos) se muestra y no borra nada', async () => {
    const { service } = fakeService({ failWith: new Error('No tienes permiso para realizar esta operación.') });
    const box = new Outbox(createMemoryStore(), service, () => true);
    await box.enqueue({ kind: 'attendance', sessionId: session.id, records: [rec('p1', 'present')], createdAt: now });
    await box.flush();
    expect(box.state.pending).toBe(1);
    expect(box.state.error).toMatch(/permiso/);
  });

  it('con el servicio real (demo) reenviar la misma sesión no la duplica ni duplica asistencias', async () => {
    const ds = new DemoService();
    const box = new Outbox(createMemoryStore(), ds, () => true);
    const ops: OutboxOp[] = [
      { kind: 'session', session, createdAt: now },
      { kind: 'attendance', sessionId: session.id, records: [rec('ply-101', 'present')], createdAt: now },
    ];
    for (const op of [...ops, ...ops]) await box.enqueue(op);
    await box.flush();
    expect((await ds.listSessions(session.date, session.date)).filter((s) => s.id === session.id)).toHaveLength(1);
    expect((await ds.listAttendance([session.id])).filter((a) => a.playerId === 'ply-101')).toHaveLength(1);
  });
});

describe('mostrar lo pendiente en pantalla', () => {
  it('aplica sesiones creadas sin conexión y asistencias no enviadas sobre los datos guardados', () => {
    const saved: Attendance[] = [{ id: 'a1', sessionId: session.id, playerId: 'p1', status: 'absent', justificationApproved: false, updatedAt: '2026-10-26T10:00:00Z' }];
    const ops: OutboxOp[] = [
      { kind: 'session', session, createdAt: now },
      { kind: 'attendance', sessionId: session.id, records: [rec('p1', 'present'), rec('p2', 'sick')], markDone: session, createdAt: now },
    ];
    const sessions = overlaySessions([], ops);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('done');
    const att = overlayAttendance(saved, ops);
    expect(att.find((a) => a.playerId === 'p1')?.status).toBe('present');
    expect(att.find((a) => a.playerId === 'p2')?.status).toBe('sick');
  });

  it('reconoce errores de red', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError({ name: 'AuthRetryableFetchError', message: '' })).toBe(true);
    expect(isNetworkError(new Error('Sin conexión a internet.'))).toBe(true);
    expect(isNetworkError(new Error('No tienes permiso'))).toBe(false);
  });
});
