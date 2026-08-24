import { type Component, type JSX, Show, createSignal, createUniqueId, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';

interface TooltipProps {
  content: string | JSX.Element;
  children: JSX.Element;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export const Tooltip: Component<TooltipProps> = props => {
  const [isVisible, setIsVisible] = createSignal(false);
  const [tooltipPos, setTooltipPos] = createSignal({ x: 0, y: 0 });
  const tooltipId = createUniqueId();
  let timeoutId: number | undefined;

  const delay = () => props.delay ?? 200;

  const clearShowTimeout = () => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  onCleanup(clearShowTimeout);

  const show = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const rect = target.getBoundingClientRect();

    const position = props.position || 'top';
    let x = 0;
    let y = 0;

    switch (position) {
      case 'top':
        x = rect.left + rect.width / 2;
        y = rect.top - 8;
        break;
      case 'bottom':
        x = rect.left + rect.width / 2;
        y = rect.bottom + 8;
        break;
      case 'left':
        x = rect.left - 8;
        y = rect.top + rect.height / 2;
        break;
      case 'right':
        x = rect.right + 8;
        y = rect.top + rect.height / 2;
        break;
    }

    setTooltipPos({ x, y });

    timeoutId = window.setTimeout(() => {
      timeoutId = undefined;
      setIsVisible(true);
    }, delay());
  };

  const handleEnter = (e: MouseEvent | FocusEvent) => {
    show(e.currentTarget);
  };

  const handleMouseLeave = () => {
    clearShowTimeout();
    setIsVisible(false);
  };

  const getPositionClasses = () => {
    const position = props.position || 'top';
    // `position` was defaulted above, so every case here is reachable.
    switch (position) {
      case 'top':
        return '-translate-x-1/2 -translate-y-full';
      case 'bottom':
        return '-translate-x-1/2';
      case 'left':
        return '-translate-x-full -translate-y-1/2';
      case 'right':
        return '-translate-y-1/2';
    }
  };

  return (
    <>
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={handleMouseLeave}
        onFocusIn={handleEnter}
        onFocusOut={handleMouseLeave}
        class="inline-block"
      >
        {props.children}
      </div>

      <Show when={isVisible()}>
        <Portal>
          <div
            id={tooltipId}
            role="tooltip"
            class={`bg-void-900/95 text-nebula-200 pointer-events-none fixed z-[var(--z-tooltip)] max-w-xs rounded-lg border border-white/10 px-3 py-2 text-xs shadow-2xl backdrop-blur-sm transition-opacity duration-200 ${getPositionClasses()}`}
            style={{
              left: `${tooltipPos().x}px`,
              top: `${tooltipPos().y}px`,
            }}
          >
            {props.content}
          </div>
        </Portal>
      </Show>
    </>
  );
};
