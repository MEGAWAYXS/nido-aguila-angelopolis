import { describe, expect, it } from 'vitest';
import { supportMessage } from './SupportButton';

describe('mensaje de soporte por WhatsApp', () => {
  it('incluye la pantalla y el usuario, sin datos de jugadores', () => {
    const m = supportMessage('/asistencia', 'Personal (cuenta compartida)');
    expect(m).toContain('Pantalla: Asistencia');
    expect(m).toContain('Usuario: Personal (cuenta compartida)');
  });

  it('la ficha de un jugador no revela su identificador', () => {
    const m = supportMessage('/plantilla/0b6c1f8e-1234', 'Personal');
    expect(m).toContain('Pantalla: Ficha de jugador');
    expect(m).not.toContain('0b6c1f8e');
  });

  it('sin sesión (pantalla de acceso) omite el usuario', () => {
    const m = supportMessage('/acceso');
    expect(m).toContain('Pantalla: Acceso');
    expect(m).not.toContain('Usuario:');
  });
});
