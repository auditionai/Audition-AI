import React, { useState, useEffect } from 'react';

interface AnimatedSectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

const AnimatedSection = React.forwardRef<HTMLDivElement, AnimatedSectionProps>(
  ({ children, className, id }, ref) => {
    const [style, setStyle] = useState<React.CSSProperties>({
      opacity: 0,
      transform: 'translateY(50px)',
      transition: 'opacity 0.8s ease-out, transform 0.8s ease-out',
      willChange: 'opacity, transform',
    });

    useEffect(() => {
      const element = (ref as React.RefObject<HTMLDivElement>)?.current;
      if (!element) return;

      const observer = new IntersectionObserver(
          (entries) => {
              entries.forEach(entry => {
                  if (entry.isIntersecting) {
                      setStyle({
                          opacity: 1,
                          transform: 'translateY(0px)',
                          transition: 'opacity 0.8s ease-out, transform 0.8s ease-out',
                          willChange: 'opacity, transform',
                      });
                      observer.unobserve(entry.target);
                  }
              });
          },
          {
              threshold: 0.1,
          }
      );

      observer.observe(element);

      return () => {
          // Check if element exists before unobserving, as it might be unmounted
          if (element) {
            observer.unobserve(element);
          }
      };
    }, [ref]);

    return (
      <div ref={ref} style={style} className={className} id={id}>
        {children}
      </div>
    );
  }
);

AnimatedSection.displayName = 'AnimatedSection';

export default AnimatedSection;
