#!/usr/bin/env node
// Comprueba contra un proyecto Supabase REAL que un visitante anónimo (solo con
// la anon key pública) no puede leer ni escribir datos privados ni fotografías.
// Uso: VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run check:rls
//      (o define las variables en .env.local)
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  process.exit(2);
}
// Las claves nuevas (sb_publishable_…) van solo en `apikey`; las antiguas (JWT) también como Bearer.
const headers = { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
if (key.startsWith('sb_secret_') || /service_role/.test(Buffer.from(key.split('.')[1] ?? '', 'base64').toString())) {
  console.error('Esa es una clave SECRETA. Usa la clave pública (anon / publishable).');
  process.exit(2);
}
const tables = ['profiles', 'categories', 'players', 'player_category_history', 'training_sessions', 'attendance', 'absence_rules', 'eligibility_exceptions', 'call_ups', 'guardians', 'player_guardians', 'audit_log'];
let failures = 0;
const fail = (msg) => { failures++; console.log(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

console.log('Lectura anónima de tablas:');
for (const t of tables) {
  const res = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers });
  const body = await res.text();
  if (res.ok && body.trim() !== '[]') fail(`${t}: devolvió datos (${res.status})`);
  else ok(`${t}: sin datos (${res.status})`);
}

console.log('Escritura anónima:');
for (const [t, row] of [['categories', { name: 'x', season: 'x' }], ['attendance', { session_id: '00000000-0000-0000-0000-000000000000', player_id: '00000000-0000-0000-0000-000000000000', status: 'present' }]]) {
  const res = await fetch(`${url}/rest/v1/${t}`, { method: 'POST', headers, body: JSON.stringify(row) });
  if (res.ok) fail(`${t}: se permitió insertar (${res.status})`);
  else ok(`${t}: rechazado (${res.status})`);
}

console.log('Fotografías:');
const list = await fetch(`${url}/storage/v1/object/list/player-photos`, { method: 'POST', headers, body: JSON.stringify({ prefix: '', limit: 5 }) });
const listBody = await list.text();
if (list.ok && listBody.trim() !== '[]') fail(`listado anónimo del bucket devolvió objetos`);
else ok(`listado anónimo vacío o rechazado (${list.status})`);
const pub = await fetch(`${url}/storage/v1/object/public/player-photos/prueba.jpg`);
if (pub.ok) fail('el bucket responde como público');
else ok(`acceso público al bucket rechazado (${pub.status})`);

console.log(failures ? `\n${failures} comprobación(es) FALLARON` : '\nTodas las comprobaciones anónimas pasaron');
process.exit(failures ? 1 : 0);
