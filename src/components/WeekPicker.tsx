import { addDays, formatWeek, todayISO, weekStartOf } from '../domain/dates';
import type { ISODate } from '../domain/types';
import { Icon } from './ui';

export function WeekPicker({ value, onChange }: { value: ISODate; onChange: (w: ISODate) => void }) {
  const current = weekStartOf(todayISO());
  return (
    <div className="field">
      <span>Semana (lunes a domingo)</span>
      <div className="row">
        <button type="button" className="btn icon-btn" aria-label="Semana anterior" onClick={() => onChange(addDays(value, -7))}><Icon name="left" /></button>
        <input
          className="input"
          type="date"
          aria-label="Elegir fecha de la semana"
          value={value}
          onChange={(e) => e.target.value && onChange(weekStartOf(e.target.value))}
          style={{ width: 160 }}
        />
        <button type="button" className="btn icon-btn" aria-label="Semana siguiente" onClick={() => onChange(addDays(value, 7))}><Icon name="right" /></button>
        {value !== current && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(current)}>Hoy</button>}
      </div>
      <span className="small muted" aria-live="polite">{formatWeek(value)}</span>
    </div>
  );
}
