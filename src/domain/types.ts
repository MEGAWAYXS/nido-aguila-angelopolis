// Modelo de dominio. Independiente del backend: la capa de servicios traduce
// desde/hacia Supabase (snake_case) o el modo demostración.

export type ID = string;
/** Fecha local en formato YYYY-MM-DD. */
export type ISODate = string;

export type Role = 'admin' | 'coach' | 'assistant' | 'viewer';

export interface StaffUser {
  id: ID;
  email: string;
  role: Role;
  displayName: string;
  /** true si es la cuenta compartida de la primera versión. */
  shared: boolean;
}

export type CategoryStatus = 'active' | 'archived';

export interface Category {
  id: ID;
  name: string;
  season: string;
  description?: string;
  coachName?: string;
  status: CategoryStatus;
}

export type DominantFoot = 'right' | 'left' | 'both';

export interface Player {
  id: ID;
  folio: string;
  fullName: string;
  nickname?: string;
  jerseyNumber?: number;
  /** Opcional: las bases importadas pueden no tenerla. */
  birthDate?: ISODate;
  weightKg?: number;
  heightCm?: number;
  categoryId: ID;
  position?: string;
  dominantFoot?: DominantFoot;
  nationality?: string;
  /** Ruta dentro del bucket privado; nunca una URL pública. */
  photoPath?: string;
  notes?: string;
  active: boolean;
}

export type PlayerInput = Omit<Player, 'id' | 'folio'> & { folio?: string };

export interface CategoryChange {
  id: ID;
  playerId: ID;
  fromCategoryId?: ID;
  toCategoryId: ID;
  changedAt: string;
  reason?: string;
}

export type SessionType = 'training' | 'match';
export type SessionStatus = 'scheduled' | 'done' | 'cancelled';

export interface Session {
  id: ID;
  categoryId: ID;
  date: ISODate;
  startTime: string;
  endTime?: string;
  type: SessionType;
  location?: string;
  coachName?: string;
  status: SessionStatus;
  notes?: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'sick' | 'justified';

export interface Attendance {
  id: ID;
  sessionId: ID;
  playerId: ID;
  status: AttendanceStatus;
  reason?: string;
  /** Una AUSENCIA con justificación aprobada deja de ser computable. */
  justificationApproved: boolean;
  updatedAt: string;
}

export interface AttendanceInput {
  sessionId: ID;
  playerId: ID;
  status: AttendanceStatus;
  reason?: string;
  justificationApproved?: boolean;
}

export interface AbsenceRule {
  id: ID;
  /** null = regla global. */
  categoryId: ID | null;
  /** Faltas a partir de las cuales se muestra alerta amarilla. */
  yellowFrom: number;
  /** Faltas a partir de las cuales el jugador queda desconvocado. */
  redFrom: number;
  countSick: boolean;
  countJustified: boolean;
}

export type EligibilityDecision = 'eligible' | 'not_eligible';

export interface EligibilityException {
  id: ID;
  playerId: ID;
  weekStart: ISODate;
  decision: EligibilityDecision;
  reason: string;
  createdAt: string;
  createdBy?: string;
  /** Las excepciones revocadas se conservan como historial. */
  revoked: boolean;
}

export type CallUpStatus = 'called' | 'not_called';

export interface CallUp {
  id: ID;
  playerId: ID;
  weekStart: ISODate;
  status: CallUpStatus;
  note?: string;
  confirmedAt: string;
}
