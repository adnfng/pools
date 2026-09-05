const KEY_PRESSES = [
  '/sounds/mx-black/press_key1.mp3',
  '/sounds/mx-black/press_key2.mp3',
  '/sounds/mx-black/press_key3.mp3',
  '/sounds/mx-black/press_key4.mp3',
  '/sounds/mx-black/press_key5.mp3',
] as const;

const KEY_MAP: Record<string, { press: string; release: string }> = {
  Backspace: { press: '/sounds/mx-black/press_back.mp3', release: '/sounds/mx-black/release_back.mp3' },
  Delete: { press: '/sounds/mx-black/press_back.mp3', release: '/sounds/mx-black/release_back.mp3' },
  Enter: { press: '/sounds/mx-black/press_enter.mp3', release: '/sounds/mx-black/release_enter.mp3' },
  ' ': { press: '/sounds/mx-black/press_space.mp3', release: '/sounds/mx-black/release_space.mp3' },
};

const KEY_RELEASE = '/sounds/mx-black/release_key.mp3';
const COLLISION = '/sounds/mx-black/press_key1.mp3';

let context: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
let loading: Promise<void> | null = null;

function audio() {
  if (typeof window === 'undefined') return null;
  context ??= new AudioContext();
  return context;
}

export function unlockAudio() {
  const ctx = audio();
  if (ctx?.state === 'suspended') void ctx.resume();
}

export function loadSounds() {
  const ctx = audio();
  if (!ctx || loading) return loading;
  const urls = [
    ...KEY_PRESSES,
    KEY_RELEASE,
    KEY_MAP.Backspace.press,
    KEY_MAP.Backspace.release,
    KEY_MAP.Enter.press,
    KEY_MAP.Enter.release,
    KEY_MAP[' '].press,
    KEY_MAP[' '].release,
  ];
  loading = Promise.all(
    urls.map(async (url) => {
      if (buffers.has(url)) return;
      const response = await fetch(url);
      const raw = await response.arrayBuffer();
      buffers.set(url, await ctx.decodeAudioData(raw.slice(0)));
    }),
  ).then(() => undefined);
  return loading;
}

function play(url: string, rate = 1, volume = 0.7) {
  const ctx = audio();
  const buffer = buffers.get(url);
  if (!ctx || !buffer) return;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

export function playKeyPress(key: string) {
  const special = KEY_MAP[key];
  if (special) {
    play(special.press, 1, 0.78);
    return;
  }
  play(KEY_PRESSES[Math.floor(Math.random() * KEY_PRESSES.length)], 0.96 + Math.random() * 0.08, 0.7);
}

export function playKeyRelease(key: string) {
  const special = KEY_MAP[key];
  play(special?.release ?? KEY_RELEASE, 1, 0.45);
}

export function playCollision(speed: number) {
  const strength = Math.min(1, speed / 900);
  play(COLLISION, 0.62 + strength * 0.7 + (Math.random() - 0.5) * 0.12, 0.18 + strength * 0.45);
}
