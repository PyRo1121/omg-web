import type { Component } from 'solid-js';
import { For } from 'solid-js';

const RUNTIME_GROUPS = [
  {
    index: 'A',
    label: 'Native',
    values: ['Node.js', 'Python', 'Go', 'Rust', 'Ruby', 'Java', 'Bun'],
  },
  { index: 'B', label: 'Systems', values: ['Zig', 'Deno', 'PHP', '.NET', 'Lua', 'Swift'] },
  {
    index: 'C',
    label: 'Extended',
    values: ['Elixir', 'Erlang', 'Scala', 'Kotlin', 'Clojure', 'Haskell'],
  },
] as const;

const RuntimeEcosystem: Component = () => (
  <section id="runtimes" class="manifest-shell manifest-section" aria-labelledby="runtime-title">
    <header class="grid border-b border-[var(--ink)] lg:grid-cols-[1fr_2fr]">
      <div class="border-b border-[var(--rule)] p-6 sm:p-10 lg:border-r lg:border-b-0">
        <span class="manifest-index">02 / RUNTIMES</span>
      </div>
      <div class="p-6 sm:p-10">
        <h2 id="runtime-title" class="text-4xl font-black tracking-[-0.05em] uppercase sm:text-6xl">
          The runtime catalog follows the repository.
        </h2>
        <p class="mt-5 max-w-2xl text-[var(--ink-muted)]">
          Native managers cover the common toolchains. Mise extends the same workflow across more
          than one hundred runtimes.
        </p>
      </div>
    </header>

    <div class="grid lg:grid-cols-[3fr_2fr]">
      <dl class="m-0 border-b border-[var(--ink)] lg:border-r lg:border-b-0">
        <For each={RUNTIME_GROUPS}>
          {group => (
            <div class="grid grid-cols-[4rem_8rem_1fr] border-b border-[var(--rule)] last:border-b-0">
              <dt class="grid place-items-center border-r border-[var(--rule)] font-mono text-sm text-[var(--signal)]">
                {group.index}
              </dt>
              <dd class="manifest-label m-0 flex items-center border-r border-[var(--rule)] px-4 text-[var(--ink-muted)]">
                {group.label}
              </dd>
              <dd class="m-0 grid grid-cols-2 sm:grid-cols-3">
                <For each={group.values}>
                  {runtime => (
                    <span class="border-r border-b border-[var(--rule)] px-4 py-5 font-mono text-xs last:border-r-0">
                      {runtime}
                    </span>
                  )}
                </For>
              </dd>
            </div>
          )}
        </For>
      </dl>

      <aside
        class="bg-[var(--ink)] p-6 text-[var(--paper-raised)] sm:p-10"
        aria-label="Runtime command example"
      >
        <div class="manifest-label flex justify-between text-[#aaa59a]">
          <span>Project manifest</span>
          <span>omg.toml</span>
        </div>
        <pre class="mt-12 overflow-x-auto text-sm leading-8">
          <code>
            <span class="text-[#ff6a58]">[runtimes]</span>
            {'\n'}node = <span class="text-[#d6d2c8]">&quot;22&quot;</span>
            {'\n'}python = <span class="text-[#d6d2c8]">&quot;3.13&quot;</span>
            {'\n'}rust = <span class="text-[#d6d2c8]">&quot;stable&quot;</span>
            {'\n\n'}
            <span class="text-[#ff6a58]">[policy]</span>
            {'\n'}lock = <span class="text-[#d6d2c8]">true</span>
            {'\n'}auto_switch = <span class="text-[#d6d2c8]">true</span>
          </code>
        </pre>
        <p class="mt-12 border-t border-[#4a4945] pt-5 font-mono text-xs leading-relaxed text-[#aaa59a]">
          Enter the repository. OMG reads the manifest and activates the declared toolchain.
        </p>
      </aside>
    </div>
  </section>
);

export default RuntimeEcosystem;
