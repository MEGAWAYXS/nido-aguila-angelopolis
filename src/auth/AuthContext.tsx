import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Role, StaffUser } from '../domain/types';
import { dataService } from '../services';
import { clearOfflineData, outbox } from '../services/offline';

interface AuthValue {
  user: StaffUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dataService
      .getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    const unsubscribe = dataService.onAuthChange(setUser);
    return () => {
      unsubscribe();
    };
  }, []);

  const value: AuthValue = {
    user,
    loading,
    signIn: async (email, password) => setUser(await dataService.signIn(email, password)),
    signOut: async () => {
      await outbox.refresh().catch(() => {});
      const pending = outbox.state.pending;
      if (pending > 0 && !window.confirm(`Hay ${pending} ${pending === 1 ? 'cambio' : 'cambios'} de asistencia guardado${pending === 1 ? '' : 's'} en este teléfono que aún no se ${pending === 1 ? 'envía' : 'envían'}. Si cierras sesión se perderán. ¿Cerrar sesión de todos modos?`)) return;
      await dataService.signOut();
      // Privacidad: se borra la copia de jugadores y lo pendiente guardado en el teléfono.
      await clearOfflineData().catch(() => {});
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth fuera de AuthProvider');
  return v;
}

/**
 * Solo para mostrar u ocultar controles. La autorización real la imponen las
 * políticas RLS del backend: ocultar un botón no protege nada.
 */
export function can(user: StaffUser | null, action: 'write' | 'manage' | 'admin'): boolean {
  if (!user) return false;
  const allowed: Record<typeof action, Role[]> = {
    write: ['admin', 'coach', 'assistant'],
    manage: ['admin', 'coach'],
    admin: ['admin'],
  };
  return allowed[action].includes(user.role);
}
