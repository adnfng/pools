import * as THREE from 'three';

export function textureFor(char: string, color: string, resolution = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 512 * resolution;
  canvas.height = 256 * resolution;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(resolution, resolution);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 256);
  for (const x of [128, 384]) {
    ctx.fillStyle = '#F5F5F5';
    ctx.beginPath();
    ctx.arc(x, 128, 43, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0D0D0D';
    ctx.font = `600 ${char.length > 2 ? 43 : 64}px "TT Rounds Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, x, 130, 73);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

