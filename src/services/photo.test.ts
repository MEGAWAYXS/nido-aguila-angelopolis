import { describe, expect, it } from 'vitest';
import { targetSize } from './photo';

describe('tamaño de la foto reducida', () => {
  it('reduce fotos de celular a 800 px en el lado mayor conservando la proporción', () => {
    expect(targetSize(4032, 3024)).toEqual({ width: 800, height: 600 }); // horizontal
    expect(targetSize(3024, 4032)).toEqual({ width: 600, height: 800 }); // vertical
    expect(targetSize(4000, 4000)).toEqual({ width: 800, height: 800 });
  });

  it('no agranda fotos pequeñas', () => {
    expect(targetSize(640, 480)).toEqual({ width: 640, height: 480 });
  });
});
