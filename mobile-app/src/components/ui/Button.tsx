import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl font-medium transition-transform transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
        {
          'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm hover:bg-[var(--color-primary)]/90':
            variant === 'primary',
          'bg-gray-50 dark:bg-zinc-800 text-[var(--color-secondary-foreground)] hover:bg-gray-100 dark:hover:bg-zinc-700':
            variant === 'secondary',
          'border border-gray-100 dark:border-zinc-800 bg-transparent hover:bg-gray-50 dark:hover:bg-zinc-800':
            variant === 'outline',
          'hover:bg-gray-50 dark:hover:bg-zinc-800': variant === 'ghost',
          'h-9 px-4 text-xs': size === 'sm',
          'h-12 px-6 py-2 text-sm': size === 'md',
          'h-14 px-8 text-base rounded-3xl': size === 'lg',
          'h-12 w-12': size === 'icon',
        },
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = 'Button';
