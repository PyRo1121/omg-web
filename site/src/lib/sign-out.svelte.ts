import { Data, Effect, Schema } from 'effect';
import { authClient } from './auth-client';

const SignOutAcknowledgement = Schema.Struct({
  data: Schema.Struct({ success: Schema.Literal(true) }),
  error: Schema.Null,
});

interface SignOutResponse {
  readonly data: { readonly success: boolean } | null;
  readonly error: { readonly message?: string | undefined } | null;
}

class SignOutUnavailable extends Data.TaggedError('SignOutUnavailable')<{
  readonly cause: unknown;
}> {}

/** Keep failed sign-out attempts visible until the user can retry. */
export class SignOutView {
  #status = $state<'idle' | 'pending' | 'failed'>('idle');

  constructor(
    private readonly request: () => Promise<SignOutResponse> = () => authClient.signOut(),
    private readonly navigate: (path: string) => void = path => window.location.assign(path)
  ) {}

  get pending(): boolean {
    return this.#status === 'pending';
  }

  get error(): string {
    return this.#status === 'failed' ? 'Could not sign out. Please try again.' : '';
  }

  signOut(): Promise<void> {
    if (this.pending) return Promise.resolve();
    this.#status = 'pending';
    return Effect.runPromise(
      Effect.tryPromise({
        try: this.request,
        catch: cause => new SignOutUnavailable({ cause }),
      }).pipe(
        Effect.flatMap(result =>
          Schema.decodeUnknownEffect(SignOutAcknowledgement)(result).pipe(
            Effect.mapError(cause => new SignOutUnavailable({ cause }))
          )
        ),
        Effect.match({
          onFailure: () => {
            this.#status = 'failed';
          },
          onSuccess: () => this.navigate('/'),
        })
      )
    );
  }
}
