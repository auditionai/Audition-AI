import React from 'react';

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

const LIGHT_MOTES = Array.from({ length: 48 }, (_, index) => ({
  x: (index * 43 + 9) % 104,
  y: (index * 71 + 13) % 102,
  size: 1.5 + (index % 4) * 0.7,
  delay: -((index * 1.41) % 15),
  duration: 6.5 + (index % 6) * 0.75,
  travel: 42 + (index * 17) % 96,
  color: ['pink', 'cyan', 'violet', 'emerald', 'amber'][index % 5],
}));

const CUTE_SYMBOL_TYPES = ['heart', 'star', 'sparkle', 'diamond', 'music', 'flower', 'bow'] as const;

const CUTE_SYMBOLS = Array.from({ length: 30 }, (_, index) => ({
  x: (index * 31 + 6) % 101,
  y: (index * 53 + 8) % 98,
  size: 12 + (index % 5) * 3,
  delay: -((index * 1.23) % 16),
  duration: 8 + (index % 7) * 0.9,
  travel: 54 + (index * 19) % 110,
  type: CUTE_SYMBOL_TYPES[index % CUTE_SYMBOL_TYPES.length],
  color: ['pink', 'violet', 'cyan', 'emerald', 'amber'][index % 5],
}));

const WIND_STREAMS = Array.from({ length: 8 }, (_, index) => ({
  y: 8 + index * 12,
  width: 30 + (index % 4) * 9,
  delay: -(index * 1.35),
  duration: 7 + (index % 4) * 1.4,
  color: ['pink', 'cyan', 'violet', 'emerald'][index % 4],
}));

const CuteSymbol: React.FC<{ type: typeof CUTE_SYMBOL_TYPES[number] }> = ({ type }) => {
  const commonProps = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <svg viewBox="0 0 24 24" role="presentation" {...commonProps}>
      {type === 'heart' && <path d="M20.8 5.7c-2.1-2.3-5.5-1.7-7.1.7L12 8.9l-1.7-2.5C8.7 4 5.3 3.4 3.2 5.7.9 8.2 1.5 12 4 14.3L12 21l8-6.7c2.5-2.3 3.1-6.1.8-8.6Z" />}
      {type === 'star' && <path d="m12 2.7 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.4 6.3-.9L12 2.7Z" />}
      {type === 'sparkle' && (
        <>
          <path d="M12 2.5c.8 5.8 1.8 6.8 7.5 7.5-5.7.8-6.7 1.8-7.5 7.5-.8-5.7-1.8-6.7-7.5-7.5 5.7-.7 6.7-1.7 7.5-7.5Z" />
          <path d="M19 16.5c.3 2.2.8 2.7 3 3-2.2.3-2.7.8-3 3-.3-2.2-.8-2.7-3-3 2.2-.3 2.7-.8 3-3Z" />
        </>
      )}
      {type === 'diamond' && (
        <>
          <path d="m12 21-9-11 4-6h10l4 6-9 11Z" />
          <path d="M3 10h18M7 4l5 17 5-17" />
        </>
      )}
      {type === 'music' && (
        <>
          <path d="M9 17.5V5l10-2v12.5" />
          <ellipse cx="6.5" cy="18" rx="2.5" ry="2" />
          <ellipse cx="16.5" cy="16" rx="2.5" ry="2" />
        </>
      )}
      {type === 'flower' && (
        <>
          <circle cx="12" cy="12" r="2.1" />
          <path d="M12 9.8C8.5 8.5 8.7 4 12 3c3.3 1 3.5 5.5 0 6.8ZM14.2 12c1.3-3.5 5.8-3.3 6.8 0-1 3.3-5.5 3.5-6.8 0ZM12 14.2c3.5 1.3 3.3 5.8 0 6.8-3.3-1-3.5-5.5 0-6.8ZM9.8 12C8.5 15.5 4 15.3 3 12c1-3.3 5.5-3.5 6.8 0Z" />
        </>
      )}
      {type === 'bow' && (
        <>
          <path d="M11 10.2C8 5.6 3.8 5.2 3 8.5c-.8 3.2 3.1 4.6 8 2.1M13 10.2c3-4.6 7.2-5 8-1.7.8 3.2-3.1 4.6-8 2.1" />
          <circle cx="12" cy="10.4" r="1.8" />
          <path d="m11.2 12-3 7M12.8 12l3 7" />
        </>
      )}
    </svg>
  );
};

export const DesktopAtmosphere: React.FC = () => {
  return (
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
        <div className="desktop-atmosphere__wind" aria-hidden="true">
          {WIND_STREAMS.map((stream, index) => (
            <span
              key={index}
              className={`desktop-atmosphere__wind-stream desktop-atmosphere__wind-stream--${stream.color}`}
              style={{
                '--wind-y': `${stream.y}%`,
                '--wind-width': `${stream.width}vw`,
                '--wind-delay': `${stream.delay}s`,
                '--wind-duration': `${stream.duration}s`,
              } as React.CSSProperties}
            />
          ))}
        </div>
        <div className="desktop-atmosphere__light-motes" aria-hidden="true">
          {LIGHT_MOTES.map((mote, index) => (
            <span
              key={index}
              className={`desktop-atmosphere__light-mote desktop-atmosphere__light-mote--${mote.color}`}
              style={{
                '--mote-x': `${mote.x}%`,
                '--mote-y': `${mote.y}%`,
                '--mote-size': `${mote.size}px`,
                '--mote-delay': `${mote.delay}s`,
                '--mote-duration': `${mote.duration}s`,
                '--mote-travel': `${mote.travel}px`,
                '--mote-travel-back': `${mote.travel * -0.65}px`,
              } as React.CSSProperties}
            />
          ))}
        </div>
        <div className="desktop-atmosphere__cute-symbols" aria-hidden="true">
          {CUTE_SYMBOLS.map((symbol, index) => (
            <span
              key={index}
              className={`desktop-atmosphere__cute-symbol desktop-atmosphere__cute-symbol--${symbol.color}`}
              style={{
                '--cute-x': `${symbol.x}%`,
                '--cute-y': `${symbol.y}%`,
                '--cute-size': `${symbol.size}px`,
                '--cute-delay': `${symbol.delay}s`,
                '--cute-duration': `${symbol.duration}s`,
                '--cute-travel': `${symbol.travel}px`,
                '--cute-travel-back': `${symbol.travel * -0.72}px`,
              } as React.CSSProperties}
            >
              <CuteSymbol type={symbol.type} />
            </span>
          ))}
        </div>
    </div>
  );
};
