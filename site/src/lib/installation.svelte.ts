import { Data, Effect } from 'effect';
import { SITE_ORIGIN } from '../../../shared/public-site';

const COPY_MESSAGES = {
  idle: '',
  copying: 'Copying install command…',
  copied: 'Install command copied.',
  failed: 'Could not copy. Select and copy the install command above.',
} as const;

class ClipboardUnavailable extends Data.TaggedError('ClipboardUnavailable')<{
  readonly cause: unknown;
}> {}

/** Own the supported installer command and its clipboard outcome. */
export class InstallationView {
  readonly command = `curl -fsSL ${SITE_ORIGIN}/install.sh -o omg-install.sh\nless omg-install.sh && bash omg-install.sh`;
  #state = $state<keyof typeof COPY_MESSAGES>('idle');

  get pending(): boolean {
    return this.#state === 'copying';
  }

  get message(): string {
    return COPY_MESSAGES[this.#state];
  }

  copy(): void {
    if (this.pending) return;
    this.#state = 'copying';
    Effect.runFork(
      Effect.tryPromise({
        try: () => navigator.clipboard.writeText(this.command),
        catch: cause => new ClipboardUnavailable({ cause }),
      }).pipe(
        Effect.match({
          onFailure: () => {
            this.#state = 'failed';
          },
          onSuccess: () => {
            this.#state = 'copied';
          },
        })
      )
    );
  }
}
