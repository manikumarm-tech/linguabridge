import React from 'react';

/** Web: the browser's own player. `src` already carries the access token. */
export function AudioPlayer({ src }: { src: string }) {
  return <audio controls preload="metadata" src={src} style={{ width: 240, maxWidth: '100%', height: 36, marginBottom: 6 }} />;
}
