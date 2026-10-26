import { useEffect, useState } from 'react';
import { outbox, startOfflineSync, type OutboxState } from '../services/offline';
import { toast } from './ui';

/** Estado de conexión y de lo pendiente de enviar. No muestra nada si todo está al día. */
export function OfflineBar() {
  const [state, setState] = useState<OutboxState>(outbox.state);
  useEffect(() => {
    startOfflineSync();
    const offState = outbox.subscribe(setState);
    const offSent = outbox.onSent((n) => toast(`Se envió lo guardado sin conexión (${n} ${n === 1 ? 'cambio' : 'cambios'}).`));
    return () => {
      offState();
      offSent();
    };
  }, []);

  const { online, pending, syncing, error } = state;
  if (online && pending === 0) return null;
  const lists = `${pending} ${pending === 1 ? 'cambio' : 'cambios'}`;
  let text: string;
  let tone = 'offline-note';
  if (!online) text = pending ? `Sin conexión · ${lists} guardado${pending === 1 ? '' : 's'} en este teléfono. Se enviará${pending === 1 ? '' : 'n'} al volver internet.` : 'Sin conexión · Puedes pasar asistencia; se guardará en este teléfono.';
  else if (syncing) text = `Enviando ${lists} guardado${pending === 1 ? '' : 's'} sin conexión…`;
  else if (error) {
    text = `No se pudo enviar ${lists} guardado${pending === 1 ? '' : 's'} en este teléfono: ${error}`;
    tone = 'offline-note error';
  } else text = `${lists} pendiente${pending === 1 ? '' : 's'} de enviar.`;

  return (
    <div className={`${tone} no-print`} role="status">
      <span style={{ flex: 1 }}>{text}</span>
      {online && !syncing && pending > 0 && (
        <button type="button" className="btn btn-sm" onClick={() => void outbox.flush()}>Reintentar</button>
      )}
    </div>
  );
}
