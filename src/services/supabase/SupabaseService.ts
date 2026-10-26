import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { config } from '../../config';
import type {
  AbsenceRule,
  Attendance,
  AttendanceInput,
  CallUp,
  CallUpStatus,
  Category,
  CategoryChange,
  EligibilityDecision,
  EligibilityException,
  ID,
  ISODate,
  Player,
  PlayerInput,
  Session,
  StaffUser,
} from '../../domain/types';
import type { DataService } from '../DataService';

// Filas tal como vienen de PostgreSQL (snake_case).
type Row = Record<string, unknown>;

const s = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
const n = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

function toCategory(r: Row): Category {
  return { id: String(r.id), name: String(r.name), season: String(r.season), description: s(r.description), coachName: s(r.coach_name), status: r.status as Category['status'] };
}
function fromCategory(c: Omit<Category, 'id'>): Row {
  return { name: c.name.trim(), season: c.season.trim(), description: c.description || null, coach_name: c.coachName || null, status: c.status };
}
function toPlayer(r: Row): Player {
  return {
    id: String(r.id),
    folio: String(r.folio),
    fullName: String(r.full_name),
    nickname: s(r.nickname),
    jerseyNumber: n(r.jersey_number),
    birthDate: s(r.birth_date),
    weightKg: n(r.weight_kg),
    heightCm: n(r.height_cm),
    categoryId: String(r.category_id),
    position: s(r.position),
    dominantFoot: s(r.dominant_foot) as Player['dominantFoot'],
    nationality: s(r.nationality),
    photoPath: s(r.photo_path),
    notes: s(r.notes),
    active: Boolean(r.active),
  };
}
function fromPlayer(p: PlayerInput): Row {
  const row: Row = {
    full_name: p.fullName.trim(),
    nickname: p.nickname || null,
    jersey_number: p.jerseyNumber ?? null,
    birth_date: p.birthDate || null,
    weight_kg: p.weightKg ?? null,
    height_cm: p.heightCm ?? null,
    position: p.position || null,
    dominant_foot: p.dominantFoot || null,
    nationality: p.nationality || null,
    notes: p.notes || null,
    active: p.active,
  };
  if (p.folio?.trim()) row.folio = p.folio.trim();
  return row;
}
function toSession(r: Row): Session {
  return {
    id: String(r.id),
    categoryId: String(r.category_id),
    date: String(r.date),
    startTime: String(r.start_time).slice(0, 5),
    endTime: r.end_time ? String(r.end_time).slice(0, 5) : undefined,
    type: r.type as Session['type'],
    location: s(r.location),
    coachName: s(r.coach_name),
    status: r.status as Session['status'],
    notes: s(r.notes),
  };
}
function toAttendance(r: Row): Attendance {
  return { id: String(r.id), sessionId: String(r.session_id), playerId: String(r.player_id), status: r.status as Attendance['status'], reason: s(r.reason), justificationApproved: Boolean(r.justification_approved), updatedAt: String(r.updated_at) };
}
function toRule(r: Row): AbsenceRule {
  return { id: String(r.id), categoryId: r.category_id ? String(r.category_id) : null, yellowFrom: Number(r.yellow_from), redFrom: Number(r.red_from), countSick: Boolean(r.count_sick), countJustified: Boolean(r.count_justified) };
}
function toException(r: Row): EligibilityException {
  return { id: String(r.id), playerId: String(r.player_id), weekStart: String(r.week_start), decision: r.decision as EligibilityDecision, reason: String(r.reason), createdAt: String(r.created_at), revoked: Boolean(r.revoked) };
}
function toCallUp(r: Row): CallUp {
  return { id: String(r.id), playerId: String(r.player_id), weekStart: String(r.week_start), status: r.status as CallUpStatus, note: s(r.note), confirmedAt: String(r.confirmed_at) };
}

/** Traduce errores de PostgREST/RLS a mensajes comprensibles. */
function check<T>(res: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> {
  if (res.error) {
    if (res.error.code === '42501' || /row-level security/i.test(res.error.message)) {
      throw new Error('No tienes permiso para realizar esta operación.');
    }
    if (res.error.code === '23505') throw new Error('Ya existe un registro con ese valor (duplicado).');
    throw new Error(res.error.message);
  }
  // Sin error, PostgREST devuelve datos (o null en maybeSingle/delete, que se tratan aparte).
  return res.data as NonNullable<T>;
}

export class SupabaseService implements DataService {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;

  constructor() {
    this.sb = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  private async toStaff(user: User | null): Promise<StaffUser | null> {
    if (!user) return null;
    const { data } = await this.sb.from('profiles').select('role, display_name, is_shared_account, active').eq('user_id', user.id).maybeSingle();
    // Usuario autenticado pero sin perfil activo: no es personal autorizado.
    if (!data || !data.active) return null;
    return { id: user.id, email: user.email ?? '', role: data.role, displayName: data.display_name || user.email || 'Personal', shared: data.is_shared_account };
  }

  async getCurrentUser() {
    const { data } = await this.sb.auth.getUser(); // valida el token contra el servidor
    return this.toStaff(data.user);
  }
  async signIn(email: string, password: string) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Correo o contraseña incorrectos.');
    const staff = await this.toStaff(data.user);
    if (!staff) {
      await this.sb.auth.signOut();
      throw new Error('Esta cuenta no está autorizada como personal.');
    }
    return staff;
  }
  async signOut() {
    await this.sb.auth.signOut();
  }
  onAuthChange(cb: (u: StaffUser | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') cb(null);
      else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Fuera del callback para no bloquear el cliente de auth.
        setTimeout(() => void this.toStaff(session?.user ?? null).then(cb), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }

  async listCategories() {
    return check(await this.sb.from('categories').select('*').order('name')).map(toCategory);
  }
  async saveCategory(input: Omit<Category, 'id'> & { id?: ID }) {
    const q = input.id
      ? this.sb.from('categories').update(fromCategory(input)).eq('id', input.id).select().single()
      : this.sb.from('categories').insert(fromCategory(input)).select().single();
    return toCategory(check(await q));
  }

  async listPlayers() {
    return check(await this.sb.from('players').select('*').order('full_name')).map(toPlayer);
  }
  async getPlayer(id: ID) {
    const row: Row | null = check(await this.sb.from('players').select('*').eq('id', id).maybeSingle());
    return row ? toPlayer(row) : null;
  }
  async savePlayer(input: PlayerInput & { id?: ID }, changeReason?: string) {
    if (!input.id) {
      return toPlayer(check(await this.sb.from('players').insert({ ...fromPlayer(input), category_id: input.categoryId }).select().single()));
    }
    const current = await this.getPlayer(input.id);
    if (!current) throw new Error('Jugador no encontrado.');
    check(await this.sb.from('players').update(fromPlayer(input)).eq('id', input.id).select().single());
    if (current.categoryId !== input.categoryId) {
      check(await this.sb.rpc('change_player_category', { p_player: input.id, p_category: input.categoryId, p_reason: changeReason ?? null }));
    }
    return (await this.getPlayer(input.id))!;
  }
  async createPlayers(inputs: PlayerInput[]) {
    const out: Player[] = [];
    // Por lotes: cada lote es una sola petición (y una transacción en PostgreSQL).
    for (let i = 0; i < inputs.length; i += 200) {
      const rows = inputs.slice(i, i + 200).map((p) => ({ ...fromPlayer(p), category_id: p.categoryId }));
      out.push(...check(await this.sb.from('players').insert(rows).select()).map(toPlayer));
    }
    return out;
  }
  async setPlayerActive(id: ID, active: boolean) {
    check(await this.sb.from('players').update({ active }).eq('id', id).select('id').single());
  }
  async listCategoryHistory(playerId: ID): Promise<CategoryChange[]> {
    const rows = check(await this.sb.from('player_category_history').select('*').eq('player_id', playerId).order('changed_at', { ascending: false }));
    return rows.map((r: Row) => ({ id: String(r.id), playerId: String(r.player_id), fromCategoryId: s(r.from_category_id), toCategoryId: String(r.to_category_id), changedAt: String(r.changed_at), reason: s(r.reason) }));
  }
  async uploadPlayerPhoto(playerId: ID, file: File) {
    if (file.size > 5 * 1024 * 1024) throw new Error('La fotografía no puede pesar más de 5 MB.');
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${playerId}/${crypto.randomUUID()}.${ext}`;
    check(await this.sb.storage.from(config.photoBucket).upload(path, file, { contentType: file.type, upsert: false }));
    const prev = await this.getPlayer(playerId);
    check(await this.sb.from('players').update({ photo_path: path }).eq('id', playerId).select('id').single());
    // Minimización de datos: se elimina la foto anterior.
    if (prev?.photoPath) await this.sb.storage.from(config.photoBucket).remove([prev.photoPath]);
    return path;
  }
  async getPhotoUrl(path: string) {
    const { data } = await this.sb.storage.from(config.photoBucket).createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  }

  async listSessions(from: ISODate, to: ISODate) {
    return check(await this.sb.from('training_sessions').select('*').gte('date', from).lte('date', to).order('date').order('start_time')).map(toSession);
  }
  async saveSession(input: Omit<Session, 'id'> & { id?: ID }) {
    const row = {
      category_id: input.categoryId,
      date: input.date,
      start_time: input.startTime,
      end_time: input.endTime || null,
      type: input.type,
      location: input.location || null,
      coach_name: input.coachName || null,
      status: input.status,
      notes: input.notes || null,
    };
    const q = input.id
      ? this.sb.from('training_sessions').update(row).eq('id', input.id).select().single()
      : this.sb.from('training_sessions').insert(row).select().single();
    return toSession(check(await q));
  }

  async listAttendance(sessionIds: ID[]) {
    if (sessionIds.length === 0) return [];
    const out: Attendance[] = [];
    // Por lotes para no exceder el tamaño de URL.
    for (let i = 0; i < sessionIds.length; i += 100) {
      const rows = check(await this.sb.from('attendance').select('*').in('session_id', sessionIds.slice(i, i + 100)));
      out.push(...rows.map(toAttendance));
    }
    return out;
  }
  async listPlayerAttendance(playerId: ID) {
    return check(await this.sb.from('attendance').select('*').eq('player_id', playerId)).map(toAttendance);
  }
  async saveAttendance(records: AttendanceInput[]) {
    if (records.length === 0) return [];
    const rows = records.map((r) => ({
      session_id: r.sessionId,
      player_id: r.playerId,
      status: r.status,
      reason: r.reason?.trim() || null,
      justification_approved: r.justificationApproved ?? false,
    }));
    return check(await this.sb.from('attendance').upsert(rows, { onConflict: 'session_id,player_id' }).select()).map(toAttendance);
  }

  async listRules() {
    return check(await this.sb.from('absence_rules').select('*')).map(toRule);
  }
  async saveRule(input: Omit<AbsenceRule, 'id'> & { id?: ID }) {
    const row = { category_id: input.categoryId, yellow_from: input.yellowFrom, red_from: input.redFrom, count_sick: input.countSick, count_justified: input.countJustified };
    const q = input.id
      ? this.sb.from('absence_rules').update(row).eq('id', input.id).select().single()
      : this.sb.from('absence_rules').insert(row).select().single();
    return toRule(check(await q));
  }
  async deleteRule(id: ID) {
    check(await this.sb.from('absence_rules').delete().eq('id', id));
  }

  async listExceptions(weekStart?: ISODate) {
    let q = this.sb.from('eligibility_exceptions').select('*').order('created_at', { ascending: false });
    if (weekStart) q = q.eq('week_start', weekStart);
    return check(await q).map(toException);
  }
  async listPlayerExceptions(playerId: ID) {
    return check(await this.sb.from('eligibility_exceptions').select('*').eq('player_id', playerId).order('created_at', { ascending: false })).map(toException);
  }
  async addException(input: { playerId: ID; weekStart: ISODate; decision: EligibilityDecision; reason: string }) {
    return toException(check(await this.sb.from('eligibility_exceptions').insert({ player_id: input.playerId, week_start: input.weekStart, decision: input.decision, reason: input.reason.trim() }).select().single()));
  }
  async revokeException(id: ID) {
    check(await this.sb.from('eligibility_exceptions').update({ revoked: true, revoked_at: new Date().toISOString() }).eq('id', id).select('id').single());
  }
  async listCallUps(weekStart: ISODate) {
    return check(await this.sb.from('call_ups').select('*').eq('week_start', weekStart)).map(toCallUp);
  }
  async listPlayerCallUps(playerId: ID) {
    return check(await this.sb.from('call_ups').select('*').eq('player_id', playerId).order('week_start', { ascending: false })).map(toCallUp);
  }
  async confirmCallUps(weekStart: ISODate, items: { playerId: ID; status: CallUpStatus; note?: string }[]) {
    if (items.length === 0) return [];
    const rows = items.map((i) => ({ player_id: i.playerId, week_start: weekStart, status: i.status, note: i.note || null, confirmed_at: new Date().toISOString() }));
    return check(await this.sb.from('call_ups').upsert(rows, { onConflict: 'player_id,week_start' }).select()).map(toCallUp);
  }
}
