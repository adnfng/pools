import * as THREE from 'three';
import { BALL_COLORS } from './gallery';
import { textureFor } from './pool-textures';
import { graphemes } from './text';
import { messageLayout } from './message-layout';

let renderer: THREE.WebGLRenderer | null = null;
let disposal: ReturnType<typeof setTimeout> | undefined;

export function renderMessage(canvas: HTMLCanvasElement, message: string, pixelWidth = 900, pixelHeight = 900, author?: string) {
  const context = canvas.getContext('2d')!;
  canvas.width = pixelWidth; canvas.height = pixelHeight;
  const width = 900, height = 900 * pixelHeight / pixelWidth;
  const top = author ? 120 : 0;
  const bottom = author ? 112 : 0;
  const layout = messageLayout(message, width, height - top - bottom);
  const scene = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(1, pixelWidth >= 900 ? 48 : 24, pixelWidth >= 900 ? 32 : 16);
  const materials: THREE.MeshBasicMaterial[] = [];
  try {
    clearTimeout(disposal);
    if (!renderer) renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(1);
    renderer.setSize(pixelWidth, pixelHeight, false);
    renderer.setClearColor('#fff', 1);
    const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .1, 1000);
    camera.position.z = 500;
    let color = 0;
    layout.chars.forEach((char, index) => {
      if (/\s/u.test(char)) return;
      const material = new THREE.MeshBasicMaterial({ map: textureFor(char, BALL_COLORS[color++ % BALL_COLORS.length], layout.size * pixelWidth / width > 128 ? 2 : 1) });
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.setScalar(layout.size / 2);
      mesh.position.set(layout.positions[index].x - width / 2, height / 2 - top - layout.positions[index].y, 0);
      scene.add(mesh);
    });
    renderer.render(scene, camera);
    context.drawImage(renderer.domElement, 0, 0);
  } catch {
    // A usable preview remains available if the device cannot create WebGL.
    context.scale(pixelWidth / width, pixelHeight / height);
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
    let color = 0;
    layout.chars.forEach((char, index) => {
      if (/\s/u.test(char)) return;
      const { x, y: localY } = layout.positions[index];
      const y = top + localY;
      context.fillStyle = BALL_COLORS[color++ % BALL_COLORS.length];
      context.beginPath(); context.arc(x, y, layout.size / 2, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#f5f5f5'; context.beginPath(); context.arc(x, y, layout.size * .24, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#0d0d0d'; context.font = `600 ${layout.size * .35}px "TT Rounds Neue", sans-serif`;
      context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(char, x, y, layout.size * .45);
    });
  } finally {
    materials.forEach((material) => { material.map?.dispose(); material.dispose(); });
    geometry.dispose();
    disposal = setTimeout(() => { renderer?.dispose(); renderer?.forceContextLoss(); renderer = null; }, 1000);
  }
  if (author) {
    context.save();
    context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillStyle = '#E3E3E3';
    context.font = '600 14px "TT Rounds Neue", Arial, sans-serif';
    context.fillText('made by', width / 2, 38);
    context.fillStyle = '#000';
    context.font = '600 22px "TT Rounds Neue", Arial, sans-serif';
    const letters = graphemes(author);
    const advances = letters.map((letter) => context.measureText(letter).width);
    let x = (width - advances.reduce((sum, advance) => sum + advance, 0)) / 2;
    letters.forEach((letter, index) => {
      const seed = (letter.codePointAt(0) ?? 0) * 31 + index * 17;
      context.save(); context.translate(x + advances[index] / 2, 60);
      context.rotate((Math.floor(seed / 7) % 5 - 2) * Math.PI / 180);
      context.fillText(letter, 0, 0); context.restore();
      x += advances[index];
    });
    const brand = 'imsend.ing';
    const size = 45, gap = 5;
    const start = (width - (brand.length * (size + gap) - gap)) / 2;
    Array.from(brand).forEach((letter, index) => {
      context.save(); context.translate(start + index * (size + gap) + size / 2, height - 44);
      context.rotate([-2, 1, -1, 2][index % 4] * Math.PI / 180);
      context.fillStyle = BALL_COLORS[index % BALL_COLORS.length];
      context.beginPath(); context.arc(0, 0, size / 2, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#f5f5f5';
      context.beginPath(); context.arc(0, 0, size * .295, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#000'; context.font = `600 ${size * .36}px "TT Rounds Neue", Arial, sans-serif`;
      context.fillText(letter, 0, 0);
      context.restore();
    });
    context.restore();
  }

}

