import { useId } from 'react';

type AuditionV2LogoProps = {
  compact?: boolean;
  showWordmark?: boolean;
  className?: string;
};

export function AuditionV2Logo({
  compact = false,
  showWordmark = true,
  className = '',
}: AuditionV2LogoProps) {
  const gradientId = useId().replace(/:/g, '');
  const shineId = useId().replace(/:/g, '');

  return (
    <span className={`v2-logo${compact ? ' v2-logo--compact' : ''} ${className}`.trim()}>
      <span className="v2-logo__symbol" aria-hidden="true">
        <svg viewBox="0 0 64 64" role="img">
          <defs>
            <linearGradient id={gradientId} x1="8" y1="8" x2="58" y2="58" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ff3aa8" />
              <stop offset=".45" stopColor="#8a5cff" />
              <stop offset=".72" stopColor="#19d7e8" />
              <stop offset="1" stopColor="#ffb21c" />
            </linearGradient>
            <linearGradient id={shineId} x1="20" y1="13" x2="45" y2="49" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fff" stopOpacity=".96" />
              <stop offset="1" stopColor="#ffe6f5" stopOpacity=".64" />
            </linearGradient>
          </defs>
          <path
            className="v2-logo__orbit"
            d="M9.5 35.5c-2.2-13 7.6-24.7 21.8-26.1 14.3-1.4 27.5 8 29.5 21 2 13-7.8 24.8-22 26.2-14.1 1.3-27.3-8-29.3-21.1Z"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeDasharray="38 13"
          />
          <path
            d="M17 46 29.3 17.2c1.1-2.6 4.8-2.6 5.9 0L47 46h-8.2l-2.2-6H25.9l-2.4 6H17Zm11.4-13h5.7l-2.8-8.2L28.4 33Z"
            fill={`url(#${shineId})`}
          />
          <path d="m48.8 11.5 1.7 4.2 4.2 1.7-4.2 1.7-1.7 4.2-1.7-4.2-4.2-1.7 4.2-1.7 1.7-4.2Z" fill="#ffb21c" />
          <circle cx="11.8" cy="30.5" r="3.1" fill="#19d7e8" />
          <circle cx="51.5" cy="48.2" r="2.4" fill="#ff3aa8" />
        </svg>
      </span>
      {showWordmark && (
        <span className="v2-logo__wordmark">
          <strong>AUDITION</strong>
          <span>AI</span>
          <small>CREATIVE UNIVERSE</small>
        </span>
      )}
    </span>
  );
}
