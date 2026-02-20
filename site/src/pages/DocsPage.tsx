import { Component, createMemo, For, Suspense, lazy } from 'solid-js';
import { useParams } from '@solidjs/router';
import { SolidMarkdown } from 'solid-markdown';
import { getAllDocs, getDocBySlug } from '../lib/docs';
import GlassCard from '../components/ui/GlassCard';
import Header from '../components/Header';
import CodeBlock from '../components/docs/CodeBlock';
import Footer from '../components/Footer';

const BackgroundMesh = lazy(() => import('../components/3d/BackgroundMesh'));

const DocsPage: Component = () => {
  const params = useParams();
  const allDocs = getAllDocs();

  const currentDoc = createMemo(() => {
    const slug = params.slug || 'index';
    return getDocBySlug(slug);
  });

  const currentSlug = createMemo(() => params.slug || 'index');

  return (
    <div class="relative min-h-screen">
      <Suspense fallback={null}>
        <BackgroundMesh />
      </Suspense>
      <Header />

      <main
        id="main-content"
        class="relative z-10 mx-auto grid w-full max-w-7xl flex-grow grid-cols-1 gap-10 px-6 pt-28 pb-16 lg:grid-cols-[300px_1fr]"
      >
        {/* Sidebar */}
        <aside class="hidden lg:block sticky top-24 self-start">
          <GlassCard class="max-h-[calc(100vh-120px)] overflow-y-auto border border-indigo-500/20 bg-slate-950/70 p-6 backdrop-blur-xl">
            <div class="mb-4 px-2">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">OMG Docs</p>
              <h3 class="mt-1 text-lg font-bold text-white">Documentation</h3>
            </div>
            <nav class="flex flex-col gap-1">
              <For each={allDocs}>
                {(doc) => (
                  <a
                    href={`/docs/${doc.slug}`}
                    class={`rounded-r-lg border-l-2 px-3 py-2 text-sm transition-all duration-200 ${
                      currentSlug() === doc.slug
                        ? 'border-l-indigo-400 bg-indigo-500/20 font-medium text-indigo-300'
                        : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {doc.title}
                  </a>
                )}
              </For>
            </nav>
          </GlassCard>
        </aside>

        {/* Content */}
        <div class="min-w-0">
          <GlassCard class="prose prose-indigo max-w-none border border-indigo-500/20 bg-slate-950/70 p-8 prose-invert backdrop-blur-xl lg:p-12">
            {currentDoc() ? (
              <>
                <h1 class="mb-8 inline-block text-4xl font-black gradient-text">
                  {currentDoc()?.metadata.title}
                </h1>
                <div class="markdown-content">
                  <SolidMarkdown 
                    children={currentDoc()?.content} 
                    components={{
                      code: CodeBlock,
                      pre: (props) => <div class="relative group my-6">{props.children}</div>
                    }}
                  />
                </div>
              </>
            ) : (
              <div class="text-center py-20">
                <h1 class="text-2xl font-bold text-white mb-4">Document Not Found</h1>
                <p class="text-slate-400 mb-8">The requested documentation page could not be found.</p>
                <a href="/docs" class="btn-primary">Back to Docs</a>
              </div>
            )}
          </GlassCard>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default DocsPage;
