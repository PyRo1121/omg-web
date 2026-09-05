import { Data, Effect } from 'effect';
import { SITE_ORIGIN } from '../../../shared/public-site';

const installMethods = [
  {
    platform: 'Linux / macOS',
    command: `curl -fsSL ${SITE_ORIGIN}/install.sh -o omg-install.sh\nless omg-install.sh && bash omg-install.sh`,
  },
  { platform: 'Arch / AUR', command: 'yay -S omg-bin' },
  { platform: 'From source', command: 'cargo install omg --locked' },
] as const;

type InstallMethod = (typeof installMethods)[number];
type CopyState =
  | { readonly _tag: 'idle' }
  | {
      readonly _tag: 'copying' | 'copied' | 'failed';
      readonly platform: InstallMethod['platform'];
    };

class ClipboardUnavailable extends Data.TaggedError('ClipboardUnavailable')<{
  readonly cause: unknown;
}> {}

/** Own the installer commands and the outcome of a user-requested clipboard write. */
export class InstallationView {
  readonly methods = installMethods;
  #state = $state<CopyState>({ _tag: 'idle' });

  get pending(): boolean {
    return this.#state._tag === 'copying';
  }

  messageFor(method: InstallMethod): string {
    if (this.#state._tag === 'idle' || this.#state.platform !== method.platform) return '';
    switch (this.#state._tag) {
      case 'copying':
        return `Copying ${this.#state.platform} command…`;
      case 'copied':
        return `${this.#state.platform} command copied.`;
      case 'failed':
        return `Could not copy. Select and copy the ${this.#state.platform} command above.`;
    }
  }

  copy(method: InstallMethod): void {
    if (this.pending) return;
    this.#state = { _tag: 'copying', platform: method.platform };
    Effect.runFork(
      Effect.tryPromise({
        try: () => navigator.clipboard.writeText(method.command),
        catch: cause => new ClipboardUnavailable({ cause }),
      }).pipe(
        Effect.match({
          onFailure: () => {
            this.#state = { _tag: 'failed', platform: method.platform };
          },
          onSuccess: () => {
            this.#state = { _tag: 'copied', platform: method.platform };
          },
        })
      )
    );
  }
}
