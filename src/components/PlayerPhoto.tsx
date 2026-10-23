import { useEffect, useState } from 'react';
import { dataService } from '../services';
import { Icon } from './ui';

/** Muestra la foto privada mediante una URL firmada temporal. */
export function PlayerPhoto({ path, name, iconSize = 52 }: { path?: string; name: string; iconSize?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (path) dataService.getPhotoUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  if (url) return <img src={url} alt={`Fotografía de ${name}`} />;
  return (
    <span style={{ color: '#8a93ad' }} role="img" aria-label="Sin fotografía">
      <Icon name="user" size={iconSize} />
    </span>
  );
}
