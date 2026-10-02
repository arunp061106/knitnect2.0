'use client';

import React from 'react';

type BadgeVariant =
  | 'primary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'purple'
  | 'neutral'
  | 'cyan'
  | 'rose';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  primary: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
  success: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  danger: 'bg-rose-500/15 text-rose-300 border border-rose-500/25',
  warning: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  info: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25',
  purple: 'bg-violet-500/15 text-violet-300 border border-violet-500/25',
  neutral: 'bg-slate-500/15 text-slate-300 border border-slate-500/20',
  cyan: 'bg-cyan-500/10 text-cyan-200 border border-cyan-600/30',
  rose: 'bg-rose-500/15 text-rose-300 border border-rose-500/25',
};

const dotColors: Record<BadgeVariant, string> = {
  primary: 'bg-blue-400',
  success: 'bg-emerald-400',
  danger: 'bg-rose-400',
  warning: 'bg-amber-400',
  info: 'bg-cyan-400',
  purple: 'bg-violet-400',
  neutral: 'bg-slate-400',
  cyan: 'bg-cyan-400',
  rose: 'bg-rose-400',
};

export function Badge({ variant = 'neutral', children, className = '', dot = false }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${variantStyles[variant]} ${className}`}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  );
}
