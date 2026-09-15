<script lang="ts">
  import LearningArticle from '../../../lib/components/learn/LearningArticle.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<LearningArticle meta={data.meta} content={data.content} />
