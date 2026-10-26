import type {
  AbsenceRule,
  Attendance,
  AttendanceInput,
  CallUp,
  Category,
  CategoryChange,
  EligibilityException,
  ID,
  Player,
  PlayerInput,
  Session,
  StaffUser,
} from '../../domain/types';
import type { DataService } from '../DataService';
import { buildSeed, type DemoData } from './seed';

/**
 * Modo demostración: datos ficticios EN MEMORIA. Los cambios se pierden al
 * recargar y no se comparten entre dispositivos (a propósito: no se simula
 * sincronización con localStorage).
 */
export class DemoService implements DataService {
  readonly mode = 'demo' as const;
  private data: DemoData = buildSeed();
  private history: CategoryChange[] = [];
  private exceptions: EligibilityException[] = [];
  private callUps: CallUp[] = [];
  private photos = new Map<string, string>();
  private user: StaffUser | null = null;
  private listeners = new Set<(u: StaffUser | null) => void>();

  private id(prefix: string) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  private now() {
    return new Date().toISOString();
  }
  private clone<T>(v: T): T {
    return structuredClone(v);
  }

  async getCurrentUser() {
    return this.user;
  }
  async signIn(): Promise<StaffUser> {
    this.user = { id: 'demo-user', email: 'demo@ejemplo.invalid', role: 'coach', displayName: 'Personal (demo)', shared: true };
    this.listeners.forEach((l) => l(this.user));
    return this.user;
  }
  async signOut() {
    this.user = null;
    this.listeners.forEach((l) => l(null));
  }
  onAuthChange(cb: (u: StaffUser | null) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  async listCategories() {
    return this.clone(this.data.categories);
  }
  async saveCategory(input: Omit<Category, 'id'> & { id?: ID }) {
    if (!input.name.trim()) throw new Error('El nombre es obligatorio.');
    if (input.id) {
      const i = this.data.categories.findIndex((c) => c.id === input.id);
      this.data.categories[i] = { ...this.data.categories[i], ...input, id: input.id };
      return this.clone(this.data.categories[i]);
    }
    const c: Category = { ...input, id: this.id('cat') };
    this.data.categories.push(c);
    return this.clone(c);
  }

  async listPlayers() {
    return this.clone(this.data.players);
  }
  async getPlayer(id: ID) {
    return this.clone(this.data.players.find((p) => p.id === id) ?? null);
  }
  async savePlayer(input: Omit<Player, 'id' | 'folio'> & { id?: ID; folio?: string }, changeReason?: string) {
    if (!input.fullName.trim()) throw new Error('El nombre completo es obligatorio.');
    const folio = input.folio?.trim();
    if (folio && this.data.players.some((p) => p.folio === folio && p.id !== input.id)) throw new Error('Ese folio ya existe.');
    if (input.id) {
      const i = this.data.players.findIndex((p) => p.id === input.id);
      const prev = this.data.players[i];
      if (prev.categoryId !== input.categoryId) {
        this.history.push({ id: this.id('hist'), playerId: prev.id, fromCategoryId: prev.categoryId, toCategoryId: input.categoryId, changedAt: this.now(), reason: changeReason });
      }
      this.data.players[i] = { ...prev, ...input, id: prev.id, folio: folio || prev.folio };
      return this.clone(this.data.players[i]);
    }
    const max = Math.max(0, ...this.data.players.map((p) => Number(p.folio.replace(/\D/g, '')) || 0));
    const p: Player = { ...input, id: this.id('ply'), folio: folio || `NAA-${String(max + 1).padStart(4, '0')}` };
    this.data.players.push(p);
    this.history.push({ id: this.id('hist'), playerId: p.id, toCategoryId: p.categoryId, changedAt: this.now(), reason: 'Alta' });
    return this.clone(p);
  }
  async createPlayers(inputs: PlayerInput[]) {
    const out: Player[] = [];
    for (const input of inputs) out.push(await this.savePlayer(input));
    return out;
  }
  async setPlayerActive(id: ID, active: boolean) {
    const p = this.data.players.find((x) => x.id === id);
    if (p) p.active = active;
  }
  async listCategoryHistory(playerId: ID) {
    return this.clone(this.history.filter((h) => h.playerId === playerId).sort((a, b) => b.changedAt.localeCompare(a.changedAt)));
  }
  async uploadPlayerPhoto(playerId: ID, file: File) {
    const path = `${playerId}/${crypto.randomUUID()}`;
    this.photos.set(path, URL.createObjectURL(file));
    const p = this.data.players.find((x) => x.id === playerId);
    if (p) p.photoPath = path;
    return path;
  }
  async getPhotoUrl(path: string) {
    return this.photos.get(path) ?? null;
  }

  async listSessions(from: string, to: string) {
    return this.clone(this.data.sessions.filter((s) => s.date >= from && s.date <= to).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)));
  }
  async saveSession(input: Omit<Session, 'id'> & { id?: ID }) {
    if (input.id) {
      const i = this.data.sessions.findIndex((s) => s.id === input.id);
      this.data.sessions[i] = { ...this.data.sessions[i], ...input, id: input.id };
      return this.clone(this.data.sessions[i]);
    }
    const s: Session = { ...input, id: this.id('ses') };
    this.data.sessions.push(s);
    return this.clone(s);
  }

  async listAttendance(sessionIds: ID[]) {
    const set = new Set(sessionIds);
    return this.clone(this.data.attendance.filter((a) => set.has(a.sessionId)));
  }
  async listPlayerAttendance(playerId: ID) {
    return this.clone(this.data.attendance.filter((a) => a.playerId === playerId));
  }
  async saveAttendance(records: AttendanceInput[]) {
    const out: Attendance[] = [];
    for (const r of records) {
      const existing = this.data.attendance.find((a) => a.sessionId === r.sessionId && a.playerId === r.playerId);
      const next: Attendance = {
        id: existing?.id ?? this.id('att'),
        sessionId: r.sessionId,
        playerId: r.playerId,
        status: r.status,
        reason: r.reason?.trim() || undefined,
        justificationApproved: r.justificationApproved ?? false,
        updatedAt: this.now(),
      };
      if (existing) Object.assign(existing, next);
      else this.data.attendance.push(next);
      out.push(next);
    }
    return this.clone(out);
  }

  async listRules() {
    return this.clone(this.data.rules);
  }
  async saveRule(input: Omit<AbsenceRule, 'id'> & { id?: ID }) {
    const existing = this.data.rules.find((r) => (input.id ? r.id === input.id : r.categoryId === input.categoryId));
    if (existing) {
      Object.assign(existing, input, { id: existing.id });
      return this.clone(existing);
    }
    const r: AbsenceRule = { ...input, id: this.id('rule') };
    this.data.rules.push(r);
    return this.clone(r);
  }
  async deleteRule(id: ID) {
    const r = this.data.rules.find((x) => x.id === id);
    if (r?.categoryId === null) throw new Error('La regla global no se puede eliminar.');
    this.data.rules = this.data.rules.filter((x) => x.id !== id);
  }

  async listExceptions(weekStart?: string) {
    return this.clone(this.exceptions.filter((e) => !weekStart || e.weekStart === weekStart));
  }
  async listPlayerExceptions(playerId: ID) {
    return this.clone(this.exceptions.filter((e) => e.playerId === playerId));
  }
  async addException(input: { playerId: ID; weekStart: string; decision: EligibilityException['decision']; reason: string }) {
    if (!input.reason.trim()) throw new Error('El motivo de la excepción es obligatorio.');
    const e: EligibilityException = { ...input, id: this.id('exc'), createdAt: this.now(), createdBy: this.user?.displayName, revoked: false };
    this.exceptions.push(e);
    return this.clone(e);
  }
  async revokeException(id: ID) {
    const e = this.exceptions.find((x) => x.id === id);
    if (e) e.revoked = true;
  }
  async listCallUps(weekStart: string) {
    return this.clone(this.callUps.filter((c) => c.weekStart === weekStart));
  }
  async listPlayerCallUps(playerId: ID) {
    return this.clone(this.callUps.filter((c) => c.playerId === playerId));
  }
  async confirmCallUps(weekStart: string, items: { playerId: ID; status: CallUp['status']; note?: string }[]) {
    const out: CallUp[] = [];
    for (const it of items) {
      const existing = this.callUps.find((c) => c.weekStart === weekStart && c.playerId === it.playerId);
      const next: CallUp = { id: existing?.id ?? this.id('cu'), weekStart, playerId: it.playerId, status: it.status, note: it.note, confirmedAt: this.now() };
      if (existing) Object.assign(existing, next);
      else this.callUps.push(next);
      out.push(next);
    }
    return this.clone(out);
  }
}
