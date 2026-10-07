import React, { useEffect, useRef } from 'react';

const GREETINGS = [
  'வணக்கம்', 'नमस्ते', 'Hello', 'Hola', 'నమస్కారం', 'ನಮಸ್ಕಾರ', 'നമസ്കാരം', 'নমস্কার', 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', 'નમસ્તે',
  'Bonjour', 'Ciao', 'Olá', 'Hallo', 'こんにちは', '안녕하세요', '你好', 'مرحبا', 'Привет', 'Merhaba', 'Salaam', 'Jambo',
  'Machan!', 'Kya haal?', 'Epdi iruka?', 'Bro 👋',
];
const COLORS = ['#8B7CF6', '#F472B6', '#22D3EE', '#34D399', '#FBBF24', '#FB7185', '#60A5FA'];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const CSS = `
.et-bg { position: fixed; inset: 0; overflow: hidden; z-index: 0; pointer-events: none;
  background: radial-gradient(1200px 800px at 10% 10%, #3b2a8f 0%, transparent 60%),
              radial-gradient(1000px 700px at 90% 20%, #0e7490 0%, transparent 55%),
              radial-gradient(900px 900px at 50% 110%, #9d174d 0%, transparent 60%),
              #0b0d14; }
.et-blob { position: absolute; border-radius: 50%; filter: blur(70px); opacity: .55; animation: et-drift 22s ease-in-out infinite alternate; }
@keyframes et-drift { from { transform: translate(0,0) scale(1); } to { transform: translate(6vw,-5vh) scale(1.15); } }
.et-word { position: absolute; color: rgba(255,255,255,.07); font-weight: 800; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; white-space: nowrap; user-select: none;
  animation: et-rise linear infinite; }
@keyframes et-rise { from { transform: translateY(110vh); } to { transform: translateY(-20vh); } }
.et-trail { position: fixed; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; }
.et-bubble { position: absolute; padding: 6px 12px; border-radius: 16px 16px 16px 4px; color: #fff; font: 600 14px/1.2 system-ui, sans-serif;
  white-space: nowrap; box-shadow: 0 6px 20px rgba(0,0,0,.25); transform: translate(-50%, -110%);
  animation: et-pop 1.3s ease-out forwards; }
@keyframes et-pop {
  0% { opacity: 0; transform: translate(-50%, -80%) scale(.6); }
  15% { opacity: 1; transform: translate(-50%, -110%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -260%) scale(.95); } }
@media (prefers-reduced-motion: reduce) { .et-blob, .et-word { animation: none; } }
`;

/** Colourful backdrop with drifting greetings; with `trail`, the pointer leaves a trail of greeting bubbles. */
export function WelcomeBackdrop({ trail: withTrail = true }: { trail?: boolean }) {
  const trail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!withTrail) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let lastX = 0, lastY = 0, lastT = 0;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastT < 110 && Math.hypot(e.clientX - lastX, e.clientY - lastY) < 70) return;
      lastX = e.clientX; lastY = e.clientY; lastT = now;
      const host = trail.current;
      if (!host || host.childElementCount > 24) return;
      const b = document.createElement('div');
      b.className = 'et-bubble';
      b.textContent = pick(GREETINGS);
      b.style.left = `${e.clientX}px`;
      b.style.top = `${e.clientY}px`;
      b.style.background = pick(COLORS);
      b.addEventListener('animationend', () => b.remove());
      host.appendChild(b);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [withTrail]);

  // fixed layout for the ambient words so they don't jump on re-render
  const words = useRef(Array.from({ length: 16 }, (_, i) => ({
    text: GREETINGS[i % GREETINGS.length],
    left: `${(i * 37) % 95}%`,
    size: 18 + ((i * 7) % 30),
    duration: 28 + ((i * 11) % 24),
    delay: -((i * 13) % 40),
  }))).current;

  return (
    <>
      <style>{CSS}</style>
      <div className="et-bg" aria-hidden>
        <div className="et-blob" style={{ width: 520, height: 520, left: '-8%', top: '-10%', background: '#6d28d9' }} />
        <div className="et-blob" style={{ width: 460, height: 460, right: '-6%', top: '10%', background: '#0891b2', animationDelay: '-8s' }} />
        <div className="et-blob" style={{ width: 600, height: 600, left: '30%', bottom: '-25%', background: '#be185d', animationDelay: '-14s' }} />
        {words.map((w, i) => (
          <span key={i} className="et-word" style={{ left: w.left, fontSize: w.size, animationDuration: `${w.duration}s`, animationDelay: `${w.delay}s` }}>{w.text}</span>
        ))}
      </div>
      <div ref={trail} className="et-trail" aria-hidden />
    </>
  );
}
