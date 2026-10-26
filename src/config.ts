// Configuración pública del navegador. Solo variables VITE_* y nunca secretos:
// todo lo que está aquí termina dentro del JavaScript publicado.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Salvaguarda: una clave secreta en el navegador daría acceso total saltándose RLS.
function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  try {
    return JSON.parse(atob(key.split('.')[1] ?? ''))?.role === 'service_role';
  } catch {
    return false;
  }
}
if (anonKey && isSecretKey(anonKey.trim())) {
  throw new Error('VITE_SUPABASE_ANON_KEY contiene una clave SECRETA. Usa la clave pública (anon/publishable).');
}

const SUPPORT_WHATSAPP = '524791034891';

export const config = {
  supabaseUrl: url?.trim() || '',
  supabaseAnonKey: anonKey?.trim() || '',
  get backendConfigured(): boolean {
    return Boolean(this.supabaseUrl && this.supabaseAnonKey);
  },
  photoBucket: 'player-photos',
  /**
   * WhatsApp de soporte en formato internacional sin "+" ni espacios (México: 52 + 10 dígitos).
   * Es público: aparece en el enlace del botón. Vacío = el botón no se muestra.
   */
  supportWhatsApp: SUPPORT_WHATSAPP,
};
