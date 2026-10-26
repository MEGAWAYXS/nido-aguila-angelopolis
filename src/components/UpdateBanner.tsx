import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

// Aviso de versión nueva. El service worker nuevo se activa en segundo plano
// (skipWaiting + clientsClaim) y aquí solo se avisa: la página no se recarga
// sola para no perder, por ejemplo, una lista de asistencia sin guardar.

let started = false;
let notify: () => void = () => {};
let pending = false;

function start() {
  if (started || !('serviceWorker' in navigator)) return;
  started = true;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // En la primera instalación no hay versión anterior: no hace falta avisar.
    if (!hadController) return;
    pending = true;
    notify();
  });
  registerSW({
    // Sin esto espera al evento "load", que ya ocurrió cuando React monta este componente.
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => {});
      // Revisa al volver a la app (p. ej. al abrirla desde la pantalla de inicio) y cada 30 min.
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    },
  });
}

export function UpdateBanner() {
  const [show, setShow] = useState(pending);
  useEffect(() => {
    notify = () => setShow(true);
    start();
  }, []);
  if (!show) return null;
  return (
    <div className="update-banner no-print" role="status">
      <span>Hay una versión nueva de la app.</span>
      <button type="button" className="btn btn-sm btn-accent" onClick={() => window.location.reload()}>Actualizar</button>
    </div>
  );
}
