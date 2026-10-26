# Nido Águila Angelópolis

Aplicación web de gestión para la academia de fútbol filial del Club América: categorías, jugadores, fotografías, asistencia diaria, faltas semanales, calendario y convocatorias. La usan entrenadores y personal desde celulares y computadoras. Los padres no tienen acceso en esta versión; el esquema ya contempla un futuro portal de familias.

> **Estado actual (23 oct 2026):** publicado en **https://nidoangelopolis.pages.dev** (Cloudflare Pages) y conectado a Supabase (proyecto `nido-aguila-angelopolis`, plan gratuito). La migración está aplicada, la cuenta compartida está autorizada como `coach` y las comprobaciones de acceso anónimo pasan. **Pendiente antes de cargar datos reales:** desactivar el registro abierto en Supabase (se dejó activo para la demo) y completar la lista de [docs/operacion.md](docs/operacion.md).

## 1. Arquitectura

```
Navegador (React + TypeScript + Vite, PWA)
 ├─ src/pages        Pantallas (módulos 1–7)
 ├─ src/domain       Reglas puras: faltas, elegibilidad, semanas, edades, reporte (con pruebas)
 ├─ src/services     DataService (contrato)  ← la UI solo habla con esto
 │    ├─ supabase/   Implementación real: PostgreSQL + Auth + Storage privado
 │    └─ demo/       Datos ficticios en memoria (sin backend)
 └─ public/          Escudo e iconos PWA
Cloudflare Pages →  solo archivos estáticos (sin datos); código en GitHub
Supabase      →  datos, autenticación y fotografías, protegidos con RLS
```

- **Modo de datos:** si existen `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, la app usa Supabase. Si no, arranca en **MODO DEMOSTRACIÓN**, claramente señalado, con datos ficticios **en memoria**: los cambios se pierden al recargar y no se sincronizan entre dispositivos (no se simula sincronización con localStorage).
- **Rutas:** `HashRouter` (`/#/plantilla`) para que recargar o compartir enlaces funcione en cualquier hosting estático sin reescrituras.
- **Seguridad:** la autorización vive en PostgreSQL (RLS). La interfaz oculta botones según el rol solo por comodidad.
- **PWA:** instalable (manifest + service worker). Solo se guarda en caché la interfaz; los datos de Supabase nunca.

## 2. Desarrollo local

Requisitos: Node.js 20 o superior.

```bash
npm install
```

```bash
npm run dev
```

Abre http://localhost:5173. Sin `.env.local` entra en modo demostración.

| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas de dominio y del flujo completo (29 pruebas) |
| `npm run build` | Comprobación de tipos y build de producción en `dist/` |
| `./scripts/test-db-local.sh` | Aplica la migración en un PostgreSQL local temporal y prueba las políticas RLS (requiere `brew install postgresql@17`) |
| `npm run check:rls` | Comprueba contra tu proyecto Supabase real que un visitante anónimo no ve ni escribe nada |

## 3. Configurar Supabase (pendiente)

1. Crea un proyecto en https://supabase.com (región cercana, por ejemplo `us-east`). Guarda la contraseña de la base de datos fuera del repositorio.
2. **SQL Editor:** ejecuta completo `supabase/migrations/20261022000000_initial_schema.sql`. Crea las tablas, los roles, las políticas RLS, el bucket privado `player-photos` y la bitácora de cambios.
3. **Authentication › Sign In / Providers:** desactiva *Allow new users to sign up*. Solo el administrador crea cuentas.
4. **Authentication › Users › Add user:** crea la cuenta compartida del personal (correo y contraseña robusta, con *Auto Confirm*).
5. **SQL Editor:** autoriza esa cuenta. Sin esta fila el usuario puede iniciar sesión, pero no ve ningún dato:
   ```sql
   insert into public.profiles (user_id, role, display_name, is_shared_account)
   select id, 'coach', 'Personal (cuenta compartida)', true
   from auth.users where email = 'CORREO-DE-LA-CUENTA';
   ```
   Recomendado: crea además una cuenta personal con `role = 'admin'` para quien administre la academia.
6. **Settings › API:** copia *Project URL* y la clave **anon/publishable**. **Nunca** uses la `service_role` en el navegador ni en el repositorio.
7. Crea `.env.local` a partir de `.env.example` y pon esos dos valores. Ejecuta `npm run dev` y `npm run check:rls`.

### Roles

| Rol | Lee | Asistencia, jugadores y sesiones | Categorías, reglas, excepciones y convocatorias | Perfiles y bitácora |
|---|---|---|---|---|
| admin | ✓ | ✓ | ✓ | ✓ |
| coach (cuenta compartida) | ✓ | ✓ | ✓ | — |
| assistant | ✓ | ✓ | — | — |
| viewer (consulta) | ✓ | — | — | — |
| autenticado sin perfil / anónimo | — | — | — | — |

**Limitación de la cuenta compartida:** todos los cambios quedan registrados en `audit_log` con el mismo usuario, así que no es posible saber qué persona hizo cada modificación. Para conseguirlo, crea un usuario por persona y una fila en `profiles` con su rol. No hay que cambiar el código.

**Portal de familias (futuro):** existen `guardians` y `player_guardians` (con `portal_access` por jugador), con RLS activo y **sin políticas**: hoy nadie puede leerlas desde la app. Para activarlo habrá que añadir un rol `guardian` y políticas que limiten la lectura a los jugadores vinculados.

## 4. Publicación (Cloudflare Pages)

El código está en GitHub (`MEGAWAYXS/nido-aguila-angelopolis`) y **Cloudflare Pages** lo publica automáticamente en **https://nidoangelopolis.pages.dev** con cada push a `main`. Las vistas previas de otras ramas se publican en URL aparte.

Configuración del proyecto `nidoangelopolis` en Cloudflare (Workers & Pages › nidoangelopolis › Settings):

| Ajuste | Valor |
|---|---|
| Repositorio / rama de producción | `MEGAWAYXS/nido-aguila-angelopolis` / `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (clave **pública**), `VITE_BASE_PATH=/`, `NODE_VERSION=22` |

- Si cambian las variables, hay que volver a desplegar (Deployments › *Retry deployment*) porque se incrustan al compilar.
- Para usar un dominio propio (por ejemplo `nido.wayxs.mx`): Custom domains › *Set up a custom domain*. No requiere cambios de código.
- El workflow de GitHub Actions (`.github/workflows/tests.yml`) solo ejecuta pruebas y build en cada push.
- Si alguna vez se vuelve a GitHub Pages, el build necesita `VITE_BASE_PATH=/<repositorio>/`.

### Modo sin conexión (Asistencia)

- Al abrir **Asistencia** con internet se guarda en el teléfono (IndexedDB) una copia de jugadores y categorías y de la semana completa de sesiones y asistencias.
- Sin conexión, Asistencia usa esa copia: se puede pasar lista, guardar y crear sesiones (con id generado en el teléfono, para no duplicarlas al reenviar).
- Todo cambio se guarda primero en una cola del teléfono y se envía en orden cuando hay conexión (al volver internet, al abrir la app, al volver a ella y cada minuto). Un corte a mitad del envío no pierde nada; un error que no sea de conexión se muestra en la barra superior sin borrar nada.
- La app reconoce al usuario sin conexión con la sesión guardada y su último perfil.
- Al cerrar sesión se borra la copia y la cola (con aviso si hay cambios sin enviar).
- El resto de pantallas necesita conexión.

### Soporte por WhatsApp

El botón flotante **Soporte** abre WhatsApp con un mensaje que indica la pantalla y el usuario (nunca datos de jugadores). El número está en `src/config.ts` (`SUPPORT_WHATSAPP`, formato `52` + 10 dígitos); si se deja vacío, el botón no aparece.

## 5. Reglas de faltas implementadas

- Cuenta como falta solo **AUSENTE sin justificación aprobada**. ENFERMO y MOTIVO JUSTIFICADO no cuentan, salvo que la regla lo indique.
- Solo cuentan las sesiones de la categoría del jugador, de la semana (lunes a domingo), **no canceladas y no futuras**.
- Una sesión pasada sin registro queda **pendiente de revisión**; nunca es falta.
- Un registro por jugador y sesión (restricción única + `upsert`). Corregir un registro recalcula al instante.
- Umbrales por defecto: 0 elegible, 1–2 alerta, 3 o más desconvocado. Son configurables globalmente o por categoría.
- **Excepciones** autorizadas con motivo obligatorio; se revocan y no se borran, así que queda el historial.
- **Elegibilidad ≠ convocatoria:** la convocatoria oficial (CONVOCADO / DESCONVOCADO) la confirma el personal. Mientras no se confirme se muestra PENDIENTE DE REVISIÓN.

## 6. Privacidad, respaldo y eliminación

Consulta [docs/operacion.md](docs/operacion.md): datos mínimos, respaldo semanal, recuperación, eliminación de un jugador y sus fotos, y rotación de la contraseña compartida.

## 7. Límites y costes (verificado el 22 oct 2026; revisar antes de comprometerse)

| Servicio | Plan gratuito | Riesgo | Si se supera |
|---|---|---|---|
| Supabase Free | 500 MB de base de datos, 1 GB de archivos, 5 GB de egress, 50 000 MAU, 2 proyectos | **Se pausa tras 1 semana sin actividad** y **no incluye respaldos automáticos** | Pro desde 25 USD/mes: respaldos diarios de 7 días, 8 GB de disco, 100 GB de archivos. PITR desde 100 USD/mes |
| Cloudflare Pages | Sitios estáticos con ancho de banda ilimitado; 500 builds/mes en el plan gratuito | Ninguno relevante para este uso | Plan Pro de Cloudflare si se necesitan más builds |
| Dominio propio | — | Opcional | Unos 15–25 USD/año |

Para una academia, los datos (texto) ocupan pocos MB. Las fotografías son lo que más crece: con 300 jugadores a ~300 KB cada una son ~90 MB. **Recomendación:** mientras se use el plan gratuito, haz el respaldo manual semanal descrito en `docs/operacion.md`. Considera Pro cuando haya datos reales que no se puedan perder.
