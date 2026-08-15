import { ParentComponent, JSX } from 'solid-js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface GlassCardProps {
  class?: string;
  style?: JSX.CSSProperties;
}

const GlassCard: ParentComponent<GlassCardProps> = props => {
  return (
    <div
      class={cn(
        'overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl',
        props.class
      )}
      style={props.style}
    >
      {props.children}
    </div>
  );
};

export default GlassCard;
