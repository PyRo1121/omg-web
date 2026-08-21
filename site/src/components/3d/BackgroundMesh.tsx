import { type Component, onCleanup, onMount } from 'solid-js';

const GRID_COLUMNS = 36;
const GRID_ROWS = 22;
const MAX_PIXEL_RATIO = 2;

const BackgroundMesh: Component = () => {
  let canvasRef: HTMLCanvasElement | undefined;

  onMount(() => {
    const canvas = canvasRef;
    const context = canvas?.getContext('2d');
    if (canvas === undefined || context === null || context === undefined) {
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animationFrameId: number | undefined;

    const resize = (): void => {
      const pixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
      canvas.width = Math.round(window.innerWidth * pixelRatio);
      canvas.height = Math.round(window.innerHeight * pixelRatio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const draw = (timeMs: number): void => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const time = timeMs / 1_000;
      context.clearRect(0, 0, width, height);
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(99, 102, 241, 0.16)';

      for (let row = 0; row <= GRID_ROWS; row += 1) {
        const depth = row / GRID_ROWS;
        const baseY = height * (0.46 + depth * 0.7);
        const perspective = 0.2 + depth * 0.8;
        context.beginPath();

        for (let column = 0; column <= GRID_COLUMNS; column += 1) {
          const progress = column / GRID_COLUMNS;
          const x = width * progress;
          const centeredX = progress * 2 - 1;
          const wave =
            Math.sin(centeredX * 6 + time * 0.8 + row * 0.35) * 15 * perspective +
            Math.sin(centeredX * 11 - time * 0.45) * 7 * perspective;
          const y = baseY + wave;
          if (column === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
        context.stroke();
      }

      context.strokeStyle = 'rgba(129, 140, 248, 0.1)';
      for (let column = 0; column <= GRID_COLUMNS; column += 2) {
        const progress = column / GRID_COLUMNS;
        const x = width * progress;
        context.beginPath();
        context.moveTo(width / 2 + (x - width / 2) * 0.2, height * 0.46);
        context.lineTo(x, height * 1.16);
        context.stroke();
      }
    };

    const animate = (timeMs: number): void => {
      draw(timeMs);
      if (!reducedMotion.matches) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    const restartAnimation = (): void => {
      if (animationFrameId !== undefined) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    resize();
    restartAnimation();
    window.addEventListener('resize', resize);
    reducedMotion.addEventListener('change', restartAnimation);

    onCleanup(() => {
      window.removeEventListener('resize', resize);
      reducedMotion.removeEventListener('change', restartAnimation);
      if (animationFrameId !== undefined) {
        cancelAnimationFrame(animationFrameId);
      }
    });
  });

  return (
    <canvas
      ref={element => (canvasRef = element)}
      class="pointer-events-none fixed inset-0 z-[-1]"
      aria-hidden="true"
    />
  );
};

export default BackgroundMesh;
