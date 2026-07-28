import React, { useEffect, useRef, useState } from 'react';

const GALAXY_PARTICLES = Array.from({ length: 84 }, (_, index) => {
  const depth = index % 7 === 0 ? 'near' : index % 3 === 0 ? 'mid' : 'far';
  const durationBase = depth === 'near' ? 5 : depth === 'mid' ? 9 : 15;

  return {
    x: (index * 37 + 11) % 101,
    y: (index * 61 + 17) % 103,
    size: depth === 'near' ? 2.6 + (index % 3) * 0.7 : depth === 'mid' ? 1.7 + (index % 2) * 0.6 : 0.9 + (index % 3) * 0.35,
    delay: -((index * 1.73) % 19),
    duration: durationBase + (index % 5) * 0.85,
    drift: 10 + (index * 13) % 42,
    color: index % 11 === 0 ? 'violet' : index % 4 === 0 ? 'pink' : index % 3 === 0 ? 'cyan' : 'white',
    depth,
  };
});

const STAR_STREAKS = Array.from({ length: 18 }, (_, index) => ({
  x: (index * 29 + 7) % 100,
  y: (index * 47 + 5) % 100,
  length: 54 + (index % 6) * 20,
  delay: -((index * 1.37) % 13),
  duration: 4.8 + (index % 5) * 0.9,
  color: index % 3 === 0 ? 'pink' : 'cyan',
}));

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
        <div className="desktop-atmosphere__galaxy-band" />
        <div className="desktop-atmosphere__galaxy-dust" />
        <div className="desktop-atmosphere__grid" />
        <div className="desktop-atmosphere__scan" />
        <div className="desktop-atmosphere__spotlight" />
        <div className="desktop-atmosphere__particles">
          {GALAXY_PARTICLES.map((particle, index) => (
            <span
              key={index}
              className={`desktop-atmosphere__particle desktop-atmosphere__particle--${particle.color} desktop-atmosphere__particle--${particle.depth}`}
              style={{
                '--particle-x': `${particle.x}%`,
                '--particle-y': `${particle.y}%`,
                '--particle-size': `${particle.size}px`,
                '--particle-delay': `${particle.delay}s`,
                '--particle-duration': `${particle.duration}s`,
                '--particle-from-x': `${particle.drift * -0.35}px`,
                '--particle-from-y': `${particle.drift * -0.25}px`,
                '--particle-to-x': `${particle.drift}px`,
                '--particle-to-y': `${particle.drift * 0.72}px`,
              } as React.CSSProperties}
            />
          ))}
        </div>
        <div className="desktop-atmosphere__streaks">
          {STAR_STREAKS.map((streak, index) => (
            <span
              key={index}
              className={`desktop-atmosphere__streak desktop-atmosphere__streak--${streak.color}`}
              style={{
                '--streak-x': `${streak.x}%`,
                '--streak-y': `${streak.y}%`,
                '--streak-length': `${streak.length}px`,
                '--streak-delay': `${streak.delay}s`,
                '--streak-duration': `${streak.duration}s`,
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
        <svg className="desktop-cursor__pointer" viewBox="0 0 34 40" role="presentation">
          <defs>
            <linearGradient id="audition-cursor-gradient" x1="5" y1="3" x2="27" y2="35">
              <stop stopColor="#ffffff" />
              <stop offset="0.28" stopColor="#70f8ff" />
              <stop offset="0.62" stopColor="#00d9e8" />
              <stop offset="1" stopColor="#ff168b" />
            </linearGradient>
          </defs>
          <path
            d="M4 2.6 29.2 20c1.3.9.8 2.9-.8 3.1l-9.2 1.1 5.1 8.3-6 3.7-5.2-8.5-5.6 7.1c-1 1.2-3 .5-2.9-1L2 4.2c-.1-1.4.9-2.2 2-1.6Z"
            fill="url(#audition-cursor-gradient)"
            stroke="#021317"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path d="m7 8 1.2 17.4 4-5 7-.8L7 8Z" fill="#07131b" opacity="0.72" />
          <path d="m24.5 26.8 3.2 5.2-5.9 3.6" fill="none" stroke="#ff168b" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
    </>
  );
};
