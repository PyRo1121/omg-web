import type { Component } from 'solid-js';
import { For } from 'solid-js';

const PRIMARY_RUNTIMES = ['Node.js', 'Python', 'Go', 'Rust', 'Ruby', 'Java', 'Bun'] as const;
const EXTENDED_RUNTIMES = [
  'Zig',
  'Deno',
  'PHP',
  '.NET',
  'Lua',
  'Swift',
  'Elixir',
  'Erlang',
  'Scala',
  'Kotlin',
  'Clojure',
  'Haskell',
] as const;

const RuntimeEcosystem: Component = () => (
  <section
    id="runtimes"
    class="overflow-hidden border-y border-[var(--rule)] py-28 sm:py-36"
    aria-labelledby="runtime-title"
  >
    <div class="manifest-shell grid gap-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
      <header>
        <h2
          id="runtime-title"
          class="text-5xl leading-[0.94] font-medium tracking-[-0.055em] sm:text-7xl"
        >
          The repository chooses the runtime.
        </h2>
        <p class="mt-7 max-w-xl text-lg leading-relaxed text-[var(--ink-muted)]">
          Walk into a project and activate its declared toolchain. Mise extends the same workflow to
          more than one hundred runtimes.
        </p>
      </header>

      <article class="self-end">
        <ul class="m-0 flex list-none flex-wrap gap-x-7 gap-y-4 p-0" aria-label="Native runtimes">
          <For each={PRIMARY_RUNTIMES}>
            {runtime => (
              <li class="text-3xl font-medium tracking-[-0.04em] text-[var(--ink)] sm:text-5xl">
                {runtime}
              </li>
            )}
          </For>
        </ul>
        <p class="mt-10 max-w-2xl font-mono text-xs leading-7 text-[var(--ink-muted)]">
          <For each={EXTENDED_RUNTIMES}>
            {(runtime, index) => (
              <>
                <span>{runtime}</span>
                {index() < EXTENDED_RUNTIMES.length - 1 ? (
                  <span aria-hidden="true"> · </span>
                ) : null}
              </>
            )}
          </For>
        </p>
      </article>
    </div>

    <pre class="manifest-shell mt-20 overflow-x-auto rounded-[1.75rem] border border-white/[0.1] bg-[#0b0f0c] p-7 text-sm leading-8 shadow-[0_2rem_7rem_rgba(0,0,0,0.25)] sm:p-10">
      <code>
        <span class="text-[var(--signal)]">[runtimes]</span>
        {'\n'}node = <span class="text-[#cbd2cc]">&quot;22&quot;</span>
        {'\n'}python = <span class="text-[#cbd2cc]">&quot;3.13&quot;</span>
        {'\n'}rust = <span class="text-[#cbd2cc]">&quot;stable&quot;</span>
        {'\n\n'}
        <span class="text-[var(--signal)]">[policy]</span>
        {'\n'}lock = <span class="text-[#cbd2cc]">true</span>{' '}
        <span class="text-[#667067]"># committed with the project</span>
      </code>
    </pre>
  </section>
);

export default RuntimeEcosystem;
