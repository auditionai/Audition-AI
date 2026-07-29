import { Flower2, Heart, Music2, Sparkles, Star } from 'lucide-react';

const particles = [
  { Icon: Heart, className: 'v2-particle v2-particle--1' },
  { Icon: Star, className: 'v2-particle v2-particle--2' },
  { Icon: Music2, className: 'v2-particle v2-particle--3' },
  { Icon: Flower2, className: 'v2-particle v2-particle--4' },
  { Icon: Sparkles, className: 'v2-particle v2-particle--5' },
  { Icon: Heart, className: 'v2-particle v2-particle--6' },
  { Icon: Star, className: 'v2-particle v2-particle--7' },
  { Icon: Music2, className: 'v2-particle v2-particle--8' },
];

export function AuroraBackdrop() {
  return (
    <div className="v2-aurora-backdrop" aria-hidden="true">
      <span className="v2-wind v2-wind--one" />
      <span className="v2-wind v2-wind--two" />
      <span className="v2-wind v2-wind--three" />
      <span className="v2-wind v2-wind--four" />
      {particles.map(({ Icon, className }, index) => (
        <Icon key={index} className={className} strokeWidth={1.6} />
      ))}
    </div>
  );
}
