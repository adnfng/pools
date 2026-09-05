'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const POOL_BALL_COLORS = ['#6797FF', '#FFA01A', '#52ED6A', '#333333', '#FE5CF9', '#4AF4F4', '#A073FF', '#FFE658', '#FF3636'];
const RESET_BALL_COLORS = [POOL_BALL_COLORS[0], POOL_BALL_COLORS[5], POOL_BALL_COLORS[2], POOL_BALL_COLORS[8], POOL_BALL_COLORS[4]];
const CUE_BALL_COLOR = '#F0E9C6';
const BALL_LABEL_COLOR = '#F5F5F5';

type Ball = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  angularVelocity: THREE.Vector3;
  linearVelocity: THREE.Vector2;
  colorIndex: number;
  char: string;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  placed: boolean;
};

type Engine = {
  update: (value: string, position: number) => void;
  reset: () => void;
};

function textureFor(char: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 256);
  for (const x of [128, 384]) {
    ctx.fillStyle = BALL_LABEL_COLOR;
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

function cueTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = CUE_BALL_COLOR;
  ctx.fillRect(0, 0, 512, 256);
  for (const x of [112, 368]) {
    ctx.fillStyle = '#0D0D0D';
    ctx.beginPath();
    ctx.arc(x, 160, 16, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

async function fetchLetters() {
  const response = await fetch('/api/metrics');
  if (!response.ok) return 0;
  const data = (await response.json()) as { letters?: unknown };
  return Math.max(0, Math.floor(Number(data.letters) || 0));
}

async function logLetters(letters: number) {
  const response = await fetch('/api/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ letters }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { letters?: unknown };
  return Math.max(0, Math.floor(Number(data.letters) || 0));
}

export default function Home() {
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const aimLine = useRef<HTMLSpanElement>(null);
  const engine = useRef<Engine | null>(null);
  const cueHit = useRef({ x: 0, y: 0, r: 32 });
  const logHitRef = useRef<(letters: number) => void>(() => {});
  const [value, setValue] = useState('');
  const [failed, setFailed] = useState(false);
  const [letters, setLetters] = useState(0);

  logHitRef.current = (pending) => {
    if (pending <= 0) return;
    setLetters((current) => current + pending);
    logLetters(pending)
      .then((total) => {
        if (total !== null) setLetters(total);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    fetchLetters()
      .then(setLetters)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.z = 500;
    const geometry = new THREE.SphereGeometry(1, 48, 32);
    let balls: (Ball | null)[] = [];
    let text = '';
    let selection = 0;
    let width = 0;
    let height = 0;
    let size = 64;
    let frame = 0;
    let previousTime = 0;
    let colorBag: number[] = [];
    let colorBagShuffled = false;
    let pendingLetters = 0;
    const cueHome = {
      x: 0.14 + Math.random() * 0.72,
      y: 0.16 + Math.random() * 0.5,
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const axis = new THREE.Vector3();
    const rotation = new THREE.Quaternion();

    const cueMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: cueTexture() }));
    const cueBall: Ball = {
      mesh: cueMesh,
      angularVelocity: new THREE.Vector3(),
      linearVelocity: new THREE.Vector2(),
      colorIndex: -1,
      char: '',
      x: 0,
      y: 0,
      homeX: 0,
      homeY: 0,
      placed: false,
    };
    scene.add(cueMesh);

    const activeBalls = () => [cueBall, ...balls.filter((ball): ball is Ball => ball !== null)];

    function nextColorIndex(previousColorIndex: number) {
      if (!colorBag.length) {
        colorBag = POOL_BALL_COLORS.map((_, index) => index);
        if (colorBagShuffled) {
          for (let i = colorBag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [colorBag[i], colorBag[j]] = [colorBag[j], colorBag[i]];
          }
        }
        colorBagShuffled = true;
      }
      if (colorBag[0] === previousColorIndex && colorBag.length > 1) {
        [colorBag[0], colorBag[1]] = [colorBag[1], colorBag[0]];
      }
      return colorBag.shift()!;
    }

    function positionMesh(ball: Ball) {
      ball.mesh.position.set(ball.x - width / 2, height / 2 - ball.y, 0);
      ball.mesh.scale.setScalar(size / 2);
      if (ball === cueBall) cueHit.current = { x: ball.x, y: ball.y, r: size / 2 };
    }

    function cueSpawn() {
      const pad = size * 1.15;
      return {
        x: THREE.MathUtils.clamp(width * cueHome.x, pad, width - pad),
        y: THREE.MathUtils.clamp(height * cueHome.y, pad, height - 110),
      };
    }

    function overCue(x: number, y: number, extra = 0) {
      return Math.hypot(x - cueBall.x, y - cueBall.y) <= size / 2 + extra;
    }

    function draw(time = performance.now()) {
      frame = 0;
      const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.04) : 1 / 60;
      previousTime = time;
      let moving = false;
      const live = activeBalls();
      const radius = size / 2;
      const bottom = height - 70;

      for (const ball of live) {
        const angularSpeed = ball.angularVelocity.length();
        if (angularSpeed > 0.008) {
          axis.copy(ball.angularVelocity).normalize();
          rotation.setFromAxisAngle(axis, angularSpeed * delta);
          ball.mesh.quaternion.premultiply(rotation);
          ball.angularVelocity.multiplyScalar(Math.exp(-(reduced.matches ? 12 : 2.8) * delta));
          moving = true;
        } else {
          ball.angularVelocity.set(0, 0, 0);
        }

        const linearSpeed = ball.linearVelocity.length();
        if (linearSpeed > 0.5) {
          ball.x += ball.linearVelocity.x * delta;
          ball.y += ball.linearVelocity.y * delta;
          ball.linearVelocity.multiplyScalar(Math.exp(-(reduced.matches ? 10 : 0.95) * delta));
          if (ball.x < radius || ball.x > width - radius) {
            ball.x = THREE.MathUtils.clamp(ball.x, radius, width - radius);
            ball.linearVelocity.x *= -0.72;
          }
          if (ball.y < radius || ball.y > bottom - radius) {
            ball.y = THREE.MathUtils.clamp(ball.y, radius, bottom - radius);
            ball.linearVelocity.y *= -0.72;
          }
          moving = true;
        } else {
          ball.linearVelocity.set(0, 0);
        }
      }

      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i];
          const b = live[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy);
          if (distance <= 0 || distance >= size) continue;
          const nx = dx / distance;
          const ny = dy / distance;
          const overlap = (size - distance) / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          const closingSpeed = (b.linearVelocity.x - a.linearVelocity.x) * nx + (b.linearVelocity.y - a.linearVelocity.y) * ny;
          if (closingSpeed < 0) {
            const cueHit = a === cueBall || b === cueBall;
            const impulse = -closingSpeed * (cueHit ? 1.22 : 1.08);
            a.linearVelocity.x -= impulse * nx;
            a.linearVelocity.y -= impulse * ny;
            b.linearVelocity.x += impulse * nx;
            b.linearVelocity.y += impulse * ny;
            a.angularVelocity.z -= impulse * 0.018;
            b.angularVelocity.z += impulse * 0.018;
          }
          moving = true;
        }
      }

      for (const ball of live) positionMesh(ball);
      renderer.render(scene, camera);
      if (moving) frame = requestAnimationFrame(draw);
      else previousTime = 0;
    }

    function invalidate() {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    function moveHome(ball: Ball, nextX: number, nextY: number) {
      if (ball.placed) {
        ball.x += nextX - ball.homeX;
        ball.y += nextY - ball.homeY;
      } else {
        ball.x = nextX;
        ball.y = nextY;
        ball.placed = true;
      }
      ball.homeX = nextX;
      ball.homeY = nextY;
      positionMesh(ball);
    }

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
          rows.push({ indices: [], width: 0 });
          row = rows[rows.length - 1];
        }
        positions[i] = { row: rows.length - 1, x: row.width };
        if (chars[i] === '\n') {
          rows.push({ indices: [], width: 0 });
          continue;
        }
        row.indices.push(i);
        row.width += chars[i] === ' ' ? step * 0.55 : step;
      }
      positions[chars.length] = { row: rows.length - 1, x: rows[rows.length - 1].width };
      const rowHeight = size * 1.16;
      const totalHeight = rows.length * rowHeight;
      const selectedIndex = Array.from(text.slice(0, selection)).length;
      const caret = positions[Math.min(selectedIndex, chars.length)];
      let firstY = height / 2 - totalHeight / 2 + rowHeight / 2;
      if (totalHeight > height - size * 2) firstY = Math.min(size, height - size - caret.row * rowHeight);
      rows.forEach((row, rowIndex) => {
        const start = (width - Math.max(0, row.width - gap)) / 2;
        for (const i of row.indices) {
          const ball = balls[i];
          if (!ball) continue;
          moveHome(ball, start + positions[i].x + size / 2, firstY + rowIndex * rowHeight);
        }
      });
      const spawn = cueSpawn();
      moveHome(cueBall, spawn.x, spawn.y);
      if (cursor.current) {
        const row = rows[caret.row];
        const x = chars.length ? (width - Math.max(0, row.width - gap)) / 2 + caret.x - gap / 2 : width / 2;
        cursor.current.style.transform = `translate(${x}px, ${firstY + caret.row * rowHeight - size * 0.35}px)`;
        cursor.current.style.height = `${size * 0.7}px`;
      }
      invalidate();
    }

    function update(next: string, position: number) {
      cursor.current?.classList.remove('is-hidden');
      const chars = Array.from(next);
      const old = balls;
      let prefix = 0;
      let suffix = 0;
      const oldChars = Array.from(text);
      while (prefix < chars.length && prefix < oldChars.length && chars[prefix] === oldChars[prefix]) prefix++;
      while (suffix < chars.length - prefix && suffix < oldChars.length - prefix && chars[chars.length - 1 - suffix] === oldChars[oldChars.length - 1 - suffix]) suffix++;
      let previousColorIndex = -1;
      balls = chars.map((char, i) => {
        let reused: Ball | null = null;
        if (i < prefix) reused = old[i];
        else if (i >= chars.length - suffix) reused = old[old.length - (chars.length - i)];
        if (reused) {
          previousColorIndex = reused.colorIndex;
          return reused;
        }
        if (/\s/.test(char)) return null;
        const colorIndex = nextColorIndex(previousColorIndex);
        previousColorIndex = colorIndex;
        pendingLetters += 1;
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: textureFor(char, POOL_BALL_COLORS[colorIndex]) }));
        const angularVelocity = new THREE.Vector3();
        if (!reduced.matches) {
          mesh.rotation.set(
            (Math.random() - 0.5) * 0.22,
            (Math.random() - 0.5) * 0.22,
            (Math.random() - 0.5) * 0.58,
          );
          angularVelocity.set(
            (Math.random() - 0.5) * 1.1,
            (Math.random() - 0.5) * 1.1,
            (Math.random() < 0.5 ? -1 : 1) * (1.4 + Math.random() * 1.4),
          );
        }
        scene.add(mesh);
        return {
          mesh,
          angularVelocity,
          linearVelocity: new THREE.Vector2(),
          colorIndex,
          char,
          x: 0,
          y: 0,
          homeX: 0,
          homeY: 0,
          placed: false,
        };
      });
      for (let i = prefix; i < old.length - suffix; i++) {
        const ball = old[i];
        if (ball) {
          scene.remove(ball.mesh);
          ball.mesh.material.map?.dispose();
          ball.mesh.material.dispose();
        }
      }
      text = next;
      selection = position;
      layout();
    }

    function reset() {
      pendingLetters = 0;
      update('', 0);
      colorBag = [];
      colorBagShuffled = false;
      cueBall.x = cueBall.homeX;
      cueBall.y = cueBall.homeY;
      cueBall.linearVelocity.set(0, 0);
      cueBall.angularVelocity.set(0, 0, 0);
      cueBall.mesh.quaternion.identity();
      invalidate();
    }

    function resize() {
      if (document.activeElement === input.current) return;
      width = container.clientWidth;
      height = container.clientHeight;
      size = width < 600 ? 48 : 64;
      renderer.setSize(width, height);
      camera.left = -width / 2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
      camera.updateProjectionMatrix();
      layout();
    }

    let lastPointer: { x: number; y: number; time: number } | null = null;
    let aiming: { pointerId: number; x: number; y: number } | null = null;

    function aimAt(x: number, y: number) {
      if (!aimLine.current) return;
      const dx = x - cueBall.x;
      const dy = y - cueBall.y;
      const limit = width < 600 ? 150 : 220;
      const distance = Math.min(Math.hypot(dx, dy), limit);
      const angle = Math.atan2(dy, dx);
      aimLine.current.style.width = `${distance}px`;
      aimLine.current.style.transform = `translate(${cueBall.x}px, ${cueBall.y}px) translateY(-50%) rotate(${angle}rad)`;
      aimLine.current.classList.add('is-visible');
    }

    function pointerDown(event: PointerEvent) {
      if (!event.isPrimary) return;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const pad = event.pointerType === 'mouse' ? 6 : 22;
      if (!overCue(x, y, pad)) return;
      event.preventDefault();
      aiming = { pointerId: event.pointerId, x, y };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      aimAt(x, y);
    }

    function pointerMove(event: PointerEvent) {
      if (!event.isPrimary) return;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (aiming?.pointerId === event.pointerId) {
        event.preventDefault();
        aiming.x = x;
        aiming.y = y;
        aimAt(x, y);
        return;
      }
      const now = performance.now();
      if (lastPointer && now - lastPointer.time < 100) {
        const dx = x - lastPointer.x;
        const dy = y - lastPointer.y;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq > 0) {
          for (const ball of activeBalls()) {
            const t = Math.max(0, Math.min(1, ((ball.x - lastPointer.x) * dx + (ball.y - lastPointer.y) * dy) / lengthSq));
            const distance = Math.hypot(ball.x - lastPointer.x - t * dx, ball.y - lastPointer.y - t * dy);
            if (distance < size / 2) {
              const force = (1 - distance / size) * (reduced.matches ? 0.08 : 0.24);
              ball.angularVelocity.x += dy * force;
              ball.angularVelocity.y += dx * force;
              ball.angularVelocity.clampLength(0, 18);
            }
          }
          invalidate();
        }
      }
      lastPointer = { x, y, time: now };
    }

    function pointerUp(event: PointerEvent) {
      if (!aiming || aiming.pointerId !== event.pointerId) return;
      const dx = aiming.x - cueBall.x;
      const dy = aiming.y - cueBall.y;
      const limit = width < 600 ? 150 : 220;
      const distance = Math.min(Math.hypot(dx, dy), limit);
      if (distance > 8) {
        const nx = dx / Math.hypot(dx, dy);
        const ny = dy / Math.hypot(dx, dy);
        const power = 520 + (distance / limit) * 1280;
        cueBall.linearVelocity.x -= nx * power;
        cueBall.linearVelocity.y -= ny * power;
        cueBall.angularVelocity.x -= ny * power * 0.018;
        cueBall.angularVelocity.y += nx * power * 0.018;
        cursor.current?.classList.add('is-hidden');
        const logged = pendingLetters;
        pendingLetters = 0;
        logHitRef.current(logged);
        invalidate();
      }
      aiming = null;
      aimLine.current?.classList.remove('is-visible');
      const surface = event.currentTarget as HTMLElement;
      if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
    }

    function focusInput() {
      input.current?.focus({ preventScroll: true });
    }

    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Tab') return;
      focusInput();
    }

    const surface: HTMLElement = input.current ?? container;
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    surface.addEventListener('pointerdown', pointerDown, { passive: false });
    surface.addEventListener('pointermove', pointerMove, { passive: false });
    surface.addEventListener('pointerup', pointerUp);
    surface.addEventListener('pointercancel', pointerUp);
    window.addEventListener('keydown', onWindowKeyDown, true);
    engine.current = { update, reset };
    resize();
    if (window.matchMedia('(pointer: fine)').matches) focusInput();
    return () => {
      observer.disconnect();
      window.removeEventListener('keydown', onWindowKeyDown, true);
      surface.removeEventListener('pointerdown', pointerDown);
      surface.removeEventListener('pointermove', pointerMove);
      surface.removeEventListener('pointerup', pointerUp);
      surface.removeEventListener('pointercancel', pointerUp);
      cancelAnimationFrame(frame);
      for (const ball of balls) {
        if (!ball) continue;
        ball.mesh.material.map?.dispose();
        ball.mesh.material.dispose();
      }
      cueMesh.material.map?.dispose();
      cueMesh.material.dispose();
      geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
    };
  }, []);

  function resetAll() {
    setValue('');
    engine.current?.reset();
    input.current?.focus({ preventScroll: true });
  }

  return (
    <main className="pool-page">
      <div ref={host} className="pool-canvas" aria-hidden="true" />
      <span ref={cursor} className="pool-cursor" aria-hidden="true" />
      <span ref={aimLine} className="aim-line" aria-hidden="true" />
      <textarea
        ref={input}
        aria-label="pools"
        className={failed ? 'fallback-input' : 'pool-input'}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        inputMode="text"
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          engine.current?.update(next, event.target.selectionStart);
        }}
        onSelect={(event) => engine.current?.update(event.currentTarget.value, event.currentTarget.selectionStart)}
      />
      <div className="pool-dock">
        <p className="pool-metrics">{letters} letters typed</p>
        <button
          className="pool-reset"
          type="button"
          aria-label="Reset all balls"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={resetAll}
        >
          {Array.from('RESET').map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              aria-hidden="true"
              style={{ backgroundColor: RESET_BALL_COLORS[index] }}
            >
              {letter}
            </span>
          ))}
        </button>
      </div>
    </main>
  );
}
