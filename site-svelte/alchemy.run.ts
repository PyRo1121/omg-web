import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as RemovalPolicy from 'alchemy/RemovalPolicy';
import * as Effect from 'effect/Effect';

export const ShadowAuthSecret = Alchemy.Random('ShadowAuthSecret');

/** Existing production database; Alchemy binds it but does not own migrations. */
export const PlatformDatabase = Cloudflare.D1.Database('PlatformDatabase', {
  name: 'omg-platform',
}).pipe(RemovalPolicy.retain());

export const Website = Cloudflare.Website.SvelteKit(
  'Website',
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const authSecret = yield* ShadowAuthSecret;

    return {
      adapter: {
        fallback: 'plaintext' as const,
        notFoundHandling: '404-page' as const,
      },
      assets: {
        runWorkerFirst: true,
      },
      env: {
        BETTER_AUTH_SECRET: authSecret.text,
        DB: PlatformDatabase,
        DEPLOYMENT_STAGE: stage,
      },
      memo: {
        include: [
          'src/**',
          'static/**',
          'alchemy.run.ts',
          'package-lock.json',
          'package.json',
          'tsconfig.json',
          'vite.config.ts',
        ],
      },
      observability: {
        enabled: true,
        logs: {
          enabled: true,
          headSamplingRate: 1,
          invocationLogs: true,
          persist: true,
        },
        traces: {
          enabled: true,
          headSamplingRate: 0.01,
          persist: true,
        },
      },
      workersDev: true,
    };
  })
);

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;

export default Alchemy.Stack(
  'OmgSvelteSite',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const site = yield* Website;
    return { url: site.url };
  })
);
