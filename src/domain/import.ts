import { normalizeHeightCm, todayISO, toISODate } from './dates';
import type { Category, DominantFoot, ID, ISODate, Player, PlayerInput } from './types';

// Importación de jugadores desde Excel/CSV. Lógica pura (sin interfaz ni red):
// reconocer columnas, interpretar valores, detectar duplicados y armar el plan.

export type Cell = string | number | boolean | Date | null | undefined;

export type ImportField =
  | 'fullName'
  | 'firstName'
  | 'lastName1'
  | 'lastName2'
  | 'nickname'
  | 'folio'
  | 'jerseyNumber'
  | 'birthDate'
  | 'weightKg'
  | 'heightCm'
  | 'category'
  | 'position'
  | 'dominantFoot'
  | 'nationality'
  | 'notes'
  | 'active';

export const FIELD_LABELS: Record<ImportField, string> = {
  fullName: 'Nombre completo',
  firstName: 'Nombre(s)',
  lastName1: 'Apellidos / apellido paterno',
  lastName2: 'Apellido materno',
  nickname: 'Nombre deportivo',
  folio: 'Folio',
  jerseyNumber: 'Número de camiseta',
  birthDate: 'Fecha de nacimiento',
  weightKg: 'Peso (kg)',
  heightCm: 'Estatura (m o cm)',
  category: 'Categoría',
  position: 'Posición',
  dominantFoot: 'Pie dominante',
  nationality: 'Nacionalidad',
  notes: 'Observaciones',
  active: 'Estado (activo/baja)',
};

/** Encabezados reconocidos (ya normalizados: minúsculas, sin acentos ni signos). */
const SYNONYMS: Record<ImportField, string[]> = {
  fullName: ['nombre completo', 'nombre del jugador', 'jugador', 'nombre y apellidos', 'nombre apellidos', 'alumno', 'nombre del alumno', 'nombre'],
  firstName: ['nombres', 'nombre s', 'primer nombre'],
  lastName1: ['apellido paterno', 'ap paterno', 'paterno', 'primer apellido', 'apellidos', 'apellido'],
  lastName2: ['apellido materno', 'ap materno', 'materno', 'segundo apellido'],
  nickname: ['nombre deportivo', 'apodo', 'sobrenombre', 'alias'],
  folio: ['folio', 'matricula', 'id', 'clave', 'no de registro', 'registro', 'id jugador'],
  jerseyNumber: ['numero de camiseta', 'camiseta', 'dorsal', 'numero', 'no', 'num', 'playera', 'no camiseta'],
  birthDate: ['fecha de nacimiento', 'fecha nacimiento', 'nacimiento', 'f nac', 'f de nac', 'fecha nac', 'fec nac', 'cumpleanos'],
  weightKg: ['peso', 'peso kg', 'kg'],
  heightCm: ['estatura', 'altura', 'talla', 'estatura cm', 'estatura m', 'altura cm'],
  category: ['categoria', 'cat', 'equipo', 'grupo'],
  position: ['posicion', 'pos', 'puesto'],
  dominantFoot: ['pie dominante', 'pie', 'perfil', 'lateralidad', 'pierna habil'],
  nationality: ['nacionalidad', 'pais'],
  notes: ['observaciones', 'notas', 'comentarios', 'observaciones deportivas'],
  active: ['estado', 'estatus', 'activo', 'status'],
};

export function normalizeText(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Asigna a cada encabezado el campo que mejor coincide; cada campo se usa una sola vez. */
export function autoMap(headers: Cell[]): (ImportField | null)[] {
  const normalized = headers.map(normalizeText);
  const result: (ImportField | null)[] = normalized.map(() => null);
  const used = new Set<ImportField>();
  // Primero coincidencias exactas, después parciales (el encabezado contiene el sinónimo).
  for (const exact of [true, false]) {
    normalized.forEach((h, i) => {
      if (!h || result[i]) return;
      for (const field of Object.keys(SYNONYMS) as ImportField[]) {
        if (used.has(field)) continue;
        const hit = SYNONYMS[field].some((syn) => (exact ? h === syn : syn.length > 3 && (h.startsWith(syn + ' ') || h.endsWith(' ' + syn))));
        if (hit) {
          result[i] = field;
          used.add(field);
          return;
        }
      }
    });
  }
  return result;
}

/** Fila de encabezados: la primera, entre las 10 primeras, con más columnas reconocidas. */
export function findHeaderRow(rows: Cell[][]): number {
  let best = -1;
  let bestHits = 0;
  rows.slice(0, 10).forEach((row, i) => {
    const hits = autoMap(row).filter(Boolean).length;
    if (hits > bestHits) {
      best = i;
      bestHits = hits;
    }
  });
  if (best >= 0) return best;
  return Math.max(0, rows.findIndex((r) => r.some((c) => String(c ?? '').trim() !== '')));
}

type Parsed<T> = { value?: T; error?: string };

const isEmpty = (v: Cell) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function validDate(y: number, m: number, d: number): ISODate | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Acepta fechas de Excel, números de serie, AAAA-MM-DD y DD/MM/AAAA (formato mexicano). */
export function parseBirthDate(v: Cell, today: ISODate = todayISO()): Parsed<ISODate> {
  if (isEmpty(v)) return {};
  let iso: ISODate | null = null;
  if (v instanceof Date) {
    if (!Number.isNaN(v.getTime())) iso = validDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  } else if (typeof v === 'number') {
    // Número de serie de Excel (días desde 1899-12-30).
    if (v > 20000 && v < 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      iso = toISODate(new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    }
  } else {
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) iso = validDate(+m[1], +m[2], +m[3]);
    else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
      let y = +m[3];
      if (m[3].length === 2) {
        const yy = Number(today.slice(2, 4));
        y += y <= yy ? 2000 : 1900;
      }
      iso = validDate(y, +m[2], +m[1]);
    }
  }
  if (!iso) return { error: `Fecha no reconocida: "${String(v)}"` };
  if (iso > today || iso < '1990-01-01') return { error: `Fecha fuera de rango: ${iso}` };
  return { value: iso };
}

function parseNumber(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (isEmpty(v) || typeof v !== 'string') return null;
  const s = v.toLowerCase().replace(/kg|kgs|cm|mts|mt|m/g, '').replace(',', '.').trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function parseWeight(v: Cell): Parsed<number> {
  if (isEmpty(v)) return {};
  const n = parseNumber(v);
  if (n === null || n <= 0 || n >= 200) return { error: `Peso no válido: "${String(v)}"` };
  return { value: Math.round(n * 10) / 10 };
}

export function parseHeight(v: Cell): Parsed<number> {
  if (isEmpty(v)) return {};
  const n = parseNumber(v);
  const cm = n === null ? null : normalizeHeightCm(n);
  if (cm === null || cm < 50 || cm > 250) return { error: `Estatura no válida: "${String(v)}"` };
  return { value: cm };
}

export function parseJersey(v: Cell): Parsed<number> {
  if (isEmpty(v)) return {};
  const n = parseNumber(typeof v === 'string' ? v.replace(/^#/, '') : v);
  if (n === null || !Number.isInteger(n) || n < 0 || n > 999) return { error: `Número de camiseta no válido: "${String(v)}"` };
  return { value: n };
}

export function parseFoot(v: Cell): Parsed<DominantFoot> {
  if (isEmpty(v)) return {};
  const s = normalizeText(v);
  if (['derecho', 'derecha', 'diestro', 'd', 'der', 'right', 'r'].includes(s)) return { value: 'right' };
  if (['izquierdo', 'izquierda', 'zurdo', 'i', 'izq', 'left', 'l'].includes(s)) return { value: 'left' };
  if (['ambos', 'ambas', 'ambidiestro', 'ambidextro', 'both'].includes(s)) return { value: 'both' };
  return { error: `Pie dominante no reconocido: "${String(v)}"` };
}

export function parseActive(v: Cell): boolean {
  if (isEmpty(v)) return true;
  if (typeof v === 'boolean') return v;
  const s = normalizeText(v);
  return !['inactivo', 'inactiva', 'baja', 'no', '0', 'false', 'archivado', 'dado de baja'].includes(s);
}

const text = (v: Cell) => {
  if (isEmpty(v)) return undefined;
  if (v instanceof Date) return toISODate(v);
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s || undefined;
};

/** Nombre propio en formato "Título" si viene todo en mayúsculas o minúsculas. */
export function tidyName(s: string): string {
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y)\b/g, (w, _x, offset: number) => (offset === 0 ? w : w.toLowerCase()));
}

export interface ImportRow {
  /** Número de fila en el archivo (1 = primera fila). */
  line: number;
  data: Partial<Omit<PlayerInput, 'categoryId'>> & { fullName?: string; categoryName?: string };
  /** Valores que no se pudieron interpretar: se omiten, el resto de la fila sí se importa. */
  warnings: string[];
  /** Errores que impiden importar la fila. */
  errors: string[];
}

/** Convierte las filas de datos en jugadores según el mapeo de columnas. */
export function buildRows(rows: Cell[][], headerIndex: number, mapping: (ImportField | null)[], today: ISODate = todayISO()): ImportRow[] {
  const out: ImportRow[] = [];
  rows.slice(headerIndex + 1).forEach((row, i) => {
    if (row.every(isEmpty)) return;
    const get = (f: ImportField) => {
      const idx = mapping.indexOf(f);
      return idx >= 0 ? row[idx] : undefined;
    };
    const r: ImportRow = { line: headerIndex + i + 2, data: {}, warnings: [], errors: [] };
    // "Nombre" puede venir solo con los nombres y los apellidos en otras columnas.
    const base = text(get('fullName')) ?? text(get('firstName'));
    const name = [base, text(get('lastName1')), text(get('lastName2'))].filter(Boolean).join(' ') || undefined;
    if (name) r.data.fullName = tidyName(name);
    else r.errors.push('Sin nombre');

    const take = <T,>(p: Parsed<T>, set: (v: T) => void) => {
      if (p.error) r.warnings.push(p.error);
      else if (p.value !== undefined) set(p.value);
    };
    take(parseBirthDate(get('birthDate'), today), (v) => (r.data.birthDate = v));
    take(parseWeight(get('weightKg')), (v) => (r.data.weightKg = v));
    take(parseHeight(get('heightCm')), (v) => (r.data.heightCm = v));
    take(parseJersey(get('jerseyNumber')), (v) => (r.data.jerseyNumber = v));
    take(parseFoot(get('dominantFoot')), (v) => (r.data.dominantFoot = v));
    const set = (k: 'nickname' | 'folio' | 'position' | 'nationality' | 'notes' | 'categoryName', f: ImportField) => {
      const v = text(get(f));
      if (v) r.data[k] = v;
    };
    set('nickname', 'nickname');
    set('folio', 'folio');
    set('position', 'position');
    set('nationality', 'nationality');
    set('notes', 'notes');
    set('categoryName', 'category');
    if (r.data.nickname) r.data.nickname = tidyName(r.data.nickname);
    if (r.data.folio) r.data.folio = r.data.folio.toUpperCase();
    if (mapping.includes('active')) r.data.active = parseActive(get('active'));
    out.push(r);
  });
  return out;
}

export const categoryKey = (s: string) => normalizeText(s).replace(/\s+/g, '');

/** Busca una categoría existente por nombre ("Sub 12", "SUB-12" y "sub12" son la misma). */
export function matchCategory(name: string | undefined, categories: Category[]): Category | undefined {
  if (!name) return undefined;
  const key = categoryKey(name);
  return categories.find((c) => categoryKey(c.name) === key);
}

/** Nombres de categoría del archivo que no existen todavía. */
export function unknownCategories(rows: ImportRow[], categories: Category[]): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const n = r.data.categoryName;
    if (n && !matchCategory(n, categories) && !seen.has(categoryKey(n))) seen.set(categoryKey(n), n);
  }
  return [...seen.values()];
}

const nameKey = (s: string) => normalizeText(s);

/** Jugador ya registrado: por folio, o por nombre (y fecha de nacimiento si ambos la tienen). */
export function findExisting(data: ImportRow['data'], players: Player[]): Player | undefined {
  if (data.folio) {
    const byFolio = players.find((p) => p.folio.toUpperCase() === data.folio!.toUpperCase());
    if (byFolio) return byFolio;
  }
  if (!data.fullName) return undefined;
  const key = nameKey(data.fullName);
  return players.find((p) => nameKey(p.fullName) === key && (!p.birthDate || !data.birthDate || p.birthDate === data.birthDate));
}

export interface ImportOptions {
  /** Categoría para filas sin categoría o con una categoría no reconocida. */
  defaultCategoryId: ID;
  /** Nombre normalizado de categoría nueva → id (si se decidió crearlas). */
  createdCategories?: Map<string, ID>;
  /** Si es true, los jugadores existentes se actualizan con los datos que traiga el archivo. */
  updateExisting: boolean;
}

export interface ImportPlan {
  create: { line: number; input: PlayerInput }[];
  update: { line: number; player: Player; input: PlayerInput & { id: ID } }[];
  skip: { line: number; name?: string; reason: string }[];
}

export function planImport(rows: ImportRow[], players: Player[], categories: Category[], opts: ImportOptions): ImportPlan {
  const plan: ImportPlan = { create: [], update: [], skip: [] };
  const seenInFile = new Map<string, number>();
  const resolveCategory = (name?: string): ID => {
    if (!name) return opts.defaultCategoryId;
    return matchCategory(name, categories)?.id ?? opts.createdCategories?.get(categoryKey(name)) ?? opts.defaultCategoryId;
  };
  for (const r of rows) {
    const name = r.data.fullName;
    if (r.errors.length) {
      plan.skip.push({ line: r.line, name, reason: r.errors.join('; ') });
      continue;
    }
    const fileKey = r.data.folio ? `f:${r.data.folio}` : `n:${nameKey(name!)}|${r.data.birthDate ?? ''}`;
    if (seenInFile.has(fileKey)) {
      plan.skip.push({ line: r.line, name, reason: `Repetido en el archivo (igual que la fila ${seenInFile.get(fileKey)})` });
      continue;
    }
    seenInFile.set(fileKey, r.line);
    const { categoryName, ...data } = r.data;
    const existing = findExisting(r.data, players);
    if (existing) {
      if (!opts.updateExisting) {
        plan.skip.push({ line: r.line, name, reason: `Ya existe (${existing.folio})` });
        continue;
      }
      // Solo se sobrescriben los campos que el archivo trae con dato.
      const merged: PlayerInput & { id: ID } = { ...existing, ...data, fullName: existing.fullName, folio: existing.folio };
      if (categoryName) merged.categoryId = resolveCategory(categoryName);
      plan.update.push({ line: r.line, player: existing, input: merged });
      continue;
    }
    plan.create.push({
      line: r.line,
      input: { ...data, fullName: name!, categoryId: resolveCategory(categoryName), active: data.active ?? true },
    });
  }
  return plan;
}

/** Lee un CSV (separado por comas o punto y coma, con comillas). */
export function parseCsv(content: string): Cell[][] {
  const textContent = content.replace(/^﻿/, '');
  const firstLine = textContent.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < textContent.length; i++) {
    const ch = textContent[i];
    if (quoted) {
      if (ch === '"' && textContent[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && textContent[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export const TEMPLATE_HEADERS: ImportField[] = ['folio', 'fullName', 'nickname', 'jerseyNumber', 'birthDate', 'weightKg', 'heightCm', 'category', 'position', 'dominantFoot', 'nationality', 'notes'];

/** Plantilla CSV (abre en Excel) con los encabezados que se reconocen automáticamente. */
export function templateCsv(): string {
  const header = TEMPLATE_HEADERS.map((f) => FIELD_LABELS[f]).join(',');
  const example = ['', 'Nombre Apellido Apellido', '', '10', '14/03/2014', '41', '1.48', 'Sub-12', 'Medio', 'Derecho', 'Mexicana', ''].join(',');
  return '﻿' + header + '\n' + example + '\n';
}
