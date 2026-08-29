import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  accent?: 'cyan' | 'pink' | 'emerald' | 'yellow';
  children: ReactNode;
};

const ACCENT: Record<NonNullable<Props['accent']>, string> = {
  cyan: 'hover:border-[#00F0FF] hover:shadow-[0_0_24px_#00F0FF55] hover:bg-[#00F0FF22]',
  pink: 'hover:border-[#FF007F] hover:shadow-[0_0_24px_#FF007F55] hover:bg-[#FF007F22]',
  emerald: 'hover:border-[#00FF66] hover:shadow-[0_0_24px_#00FF6655] hover:bg-[#00FF6622]',
  yellow: 'hover:border-[#FFCC00] hover:shadow-[0_0_24px_#FFCC0055] hover:bg-[#FFCC0022]',
};

export function SkewButton({ accent = 'cyan', className = '', children, ...rest }: Props) {
  return (
    <button
      className={`skew-card rounded-xl border border-white/12 bg-[#121622]/80 px-7 py-3 text-sm font-bold uppercase tracking-[0.08em] text-white backdrop-blur-md transition-transform duration-200 hover:-translate-y-1 hover:scale-110 ${ACCENT[accent]} disabled:opacity-40 ${className}`}
      {...rest}
    >
      <span className="skew-card-inner block">{children}</span>
    </button>
  );
}
