import Link from 'next/link';
import { BallLetters } from '@/components/ball-letters';

export default function MissingShot() {
  return <main className="gallery-page">
    <header className="gallery-header">
      <Link href="/gallery" className="pool-reset ball-button back-link" aria-label="Back to gallery"><BallLetters text="BACK" /></Link>
    </header>
    <div className="gallery-empty">
      <p>this shot drifted away.</p>
      <Link className="pool-reset ball-button" href="/" aria-label="Make pool balls"><BallLetters text="PLAY" /></Link>
    </div>
  </main>;
}
