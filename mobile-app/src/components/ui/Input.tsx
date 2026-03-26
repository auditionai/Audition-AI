import React from 'react';
import { cn } from '../../lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-14 w-full rounded-2xl border border-[var(--color-border)] bg-gray-50 dark:bg-zinc-800/50 px-4 py-2 text-sm placeholder:text-gray-500 dark:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:bg-white dark:focus-visible:bg-[#18181B] transition-all disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = 'Input';
