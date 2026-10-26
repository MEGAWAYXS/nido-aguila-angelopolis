import { describe, expect, it } from 'vitest';
import {
  autoMap,
  buildRows,
  findHeaderRow,
  parseBirthDate,
  parseCsv,
  parseFoot,
  parseHeight,
  planImport,
  templateCsv,
  tidyName,
  unknownCategories,
  type Cell,
} from './import';
import type { Category, Player } from './types';

const TODAY = '2026-10-26';
const cats: Category[] = [
  { id: 'c10', name: 'Sub-10', season: '2026', status: 'active' },
  { id: 'c12', name: 'Sub-12', season: '2026', status: 'active' },
];
const existing: Player[] = [
  { id: 'p1', folio: 'NAA-0101', fullName: 'Santiago Ruiz Ortega', birthDate: '2014-02-01', categoryId: 'c12', active: true, jerseyNumber: 1 },
];

describe('reconocer columnas', () => {
  it('mapea encabezados con nombres distintos, acentos y mayúsculas', () => {
    const m = autoMap(['No.', 'NOMBRE DEL ALUMNO', 'F. Nac.', 'Categoría', 'Talla', 'Peso (kg)', 'Pie', 'CURP', 'Teléfono tutor']);
    expect(m).toEqual(['jerseyNumber', 'fullName', 'birthDate', 'category', 'heightCm', 'weightKg', 'dominantFoot', null, null]);
  });

  it('reconoce nombre y apellidos en columnas separadas', () => {
    expect(autoMap(['Nombre(s)', 'Apellido Paterno', 'Apellido Materno'])).toEqual(['firstName', 'lastName1', 'lastName2']);
  });

  it('encuentra la fila de encabezados aunque haya un título arriba', () => {
    const rows: Cell[][] = [['ACADEMIA NIDO ÁGUILA – LISTA 2026'], [], ['Folio', 'Nombre', 'Categoría'], ['A1', 'Juan', 'Sub-10']];
    expect(findHeaderRow(rows)).toBe(2);
  });
});

describe('interpretar valores', () => {
  it('fechas: Excel, número de serie, ISO y DD/MM/AAAA', () => {
    expect(parseBirthDate(new Date(Date.UTC(2014, 2, 14)), TODAY).value).toBe('2014-03-14');
    expect(parseBirthDate(41712, TODAY).value).toBe('2014-03-14');
    expect(parseBirthDate('2014-03-14', TODAY).value).toBe('2014-03-14');
    expect(parseBirthDate('14/03/2014', TODAY).value).toBe('2014-03-14');
    expect(parseBirthDate('14-3-14', TODAY).value).toBe('2014-03-14');
    expect(parseBirthDate('', TODAY)).toEqual({});
    expect(parseBirthDate('31/02/2014', TODAY).error).toBeTruthy();
    expect(parseBirthDate('01/01/2030', TODAY).error).toBeTruthy();
  });

  it('estatura en metros o centímetros y pie dominante en español', () => {
    expect(parseHeight('1.48').value).toBe(148);
    expect(parseHeight('148 cm').value).toBe(148);
    expect(parseHeight('1,48 m').value).toBe(148);
    expect(parseHeight('alto').error).toBeTruthy();
    expect(parseFoot('Zurdo').value).toBe('left');
    expect(parseFoot('D').value).toBe('right');
    expect(parseFoot('ambidiestro').value).toBe('both');
  });

  it('ordena nombres escritos todo en mayúsculas', () => {
    expect(tidyName('DIEGO CASTAÑEDA DE LA ROSA')).toBe('Diego Castañeda de la Rosa');
    expect(tidyName('María José López')).toBe('María José López');
  });
});

describe('armar filas e importar', () => {
  const rows: Cell[][] = [
    ['Nombre', 'Apellidos', 'Dorsal', 'Fecha de nacimiento', 'Categoría', 'Estatura', 'CURP'],
    ['IKER', 'MENDOZA RÍOS', 7, '14/03/2014', 'sub 12', '1.48', 'XXXX000000XXXXXX00'],
    ['Mateo', 'Herrera', '', '', '', '', ''],
    ['', '', 9, '', 'Sub-12', '', ''],
    ['Luis', 'Pérez', 'diez', 'mañana', 'Sub-14', '', ''],
    [null, null, null, null, null, null, null],
    ['Santiago', 'Ruiz Ortega', 1, '01/02/2014', 'Sub-12', '1.50', ''],
    ['Iker', 'Mendoza Ríos', 7, '14/03/2014', 'Sub-12', '', ''],
  ];
  const mapping = autoMap(rows[0]);
  const built = buildRows(rows, 0, mapping, TODAY);

  it('importa lo que haya y omite columnas no mapeadas (CURP)', () => {
    expect(built).toHaveLength(6); // la fila vacía se ignora
    expect(built[0]).toMatchObject({
      line: 2,
      data: { fullName: 'Iker Mendoza Ríos', jerseyNumber: 7, birthDate: '2014-03-14', categoryName: 'sub 12', heightCm: 148 },
      warnings: [],
      errors: [],
    });
    expect(JSON.stringify(built)).not.toContain('XXXX000000');
  });

  it('una fila con solo el nombre también se importa', () => {
    expect(built[1]).toMatchObject({ data: { fullName: 'Mateo Herrera' }, errors: [] });
    expect(built[1].data.birthDate).toBeUndefined();
  });

  it('una fila sin nombre es error; valores raros son avisos y se omiten', () => {
    expect(built[2].errors).toEqual(['Sin nombre']);
    expect(built[3].warnings).toHaveLength(2);
    expect(built[3].data.jerseyNumber).toBeUndefined();
    expect(built[3].data.fullName).toBe('Luis Pérez');
  });

  it('detecta categorías nuevas y duplicados', () => {
    expect(unknownCategories(built, cats)).toEqual(['Sub-14']);
    const plan = planImport(built, existing, cats, { defaultCategoryId: 'c10', updateExisting: false });
    expect(plan.create.map((c) => c.input.fullName)).toEqual(['Iker Mendoza Ríos', 'Mateo Herrera', 'Luis Pérez']);
    expect(plan.create[0].input.categoryId).toBe('c12'); // "sub 12" = "Sub-12"
    expect(plan.create[1].input.categoryId).toBe('c10'); // sin categoría → predeterminada
    expect(plan.create[2].input.categoryId).toBe('c10'); // Sub-14 no existe y no se creó → predeterminada
    expect(plan.skip.map((s) => s.reason)).toEqual(['Sin nombre', 'Ya existe (NAA-0101)', 'Repetido en el archivo (igual que la fila 2)']);
  });

  it('con categorías creadas y "actualizar existentes" solo sobrescribe lo que trae el archivo', () => {
    const plan = planImport(built, existing, cats, {
      defaultCategoryId: 'c10',
      createdCategories: new Map([['sub14', 'c14']]),
      updateExisting: true,
    });
    expect(plan.create.find((c) => c.input.fullName === 'Luis Pérez')!.input.categoryId).toBe('c14');
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].input).toMatchObject({ id: 'p1', folio: 'NAA-0101', heightCm: 150, jerseyNumber: 1, birthDate: '2014-02-01' });
  });
});

describe('CSV', () => {
  it('lee comas o punto y coma, comillas y acentos', () => {
    expect(parseCsv('﻿Nombre;Categoría\n"Pérez; Luis";Sub-12\r\nAna;Sub-10\n')).toEqual([
      ['Nombre', 'Categoría'],
      ['Pérez; Luis', 'Sub-12'],
      ['Ana', 'Sub-10'],
    ]);
  });

  it('la plantilla se reconoce completa al volver a importarla', () => {
    const rows = parseCsv(templateCsv());
    expect(autoMap(rows[0]).every(Boolean)).toBe(true);
    const built = buildRows(rows, 0, autoMap(rows[0]), TODAY);
    expect(built[0].warnings).toEqual([]);
    expect(built[0].data).toMatchObject({ birthDate: '2014-03-14', heightCm: 148, dominantFoot: 'right', jerseyNumber: 10 });
  });
});
