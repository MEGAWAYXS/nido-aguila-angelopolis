// Configuración pública del navegador. Solo variables VITE_* y nunca secretos:
// todo lo que está aquí termina dentro del JavaScript publicado.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const config = {
  supabaseUrl: url?.trim() || '',
  supabaseAnonKey: anonKey?.trim() || '',
  get backendConfigured(): boolean {
    return Boolean(this.supabaseUrl && this.supabaseAnonKey);
  },
  photoBucket: 'player-photos',
};
