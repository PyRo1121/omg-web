import type { ParentComponent, JSX } from 'solid-js';
import { cn } from '~/lib/prelude';

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
