import React, { useEffect, useRef, useState } from 'react';

const PARTICLES = [
  { x: 7, y: 16, size: 2, delay: -2, duration: 14, color: 'pink' },
  { x: 14, y: 74, size: 1, delay: -7, duration: 18, color: 'cyan' },
  { x: 23, y: 42, size: 2, delay: -11, duration: 16, color: 'cyan' },
  { x: 31, y: 87, size: 1, delay: -4, duration: 20, color: 'pink' },
  { x: 39, y: 23, size: 1, delay: -9, duration: 15, color: 'pink' },
  { x: 48, y: 66, size: 2, delay: -1, duration: 19, color: 'cyan' },
  { x: 57, y: 11, size: 1, delay: -13, duration: 17, color: 'cyan' },
  { x: 64, y: 81, size: 2, delay: -6, duration: 21, color: 'pink' },
  { x: 72, y: 37, size: 1, delay: -10, duration: 15, color: 'cyan' },
  { x: 79, y: 91, size: 1, delay: -3, duration: 18, color: 'pink' },
  { x: 86, y: 19, size: 2, delay: -8, duration: 20, color: 'pink' },
  { x: 93, y: 58, size: 1, delay: -12, duration: 16, color: 'cyan' },
] as const;

const INTERACTIVE_SELECTOR = 'a, button, input, textarea, select, summary, [role="button"], [data-cursor="interactive"]';

export const DesktopAtmosphere: React.FC = () => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const targetRef = useRef({ x: -100, y: -100 });
  const currentRef = useRef({ x: -100, y: -100 });
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorActive, setCursorActive] = useState(false);
  const [cursorPressed, setCursorPressed] = useState(false);

  useEffect(() => {
    const finePointer = window.matchMedia('(min-width: 1024px) and (pointer: fine)');
    if (!finePointer.matches) return;

    const renderCursor = () => {
      const current = currentRef.current;
      const target = targetRef.current;
      current.x += (target.x - current.x) * 0.34;
      current.y += (target.y - current.y) * 0.34;

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
      }
      frameRef.current = window.requestAnimationFrame(renderCursor);
    };

    const handlePointerMove = (event: PointerEvent) => {
      targetRef.current = { x: event.clientX, y: event.clientY };
      document.documentElement.style.setProperty('--pointer-x', `${event.clientX}px`);
      document.documentElement.style.setProperty('--pointer-y', `${event.clientY}px`);
      setCursorVisible(true);
    };
    const handlePointerOver = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      setCursorActive(Boolean(target?.closest(INTERACTIVE_SELECTOR)));
    };
    const handlePointerDown = () => setCursorPressed(true);
    const handlePointerUp = () => setCursorPressed(false);
    const handlePointerLeave = () => setCursorVisible(false);

    frameRef.current = window.requestAnimationFrame(renderCursor);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerover', handlePointerOver, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });
    document.documentElement.addEventListener('mouseleave', handlePointerLeave);

    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerover', handlePointerOver);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      document.documentElement.removeEventListener('mouseleave', handlePointerLeave);
      document.documentElement.style.removeProperty('--pointer-x');
      document.documentElement.style.removeProperty('--pointer-y');
    };
  }, []);

  return (
    <>
      <div className="desktop-atmosphere" aria-hidden="true">
        <div className="desktop-atmosphere__aurora" />
        <div className="desktop-atmosphere__grid" />
        <div className="desktop-atmosphere__scan" />
        <div className="desktop-atmosphere__spotlight" />
        <div className="desktop-atmosphere__particles">
          {PARTICLES.map((particle, index) => (
            <span
              key={index}
              className={`desktop-atmosphere__particle desktop-atmosphere__particle--${particle.color}`}
              style={{
                '--particle-x': `${particle.x}%`,
                '--particle-y': `${particle.y}%`,
                '--particle-size': `${particle.size}px`,
                '--particle-delay': `${particle.delay}s`,
                '--particle-duration': `${particle.duration}s`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>

      <div
        ref={cursorRef}
        className={[
          'desktop-cursor',
          cursorVisible ? 'is-visible' : '',
          cursorActive ? 'is-active' : '',
          cursorPressed ? 'is-pressed' : '',
        ].join(' ')}
        aria-hidden="true"
      >
        <span className="desktop-cursor__ring" />
        <svg className="desktop-cursor__pointer" viewBox="0 0 28 34" role="presentation">
          <defs>
            <linearGradient id="audition-cursor-gradient" x1="3" y1="2" x2="24" y2="31">
              <stop stopColor="#ffffff" />
              <stop offset="0.3" stopColor="#ff4fa7" />
              <stop offset="1" stopColor="#ff007f" />
            </linearGradient>
          </defs>
          <path
            d="M3.3 2.4 24.8 21c1 .9.4 2.6-.9 2.6h-8.2l4.5 7.1-5 2.9-4.3-7.2-4.5 6c-.8 1-2.5.5-2.5-.8L2 3.5c-.1-1.2.6-1.8 1.3-1.1Z"
            fill="url(#audition-cursor-gradient)"
            stroke="#070912"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        <span className="desktop-cursor__dot" />
      </div>
    </>
  );
};
