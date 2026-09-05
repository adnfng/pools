'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { graphemeIndex } from '@/lib/text';
import { cleanName } from '@/lib/gallery';
import { BallLetters } from './ball-letters';
import { ColoredName } from './colored-name';
import { useGallery } from './gallery-provider';
import { playKeyPress, playKeyRelease } from '@/lib/sounds';

export function SaveDialog({ message, onClose }: { message: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const ink = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const [name, setName] = useState('');
  const router = useRouter();
  const { submit } = useGallery();
  useEffect(() => { dialog.current?.showModal(); field.current?.focus(); }, []);
  function alignName() {
    if (!field.current || !editor.current || !ink.current) return;
    const overflow = ink.current.scrollWidth > editor.current.clientWidth;
    editor.current.dataset.overflow = String(overflow);
    ink.current.style.transform = overflow ? `translateX(${-field.current.scrollLeft}px)` : '';
    if (caret.current) {
      const count = graphemeIndex(field.current.value, field.current.selectionStart ?? 0);
      const letters = Array.from(ink.current.querySelectorAll<HTMLElement>('.colored-name > span'));
      const before = letters.slice(0, count).reduce((width, letter) => width + letter.offsetWidth, 0);
      const x = ink.current.getBoundingClientRect().left - editor.current.getBoundingClientRect().left + before;
      caret.current.style.left = `${Math.max(0, Math.min(editor.current.clientWidth - 3, x))}px`;
    }
  }
  useEffect(() => {
    alignName();
    const observer = new ResizeObserver(alignName);
    if (editor.current) observer.observe(editor.current);
    return () => observer.disconnect();
  }, [name]);
  return <dialog ref={dialog} className="save-dialog" aria-label="Save your message" onCancel={onClose}>
    <button type="button" className="pool-reset ball-button table-gallery" aria-label="Back to message" onClick={onClose}>
      <BallLetters text="BACK" />
    </button>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!name.trim()) return;
      submit(message, name.trim());
      router.push('/gallery');
      onClose();
    }}>
      <div ref={editor} className="name-editor">
        <span ref={caret} className="name-cursor" aria-hidden="true" />
        <div className="name-text-preview" aria-hidden="true"><div ref={ink} className="name-text-ink"><ColoredName name={name} /></div></div>
        <input ref={field} id="gallery-name" className="name-input" value={name} aria-label="Name" placeholder="Name" onScroll={alignName} onSelect={alignName} onFocus={alignName}
          autoComplete="nickname" spellCheck={false} autoCapitalize="off"
          onChange={(event) => setName(cleanName(event.target.value))}
          onKeyDown={(event) => { if (!event.repeat) playKeyPress(event.key); }}
          onKeyUp={(event) => playKeyRelease(event.key)} />
      </div>
      <button className="pool-reset ball-button send-button" type="submit" disabled={!name.trim()} aria-label="Send to gallery"><BallLetters text="SEND" /></button>
    </form>
  </dialog>;
}
