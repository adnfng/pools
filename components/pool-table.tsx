'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import Link from 'next/link';
import { textureFor } from '@/lib/pool-textures';
import { BallLetters } from '@/components/ball-letters';
import { SaveDialog } from '@/components/save-dialog';
import { useGallery } from '@/components/gallery-provider';
import { MAX_MESSAGE_LENGTH, type GalleryEntry } from '@/lib/gallery';
import { graphemes, graphemeIndex, deletionRange } from '@/lib/text';
import { ColoredName } from '@/components/colored-name';
import { messageLayout } from '@/lib/message-layout';
import { loadSounds, playCollision, playKeyPress, playKeyRelease, unlockAudio } from '@/lib/sounds';

const POOL_BALL_COLORS = ['#6797FF', '#FFA01A', '#52ED6A', '#333333', '#FE5CF9', '#4AF4F4', '#A073FF', '#FFE658', '#FF3636'];
const CUE_BALL_COLOR = '#F0E9C6';

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

export function PoolTable({ entry }: { entry?: GalleryEntry }) {
  const readOnly = !!entry;
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const aimLine = useRef<HTMLSpanElement>(null);
  const engine = useRef<Engine | null>(null);
  const cueHit = useRef({ x: 0, y: 0, r: 32 });
  const logHitRef = useRef<(letters: number) => void>(() => {});
  const [value, setValue] = useState(entry?.message ?? '');
  const currentValue = useRef(value);
  const committedValue = useRef(value);
  currentValue.current = value;
  const composing = useRef(false);
  const playSurface = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [letters, setLetters] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const saveButton = useRef<HTMLButtonElement>(null);
  const modalOpen = useRef(false);
  const { pending } = useGallery();
  modalOpen.current = draft !== null;

  logHitRef.current = (pending) => {
    if (readOnly || pending <= 0) return;
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
    let disposed = false;
    let contextLost = false;
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
    let savedColor = 0;
    let pendingLetters = 0;
    let replaySpawnPending = readOnly;
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
      if (readOnly) return savedColor++ % POOL_BALL_COLORS.length;
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
        y: THREE.MathUtils.clamp(height * cueHome.y, pad, height - pad),
      };
    }

    function overCue(x: number, y: number, extra = 0) {
      return Math.hypot(x - cueBall.x, y - cueBall.y) <= size / 2 + extra;
    }

    function draw(time = performance.now()) {
      frame = 0;
      if (disposed || contextLost || width <= 0 || height <= 0) return;
      const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.04) : 1 / 60;
      previousTime = time;
      let moving = false;
      const live = activeBalls();
      const radius = size / 2;
      const bottom = height;

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
          axis.set(ball.linearVelocity.y, ball.linearVelocity.x, 0);
          if (axis.lengthSq() > 0) {
            rotation.setFromAxisAngle(axis.normalize(), (linearSpeed / radius) * delta);
            ball.mesh.quaternion.premultiply(rotation);
          }
          ball.linearVelocity.multiplyScalar(Math.exp(-(reduced.matches ? 10 : 0.95) * delta));
          if (ball.x < radius || ball.x > width - radius) {
            ball.x = THREE.MathUtils.clamp(ball.x, radius, width - radius);
            playCollision(Math.abs(ball.linearVelocity.x));
            ball.linearVelocity.x *= -0.72;
          }
          if (ball.y < radius || ball.y > bottom - radius) {
            ball.y = THREE.MathUtils.clamp(ball.y, radius, bottom - radius);
            playCollision(Math.abs(ball.linearVelocity.y));
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
            a.angularVelocity.x -= impulse * ny * 0.04;
            a.angularVelocity.y -= impulse * nx * 0.04;
            b.angularVelocity.x += impulse * ny * 0.04;
            b.angularVelocity.y += impulse * nx * 0.04;
            playCollision(Math.abs(impulse));
          }
          moving = true;
        }
      }

      for (const ball of live) {
        ball.x = THREE.MathUtils.clamp(ball.x, radius, Math.max(radius, width - radius));
        ball.y = THREE.MathUtils.clamp(ball.y, radius, Math.max(radius, height - radius));
        positionMesh(ball);
      }
      if (lastPointer && !aiming) surface.style.cursor = overCue(lastPointer.x, lastPointer.y, 6) ? 'grab' : readOnly ? 'default' : 'text';
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
      if (width <= 0 || height <= 0) return;
      const arranged = messageLayout(text, width, height, width < 600 ? 48 : 64);
      size = arranged.size;
      const selectedIndex = graphemeIndex(text, selection);
      let caret = arranged.caret(selectedIndex);
      let shiftY = 0;
      if (arranged.totalHeight > height - size * 2) {
        shiftY = Math.min(Math.max(caret.y, size), height - size) - caret.y;
        caret = { x: caret.x, y: caret.y + shiftY };
      }
      arranged.chars.forEach((_, index) => {
        const ball = balls[index];
        const position = arranged.positions[index];
        if (!ball || !position) return;
        moveHome(ball, position.x, position.y + shiftY);
      });
      if (replaySpawnPending && text === entry?.message) {
        const pad = Math.min(Math.min(width, height) / 3, Math.max(size * 1.15, 64));
        let best = { x: width / 2, y: pad, clearance: -1 };
        for (let attempt = 0; attempt < 80; attempt++) {
          const x = pad + Math.random() * Math.max(0, width - pad * 2);
          const y = pad + Math.random() * Math.max(0, height - pad * 2);
          const clearance = Math.min(...balls.filter((ball): ball is Ball => !!ball).map((ball) => Math.hypot(x - ball.homeX, y - ball.homeY)));
          if (clearance > best.clearance) best = { x, y, clearance };
          if (clearance >= size * 1.4) break;
        }
        cueHome.x = best.x / width;
        cueHome.y = best.y / height;
        cueBall.placed = false;
        replaySpawnPending = false;
      }
      const spawn = cueSpawn();
      moveHome(cueBall, spawn.x, spawn.y);
      if (cursor.current) {
        cursor.current.style.transform = `translate(${caret.x}px, ${caret.y - size * 0.35}px)`;
        cursor.current.style.height = `${size * 0.7}px`;
      }
      invalidate();
    }

    function update(next: string, position: number) {
      if (!readOnly) cursor.current?.classList.remove('is-hidden');
      const chars = graphemes(next);
      const old = balls;
      let prefix = 0;
      let suffix = 0;
      const oldChars = graphemes(text);
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
        if (!readOnly) pendingLetters += 1;
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: textureFor(char, POOL_BALL_COLORS[colorIndex]) }));
        const angularVelocity = new THREE.Vector3();
        if (!reduced.matches && !readOnly) {
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
      replaySpawnPending = readOnly;
      pendingLetters = 0;
      for (const ball of balls) {
        if (!ball) continue;
        ball.placed = false;
        ball.linearVelocity.set(0, 0);
        ball.angularVelocity.set(0, 0, 0);
        ball.mesh.quaternion.identity();
      }
      update(entry?.message ?? '', 0);
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
      // Initialize even when Strict Mode or browser focus restoration has
      // already focused the input. A zero-size camera makes the cue fill the view.
      const nextWidth = container.clientWidth;
      const nextHeight = container.clientHeight;
      if (nextWidth <= 0 || nextHeight <= 0) return;
      width = nextWidth;
      height = nextHeight;
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
      const strength = distance / limit;
      const stops = [[0, 0, 0], [255, 214, 0], [255, 144, 0], [255, 54, 54]];
      const part = Math.min(2, Math.floor(strength * 3));
      const mix = Math.min(1, strength * 3 - part);
      const color = stops[part].map((start, channel) => Math.round(start + (stops[part + 1][channel] - start) * mix));
      aimLine.current.style.color = `rgba(${color.join(',')}, ${.2 + Math.min(1, strength * 3) * .8})`;
      aimLine.current.style.width = `${distance}px`;
      aimLine.current.style.transform = `translate(${cueBall.x}px, ${cueBall.y}px) translateY(-50%) rotate(${angle}rad)`;
      aimLine.current.classList.add('is-visible');
    }

    function pointerDown(event: PointerEvent) {
      unlockAudio();
      if (!event.isPrimary || event.button > 0) return;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const pad = event.pointerType === 'mouse' ? 6 : 22;
      if (!overCue(x, y, pad)) return;
      event.preventDefault();
      aiming = { pointerId: event.pointerId, x, y };
      (event.currentTarget as HTMLElement).style.cursor = 'grabbing';
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      aimAt(x, y);
    }

    function pointerMove(event: PointerEvent) {
      if (!event.isPrimary || event.button > 0) return;
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
      (event.currentTarget as HTMLElement).style.cursor = overCue(x, y, 6) ? 'grab' : readOnly ? 'default' : 'text';
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
      if (event.type !== 'pointercancel' && distance > 8) {
        const nx = dx / Math.hypot(dx, dy);
        const ny = dy / Math.hypot(dx, dy);
        const power = 520 + (distance / limit) * 1280;
        cueBall.linearVelocity.x -= nx * power;
        cueBall.linearVelocity.y -= ny * power;
        cueBall.angularVelocity.x -= ny * power * 0.04;
        cueBall.angularVelocity.y += nx * power * 0.04;
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
      surface.style.cursor = readOnly ? 'default' : 'text';
    }

    function pointerLeave() {
      lastPointer = null;
      if (!aiming) surface.style.cursor = readOnly ? 'default' : 'text';
    }

    function focusInput() {
      input.current?.focus({ preventScroll: true });
    }

    function onWindowKeyDown(event: KeyboardEvent) {
      if (readOnly || composing.current || event.isComposing || modalOpen.current || (event.target instanceof HTMLElement && event.target.closest('button, a, dialog'))) return;
      unlockAudio();
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Tab') return;
      if (!event.repeat) playKeyPress(event.key);
      focusInput();
    }

    function onWindowKeyUp(event: KeyboardEvent) {
      if (readOnly || composing.current || event.isComposing || modalOpen.current || (event.target instanceof HTMLElement && event.target.closest('button, a, dialog'))) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Tab') return;
      playKeyRelease(event.key);
    }

    function lostContext(event: Event) {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(frame);
      frame = 0;
    }
    function restoredContext() { contextLost = false; previousTime = 0; resize(); invalidate(); }
    renderer.domElement.addEventListener('webglcontextlost', lostContext);
    renderer.domElement.addEventListener('webglcontextrestored', restoredContext);
    const surface: HTMLElement = playSurface.current ?? input.current ?? container;
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    surface.addEventListener('pointerdown', pointerDown, { passive: false });
    surface.addEventListener('pointermove', pointerMove, { passive: false });
    surface.addEventListener('pointerup', pointerUp);
    surface.addEventListener('pointerleave', pointerLeave);
    surface.addEventListener('pointercancel', pointerUp);
    window.addEventListener('keydown', onWindowKeyDown, true);
    window.addEventListener('keyup', onWindowKeyUp, true);
    void loadSounds();
    engine.current = { update, reset };
    resize();
    update(entry?.message ?? currentValue.current, currentValue.current.length);
    if (!readOnly && window.matchMedia('(pointer: fine)').matches) focusInput();
    void document.fonts.ready.then(() => {
      if (disposed) return;
      for (const ball of balls) {
        if (!ball) continue;
        ball.mesh.material.map?.dispose();
        ball.mesh.material.map = textureFor(ball.char, POOL_BALL_COLORS[ball.colorIndex]);
      }
      invalidate();
    });
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('keydown', onWindowKeyDown, true);
      window.removeEventListener('keyup', onWindowKeyUp, true);
      surface.removeEventListener('pointerdown', pointerDown);
      surface.removeEventListener('pointermove', pointerMove);
      surface.removeEventListener('pointerup', pointerUp);
      surface.removeEventListener('pointerleave', pointerLeave);
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
      renderer.domElement.removeEventListener('webglcontextlost', lostContext);
      renderer.domElement.removeEventListener('webglcontextrestored', restoredContext);
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
    };
  }, [entry, readOnly]);

  function resetAll() {
    setValue(entry?.message ?? '');
    committedValue.current = entry?.message ?? '';
    setSaveError('');
    engine.current?.reset();
    input.current?.focus({ preventScroll: true });
  }

  function save() {
    if (!value.trim()) return;
    if (graphemes(value).length > MAX_MESSAGE_LENGTH) { setSaveError('Keep your message to 500 characters or fewer.'); return; }
    modalOpen.current = true;
    setSaveError('');
    input.current?.blur();
    setDraft(value);
  }

  function applyInput(next: string, selection: number) {
    if (!composing.current && graphemes(next).length > MAX_MESSAGE_LENGTH) {
      setSaveError('Keep your message to 500 characters or fewer.');
      setValue(committedValue.current);
      if (input.current) input.current.value = committedValue.current;
      return;
    }
    setSaveError('');
    setValue(next);
    if (!composing.current) { committedValue.current = next; engine.current?.update(next, selection); }
  }

  const canSave = !readOnly && !failed && !pending && !!value.trim() && graphemes(value).length <= MAX_MESSAGE_LENGTH;

  return (
    <main className="pool-page">
      {entry ? <p className="table-by"><span className="by-label">made by</span> <ColoredName name={entry.name} /></p> : canSave && <button ref={saveButton} className="pool-reset ball-button table-save" type="button" aria-label="Save message" onClick={save}>
        <BallLetters text="SAVE" />
      </button>}
      <Link href="/gallery" className="pool-reset ball-button table-gallery" aria-label={readOnly ? 'Back to gallery' : 'Gallery'}><BallLetters text={readOnly ? 'BACK' : 'GALLERY'} /></Link>
      <div ref={host} className="pool-canvas" aria-hidden="true" />
      {!readOnly && <span ref={cursor} className="pool-cursor" aria-hidden="true" />}
      <span ref={aimLine} className="aim-line" aria-hidden="true" />
      {readOnly ? <div ref={playSurface} className="pool-play-surface" aria-label="Play with this message’s pool balls">{failed && <p className="playback-fallback">{entry?.message}</p>}</div> : <textarea
        ref={input}
        aria-label="pools"
        className={failed ? 'fallback-input' : 'pool-input'}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        inputMode="text"
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={(event) => {
          composing.current = false;
          applyInput(event.currentTarget.value, event.currentTarget.selectionStart);
        }}
        onKeyDown={(event) => {
          if (composing.current || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
          if (event.key !== 'Backspace' && event.key !== 'Delete') return;
          const field = event.currentTarget;
          if (field.selectionStart !== field.selectionEnd) return;
          const [start, end] = deletionRange(field.value, field.selectionStart, event.key === 'Backspace');
          if (start === end) return;
          event.preventDefault();
          const next = field.value.slice(0, start) + field.value.slice(end);
          field.value = next;
          field.setSelectionRange(start, start);
          applyInput(next, start);
        }}
        onChange={(event) => applyInput(event.target.value, event.target.selectionStart)}
        onSelect={(event) => { if (!composing.current) engine.current?.update(event.currentTarget.value, event.currentTarget.selectionStart); }}
      />}
      <div className="pool-dock">
        {saveError && <p className="save-error" role="alert">{saveError}</p>}
        <p className="pool-metrics"><ColoredName name={`${letters} letters typed`} /></p>
        {readOnly ? <Link href="/" className="pool-reset ball-button" aria-label="Play your own message"><BallLetters text="PLAY" /></Link> : <button className="pool-reset ball-button" type="button" aria-label="Reset all balls" onClick={resetAll}>
          <BallLetters text="RESET" />
        </button>}
      </div>
      {draft !== null && <SaveDialog message={draft} onClose={() => { setDraft(null); saveButton.current?.focus(); }} />}
    </main>
  );
}
