'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const COLORS = ['#d32420', '#f0c900', '#153f91', '#151515', '#960d12', '#60218b', '#edbd00', '#ff7915', '#166647'];
type Ball = { mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial>; velocity: THREE.Vector3; char: string; x: number; y: number };

function textureFor(char: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 256);
  // Opposite inlaid badges follow the surface all the way around the ball.
  for (const x of [128, 384]) {
    ctx.fillStyle = '#fffdf0';
    ctx.beginPath(); ctx.arc(x, 128, 43, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#171717';
    ctx.font = `600 ${char.length > 2 ? 43 : 64}px Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(char, x, 130, 73);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export default function Home() {
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const engine = useRef<{ update: (value: string, position: number) => void } | null>(null);
  const [value, setValue] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); }
    catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.z = 500;
    scene.add(new THREE.AmbientLight(0xffffff, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-200, 300, 450); scene.add(key);
    const fill = new THREE.DirectionalLight(0xd9e6ff, 0.45);
    fill.position.set(180, -100, 200); scene.add(fill);
    const geometry = new THREE.SphereGeometry(1, 48, 32);
    let balls: (Ball | null)[] = [];
    let text = '', selection = 0, width = 0, height = 0, size = 64;
    let frame = 0, previousTime = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const axis = new THREE.Vector3();
    const rotation = new THREE.Quaternion();

    function draw(time = performance.now()) {
      frame = 0;
      const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.04) : 1 / 60;
      previousTime = time;
      let moving = false;
      for (const ball of balls) {
        if (!ball) continue;
        const speed = ball.velocity.length();
        if (speed > 0.008) {
          axis.copy(ball.velocity).normalize();
          rotation.setFromAxisAngle(axis, speed * delta);
          ball.mesh.quaternion.premultiply(rotation);
          ball.velocity.multiplyScalar(Math.exp(-(reduced.matches ? 12 : 2.8) * delta));
          moving = true;
        } else ball.velocity.set(0, 0, 0);
      }
      renderer.render(scene, camera);
      if (moving) frame = requestAnimationFrame(draw);
      else previousTime = 0;
    }
    function invalidate() { if (!frame) frame = requestAnimationFrame(draw); }
    function layout() {
      const chars = Array.from(text);
      const gap = size * 0.075;
      const step = size + gap;
      const available = Math.min(width - 48, 900);
      const rows: { indices: number[]; width: number }[] = [{ indices: [], width: 0 }];
      const positions: { row: number; x: number }[] = [];
      for (let i = 0; i < chars.length; i++) {
        let row = rows[rows.length - 1];
        if (chars[i] !== '\n' && row.width + step > available && row.indices.length) {
          rows.push({ indices: [], width: 0 }); row = rows[rows.length - 1];
        }
        positions[i] = { row: rows.length - 1, x: row.width };
        if (chars[i] === '\n') { rows.push({ indices: [], width: 0 }); continue; }
        row.indices.push(i);
        row.width += chars[i] === ' ' ? step * 0.55 : step;
      }
      positions[chars.length] = { row: rows.length - 1, x: rows[rows.length - 1].width };
      const rowHeight = size * 1.16;
      const totalHeight = rows.length * rowHeight;
      const selectedIndex = Array.from(text.slice(0, selection)).length;
      const caret = positions[Math.min(selectedIndex, chars.length)];
      // Keep the insertion point visible when the text grows beyond the viewport.
      let firstY = height / 2 - totalHeight / 2 + rowHeight / 2;
      if (totalHeight > height - size * 2) firstY = Math.min(size, height - size - caret.row * rowHeight);
      rows.forEach((row, r) => {
        const start = (width - Math.max(0, row.width - gap)) / 2;
        for (const i of row.indices) {
          const ball = balls[i]; if (!ball) continue;
          ball.x = start + positions[i].x + size / 2;
          ball.y = firstY + r * rowHeight;
          ball.mesh.position.set(ball.x - width / 2, height / 2 - ball.y, 0);
          ball.mesh.scale.setScalar(size / 2);
        }
      });
      if (cursor.current) {
        const row = rows[caret.row];
        const x = chars.length ? (width - Math.max(0, row.width - gap)) / 2 + caret.x - gap / 2 : width / 2;
        cursor.current.style.transform = `translate(${x}px, ${firstY + caret.row * rowHeight - size * 0.35}px)`;
        cursor.current.style.height = `${size * 0.7}px`;
      }
      invalidate();
    }
    function update(next: string, position: number) {
      const chars = Array.from(next);
      const old = balls;
      // Preserve unaffected balls, including their rotation, when editing in the middle.
      let prefix = 0, suffix = 0;
      const oldChars = Array.from(text);
      while (prefix < chars.length && prefix < oldChars.length && chars[prefix] === oldChars[prefix]) prefix++;
      while (suffix < chars.length - prefix && suffix < oldChars.length - prefix && chars[chars.length - 1 - suffix] === oldChars[oldChars.length - 1 - suffix]) suffix++;
      balls = chars.map((char, i) => {
        if (i < prefix) return old[i];
        if (i >= chars.length - suffix) return old[old.length - (chars.length - i)];
        if (/\s/.test(char)) return null;
        const material = new THREE.MeshPhongMaterial({ map: textureFor(char, COLORS[i % COLORS.length]), shininess: 85, specular: 0x555555 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.z = Math.sin(i * 7.13) * 0.2;
        scene.add(mesh);
        return { mesh, velocity: new THREE.Vector3(), char, x: 0, y: 0 };
      });
      for (let i = prefix; i < old.length - suffix; i++) {
        const ball = old[i];
        if (ball) { scene.remove(ball.mesh); ball.mesh.material.map?.dispose(); ball.mesh.material.dispose(); }
      }
      text = next; selection = position; layout();
    }
    function resize() {
      width = container.clientWidth; height = container.clientHeight;
      size = width < 600 ? 48 : 64;
      renderer.setSize(width, height);
      camera.left = -width / 2; camera.right = width / 2;
      camera.top = height / 2; camera.bottom = -height / 2;
      camera.updateProjectionMatrix(); layout();
    }
    let lastPointer: { x: number; y: number; time: number } | null = null;
    function pointerMove(event: PointerEvent) {
      if (!event.isPrimary) return;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const now = performance.now();
      if (lastPointer && now - lastPointer.time < 100) {
        const dx = x - lastPointer.x, dy = y - lastPointer.y;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq > 0) for (const ball of balls) {
          if (!ball) continue;
          const t = Math.max(0, Math.min(1, ((ball.x - lastPointer.x) * dx + (ball.y - lastPointer.y) * dy) / lengthSq));
          const distance = Math.hypot(ball.x - lastPointer.x - t * dx, ball.y - lastPointer.y - t * dy);
          if (distance < size / 2) {
            const force = (1 - distance / size) * (reduced.matches ? 0.08 : 0.24);
            ball.velocity.x += dy * force;
            ball.velocity.y += dx * force;
            ball.velocity.clampLength(0, 18);
          }
        }
        invalidate();
      }
      lastPointer = { x, y, time: now };
    }
    const observer = new ResizeObserver(resize); observer.observe(container);
    container.addEventListener('pointermove', pointerMove);
    engine.current = { update };
    resize(); input.current?.focus({ preventScroll: true });
    return () => {
      observer.disconnect(); container.removeEventListener('pointermove', pointerMove);
      cancelAnimationFrame(frame);
      for (const ball of balls) if (ball) { ball.mesh.material.map?.dispose(); ball.mesh.material.dispose(); }
      geometry.dispose(); renderer.dispose(); renderer.domElement.remove(); engine.current = null;
    };
  }, []);

  return (
    <main className="pool-page" onPointerDown={(event) => { if (event.pointerType === 'mouse') event.preventDefault(); input.current?.focus({ preventScroll: true }); }}>
      <div ref={host} className="pool-canvas" aria-hidden="true" />
      <span ref={cursor} className="pool-cursor" aria-hidden="true" />
      <textarea
        ref={input}
        aria-label="Pool ball typewriter. Type to create balls. Move your pointer over each ball to spin it."
        className={failed ? 'fallback-input' : 'pool-input'}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        onChange={(event) => { const next = event.target.value; setValue(next); engine.current?.update(next, event.target.selectionStart); }}
        onSelect={(event) => engine.current?.update(event.currentTarget.value, event.currentTarget.selectionStart)}
      />
    </main>
  );
}
