import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Icon } from '../components/ui';
import { dataService } from '../services';

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const demo = dataService.mode === 'demo';
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (user) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-hero">
        <img src={`${import.meta.env.BASE_URL}escudo.png`} alt="Escudo Nido Águila Club América" />
        <div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 34, lineHeight: 1 }}>NIDO ÁGUILA</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, letterSpacing: '0.22em', color: 'var(--yellow)' }}>ANGELÓPOLIS</div>
        </div>
      </div>
      <form className="login-card" onSubmit={submit}>
        <div>
          <h1 style={{ fontSize: 28 }}>Acceso del personal</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Solo entrenadores y personal autorizado.</p>
        </div>
        {demo ? (
          <>
            <div className="demo-banner">MODO DEMOSTRACIÓN · No hay backend configurado. Se usan datos ficticios en memoria.</div>
            <button type="submit" className="btn btn-primary" disabled={busy}>Entrar a la demostración</button>
          </>
        ) : (
          <>
            <label className="field">
              <span>Correo</span>
              <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Verificando…' : 'Entrar'}</button>
          </>
        )}
        {error && <ErrorBox message={error} />}
        <p className="row small muted" style={{ margin: 0, alignItems: 'flex-start' }}>
          <Icon name="lock" size={16} />
          <span>Cuenta compartida del personal. La sesión se valida en el servidor; los cambios no se atribuyen a una persona concreta.</span>
        </p>
      </form>
      <p className="small muted" style={{ marginTop: 24 }}>Academia filial · Club América</p>
    </div>
  );
}
