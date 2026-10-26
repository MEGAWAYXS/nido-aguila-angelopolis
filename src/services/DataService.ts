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
} from '../domain/types';

/**
 * Contrato entre la interfaz y el backend. La UI solo conoce esta interfaz;
 * la implementación puede ser Supabase o el modo demostración.
 * Toda autorización real ocurre en el backend (RLS); aquí no se confía en la UI.
 */
export interface DataService {
  readonly mode: 'supabase' | 'demo';

  // Autenticación
  getCurrentUser(): Promise<StaffUser | null>;
  signIn(email: string, password: string): Promise<StaffUser>;
  signOut(): Promise<void>;
  onAuthChange(cb: (user: StaffUser | null) => void): () => void;

  // Categorías
  listCategories(): Promise<Category[]>;
  saveCategory(input: Omit<Category, 'id'> & { id?: ID }): Promise<Category>;

  // Jugadores
  listPlayers(): Promise<Player[]>;
  getPlayer(id: ID): Promise<Player | null>;
  savePlayer(input: PlayerInput & { id?: ID }, changeReason?: string): Promise<Player>;
  /** Alta masiva (importación). Los que no traen folio reciben uno automático. */
  createPlayers(inputs: PlayerInput[]): Promise<Player[]>;
  setPlayerActive(id: ID, active: boolean): Promise<void>;
  listCategoryHistory(playerId: ID): Promise<CategoryChange[]>;
  uploadPlayerPhoto(playerId: ID, file: File): Promise<string>;
  /** URL temporal (firmada) para mostrar una fotografía privada. */
  getPhotoUrl(path: string): Promise<string | null>;

  // Calendario
  listSessions(from: ISODate, to: ISODate): Promise<Session[]>;
  saveSession(input: Omit<Session, 'id'> & { id?: ID }): Promise<Session>;
  /** Alta con id generado en el teléfono (modo sin conexión). Si ya existe, no hace nada. */
  insertSession(session: Session): Promise<Session>;

  // Asistencia
  listAttendance(sessionIds: ID[]): Promise<Attendance[]>;
  listPlayerAttendance(playerId: ID): Promise<Attendance[]>;
  /** Inserta o actualiza por (sesión, jugador): nunca crea duplicados. */
  saveAttendance(records: AttendanceInput[]): Promise<Attendance[]>;

  // Reglas de faltas
  listRules(): Promise<AbsenceRule[]>;
  saveRule(input: Omit<AbsenceRule, 'id'> & { id?: ID }): Promise<AbsenceRule>;
  deleteRule(id: ID): Promise<void>;

  // Excepciones y convocatorias
  listExceptions(weekStart?: ISODate): Promise<EligibilityException[]>;
  listPlayerExceptions(playerId: ID): Promise<EligibilityException[]>;
  addException(input: { playerId: ID; weekStart: ISODate; decision: EligibilityDecision; reason: string }): Promise<EligibilityException>;
  revokeException(id: ID): Promise<void>;
  listCallUps(weekStart: ISODate): Promise<CallUp[]>;
  listPlayerCallUps(playerId: ID): Promise<CallUp[]>;
  confirmCallUps(weekStart: ISODate, items: { playerId: ID; status: CallUpStatus; note?: string }[]): Promise<CallUp[]>;
}
