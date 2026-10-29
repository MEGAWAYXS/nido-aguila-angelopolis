// Reducción de fotografías antes de subirlas: menos espacio en Supabase y, sobre todo,
// menos transferencia cada vez que se abre la plantilla (límite mensual del plan gratuito).

export const PHOTO_MAX_SIDE = 800;
export const PHOTO_QUALITY = 0.82;

/** Tamaño final conservando la proporción; nunca agranda una foto pequeña. */
export function targetSize(width: number, height: number, maxSide = PHOTO_MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Devuelve la foto como JPEG de máximo 800 px por lado, respetando la orientación de la cámara.
 * Si la reducida pesara más que la original (foto ya pequeña), se conserva la original.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('No se pudo leer la imagen. Usa una foto en formato JPG o PNG.');
  }
  const { width, height } = targetSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen en este dispositivo.');
  // Fondo blanco para PNG con transparencia (JPEG no la admite).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY));
  if (!blob) throw new Error('No se pudo procesar la imagen en este dispositivo.');
  if (blob.size >= file.size && file.type === 'image/jpeg') return file;
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}
