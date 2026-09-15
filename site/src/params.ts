import { defineParams } from '@sveltejs/kit/params';

export const params = defineParams({
  learning: value =>
    value === 'runtimes' || value === 'guides' || value === 'compare' ? value : undefined,
});
