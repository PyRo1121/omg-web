import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';

export const ShadowAuthSecret = Alchemy.Random('ShadowAuthSecret');

const PLATFORM_DATABASE_ID = 'fee8ddab-fb4a-4be4-b8d2-8abb7c2db188';

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
        AUTH_RATE_LIMITER: Cloudflare.RateLimit('AUTH_RATE_LIMITER', {
          namespaceId: 2001,
          simple: { limit: 10, period: 60 },
        }),
        ADMIN_LIVE_RATE_LIMITER: Cloudflare.RateLimit('ADMIN_LIVE_RATE_LIMITER', {
          namespaceId: 2002,
          simple: { limit: 30, period: 60 },
        }),
        BETTER_AUTH_SECRET: authSecret.text,
        DEPLOYMENT_STAGE: stage,
        GITHUB_CLIENT_ID: Config.string('GITHUB_CLIENT_ID'),
        GITHUB_CLIENT_SECRET: Config.redacted('GITHUB_CLIENT_SECRET'),
        SVELTE_BFF_SECRET: Config.redacted('SVELTE_BFF_SECRET'),
      },
      memo: {
        include: [
          'src/**',
          'static/**',
          '../site/shared/**',
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
      workersDev: stage !== 'prod',
    };
  })
);

interface LicensingApiBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website> & {
  readonly DB: Cloudflare.GetBindingType<Cloudflare.D1.Database>;
  readonly LICENSING_API: LicensingApiBinding;
};

export default Alchemy.Stack(
  'OmgSvelteSite',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const site = yield* Website;
    yield* site.bind('DB', {
      bindings: [
        {
          type: 'd1',
          name: 'DB',
          databaseId: PLATFORM_DATABASE_ID,
        },
      ],
    });
    yield* site.bind('LICENSING_API', {
      bindings: [
        {
          type: 'service',
          name: 'LICENSING_API',
          service: 'omg-saas',
        },
      ],
    });
    return { url: site.url };
  })
);
