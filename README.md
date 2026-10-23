# Nido Águila Angelópolis

Aplicación web de gestión para la academia de fútbol filial del Club América: categorías, jugadores, fotografías, asistencia diaria, faltas semanales, calendario y convocatorias. La usan entrenadores y personal desde celulares y computadoras. Los padres no tienen acceso en esta versión; el esquema ya contempla un futuro portal de familias.

> **Estado actual:** la interfaz y el modo demostración funcionan, y las pruebas pasan. El backend Supabase **todavía no está creado ni conectado**, y el sitio **todavía no está publicado**. Sigue los pasos de las secciones 3 y 4.

## 1. Arquitectura

```
Navegador (React + TypeScript + Vite, PWA)
 ├─ src/pages        Pantallas (módulos 1–7)
 ├─ src/domain       Reglas puras: faltas, elegibilidad, semanas, edades, reporte (con pruebas)
 ├─ src/services     DataService (contrato)  ← la UI solo habla con esto
 │    ├─ supabase/   Implementación real: PostgreSQL + Auth + Storage privado
 │    └─ demo/       Datos ficticios en memoria (sin backend)
 └─ public/          Escudo e iconos PWA
GitHub Pages  →  solo archivos estáticos (sin datos)
Supabase      →  datos, autenticación y fotografías, protegidos con RLS
```

- **Modo de datos:** si existen `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, la app usa Supabase. Si no, arranca en **MODO DEMOSTRACIÓN**, claramente señalado, con datos ficticios **en memoria**: los cambios se pierden al recargar y no se sincronizan entre dispositivos (no se simula sincronización con localStorage).
- **Rutas:** `HashRouter` (`/#/plantilla`) para que recargar o compartir enlaces funcione en GitHub Pages sin reescrituras.
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

## 4. Publicar en GitHub Pages (pendiente)

1. Crea un repositorio en GitHub, por ejemplo `nido-aguila-angelopolis`. Con GitHub Free, Pages requiere un repositorio **público**. Esto es seguro porque el repositorio no contiene datos ni secretos, pero revisa que nunca se suban respaldos ni CSV (ya están en `.gitignore`).
2. Sube el código:
   ```bash
   git remote add origin https://github.com/USUARIO/nido-aguila-angelopolis.git
   ```
   ```bash
   git push -u origin main
   ```
3. **Settings › Pages › Source:** elige *GitHub Actions*.
4. **Settings › Secrets and variables › Actions › Variables:** crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Son valores públicos. Si no los creas, se publica el modo demostración.
5. Cada push a `main` ejecuta las pruebas, compila con la ruta base `/<repositorio>/` y publica en `https://USUARIO.github.io/nido-aguila-angelopolis/`.
6. En Supabase › Authentication › URL Configuration, añade esa URL como *Site URL*.

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
| GitHub Pages | Sitio de hasta 1 GB, 100 GB/mes de ancho de banda (límite blando) | Repositorio público en el plan Free | GitHub Pro (4 USD/mes) para Pages desde repositorio privado |
| Dominio propio | — | Opcional | Unos 15–25 USD/año |

Para una academia, los datos (texto) ocupan pocos MB. Las fotografías son lo que más crece: con 300 jugadores a ~300 KB cada una son ~90 MB. **Recomendación:** mientras se use el plan gratuito, haz el respaldo manual semanal descrito en `docs/operacion.md`. Considera Pro cuando haya datos reales que no se puedan perder.
