import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Data, Effect, Schema } from 'effect';

interface AuditTarget {
  readonly directory: string;
  readonly label: string;
}

interface AuditFailureDetails {
  readonly cause: unknown | undefined;
  readonly label: string;
  readonly output: string;
  readonly provider: 'npm' | 'osv';
  readonly retryable: boolean;
}

interface LockedPackage {
  readonly name: string;
  readonly version: string;
}

interface OsvFinding extends LockedPackage {
  readonly advisoryId: string;
}

class AuditFailed extends Data.TaggedError('AuditFailed')<AuditFailureDetails> {}

const PackageLockSchema = Schema.Struct({
  packages: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({ version: Schema.optional(Schema.String) }),
  }),
});
const OsvBatchResponseSchema = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      vulns: Schema.optional(
        Schema.Array(
          Schema.Struct({
            id: Schema.String,
            modified: Schema.optional(Schema.String),
          })
        )
      ),
    })
  ),
});

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10_000;
const MAX_LOCKFILE_CHARS = 8 * 1024 * 1024;
const OSV_BATCH_SIZE = 200;
const OSV_MAX_RESPONSE_CHARS = 4 * 1024 * 1024;
const OSV_QUERY_URL = 'https://api.osv.dev/v1/querybatch';
const TRANSIENT_AUDIT_FAILURE =
  /(?:429 Too Many Requests|503 Service Unavailable|EAI_AGAIN|ECONNRESET|ETIMEDOUT|audit endpoint returned an error|network timeout)/iu;
const VULNERABILITY_AUDIT_FAILURE =
  /(?:# npm audit report|found \d+ vulnerabilit|\d+ (?:low|moderate|high|critical) severity vulnerabilit)/iu;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const auditTargets: ReadonlyArray<AuditTarget> = [
  { label: 'root', directory: fileURLToPath(new URL('../', import.meta.url)) },
  { label: 'site', directory: fileURLToPath(new URL('../site/', import.meta.url)) },
  { label: 'workers/api', directory: fileURLToPath(new URL('../workers/api/', import.meta.url)) },
];

function auditFailure(
  target: AuditTarget,
  provider: AuditFailureDetails['provider'],
  details: Pick<AuditFailureDetails, 'cause' | 'output' | 'retryable'>
): AuditFailed {
  return new AuditFailed({
    ...details,
    label: target.label,
    provider,
  });
}

function writeProcessOutput(stdout: string, stderr: string): void {
  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);
}

function runAuditAttempt(target: AuditTarget): Effect.Effect<void, AuditFailed> {
  return Effect.try({
    try: () =>
      spawnSync(npmCommand, ['audit'], {
        cwd: target.directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          NPM_CONFIG_FETCH_TIMEOUT: '60000',
        },
        maxBuffer: 4 * 1024 * 1024,
      }),
    catch: cause =>
      auditFailure(target, 'npm', {
        cause,
        output: '',
        retryable: false,
      }),
  }).pipe(
    Effect.flatMap(result => {
      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';
      const output = `${stdout}\n${stderr}`;
      writeProcessOutput(stdout, stderr);

      if (result.error !== undefined) {
        return Effect.fail(
          auditFailure(target, 'npm', {
            cause: result.error,
            output,
            retryable: false,
          })
        );
      }
      if (result.status === 0) return Effect.void;
      return Effect.fail(
        auditFailure(target, 'npm', {
          cause: undefined,
          output,
          retryable:
            TRANSIENT_AUDIT_FAILURE.test(output) && !VULNERABILITY_AUDIT_FAILURE.test(output),
        })
      );
    })
  );
}

function auditTargetAttempt(
  target: AuditTarget,
  attempt: number
): Effect.Effect<void, AuditFailed> {
  return runAuditAttempt(target).pipe(
    Effect.catchAll(failure => {
      if (!failure.retryable || attempt >= MAX_ATTEMPTS) return Effect.fail(failure);
      return Effect.sync(() => {
        process.stderr.write(
          `[npm-audit] ${target.label}: registry unavailable; retrying ${attempt + 1}/${MAX_ATTEMPTS}\n`
        );
      }).pipe(
        Effect.flatMap(() => Effect.sleep(RETRY_DELAY_MS * attempt)),
        Effect.flatMap(() => auditTargetAttempt(target, attempt + 1))
      );
    })
  );
}

function packageNameFromLockPath(path: string): string | undefined {
  const marker = 'node_modules/';
  const markerIndex = path.lastIndexOf(marker);
  if (markerIndex < 0) return undefined;
  const name = path.slice(markerIndex + marker.length);
  return name.length > 0 ? name : undefined;
}

function loadLockedPackages(
  target: AuditTarget
): Effect.Effect<ReadonlyArray<LockedPackage>, AuditFailed> {
  return Effect.tryPromise({
    try: async () => {
      const contents = await readFile(join(target.directory, 'package-lock.json'), 'utf8');
      if (contents.length > MAX_LOCKFILE_CHARS) throw new Error('package-lock.json is too large');
      const parsed: unknown = JSON.parse(contents);
      return parsed;
    },
    catch: cause =>
      auditFailure(target, 'osv', {
        cause,
        output: 'Unable to read package-lock.json',
        retryable: false,
      }),
  }).pipe(
    Effect.flatMap(value =>
      Schema.decodeUnknown(PackageLockSchema)(value).pipe(
        Effect.mapError(cause =>
          auditFailure(target, 'osv', {
            cause,
            output: 'Invalid package-lock.json',
            retryable: false,
          })
        )
      )
    ),
    Effect.flatMap(lock => {
      const packages = new Map<string, LockedPackage>();
      for (const [path, entry] of Object.entries(lock.packages)) {
        if (entry.version === undefined) continue;
        const name = packageNameFromLockPath(path);
        if (name === undefined) continue;
        const lockedPackage = { name, version: entry.version };
        packages.set(`${name}@${entry.version}`, lockedPackage);
      }
      if (packages.size === 0) {
        return Effect.fail(
          auditFailure(target, 'osv', {
            cause: undefined,
            output: 'package-lock.json contains no auditable package versions',
            retryable: false,
          })
        );
      }
      return Effect.succeed([...packages.values()]);
    })
  );
}

function queryOsvBatch(
  target: AuditTarget,
  packages: ReadonlyArray<LockedPackage>
): Effect.Effect<ReadonlyArray<OsvFinding>, AuditFailed> {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(OSV_QUERY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: packages.map(({ name, version }) => ({
            package: { ecosystem: 'npm', name },
            version,
          })),
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`OSV query failed with HTTP ${response.status}`);
      const responseText = await response.text();
      if (responseText.length > OSV_MAX_RESPONSE_CHARS) {
        throw new Error('OSV response is too large');
      }
      const parsed: unknown = JSON.parse(responseText);
      return parsed;
    },
    catch: cause =>
      auditFailure(target, 'osv', {
        cause,
        output: 'OSV query unavailable',
        retryable: false,
      }),
  }).pipe(
    Effect.flatMap(value =>
      Schema.decodeUnknown(OsvBatchResponseSchema)(value).pipe(
        Effect.mapError(cause =>
          auditFailure(target, 'osv', {
            cause,
            output: 'OSV returned an invalid response',
            retryable: false,
          })
        )
      )
    ),
    Effect.flatMap(response => {
      if (response.results.length !== packages.length) {
        return Effect.fail(
          auditFailure(target, 'osv', {
            cause: undefined,
            output: `OSV returned ${response.results.length} results for ${packages.length} queries`,
            retryable: false,
          })
        );
      }
      const findings: Array<OsvFinding> = [];
      for (const [index, result] of response.results.entries()) {
        const lockedPackage = packages[index];
        if (lockedPackage === undefined) {
          return Effect.fail(
            auditFailure(target, 'osv', {
              cause: undefined,
              output: `OSV result ${index} has no matching package query`,
              retryable: false,
            })
          );
        }
        for (const vulnerability of result.vulns ?? []) {
          findings.push({
            name: lockedPackage.name,
            version: lockedPackage.version,
            advisoryId: vulnerability.id,
          });
        }
      }
      return Effect.succeed(findings);
    })
  );
}

function runOsvAudit(target: AuditTarget): Effect.Effect<void, AuditFailed> {
  return Effect.gen(function* () {
    const packages = yield* loadLockedPackages(target);
    const findings: Array<OsvFinding> = [];
    for (let index = 0; index < packages.length; index += OSV_BATCH_SIZE) {
      findings.push(
        ...(yield* queryOsvBatch(target, packages.slice(index, index + OSV_BATCH_SIZE)))
      );
    }
    if (findings.length > 0) {
      const output = findings
        .map(finding => `${finding.name}@${finding.version}: ${finding.advisoryId}`)
        .join('\n');
      process.stderr.write(`[osv-audit] ${target.label}: vulnerabilities found\n${output}\n`);
      return yield* Effect.fail(
        auditFailure(target, 'osv', {
          cause: undefined,
          output,
          retryable: false,
        })
      );
    }
    process.stdout.write(
      `[osv-audit] ${target.label}: ${packages.length} locked package versions passed\n`
    );
  });
}

function auditTarget(target: AuditTarget): Effect.Effect<void, AuditFailed> {
  return auditTargetAttempt(target, 1).pipe(
    Effect.tap(() =>
      Effect.sync(() => process.stdout.write(`[npm-audit] ${target.label}: passed\n`))
    ),
    Effect.catchAll(failure => {
      if (!failure.retryable) return Effect.fail(failure);
      return Effect.sync(() => {
        process.stderr.write(
          `[npm-audit] ${target.label}: registry unavailable after ${MAX_ATTEMPTS} attempts; using OSV\n`
        );
      }).pipe(Effect.flatMap(() => runOsvAudit(target)));
    })
  );
}

const program = Effect.forEach(auditTargets, target => auditTarget(target), {
  concurrency: 1,
  discard: true,
}).pipe(
  Effect.catchAll(error =>
    Effect.sync(() => {
      const reason = error.retryable ? 'unavailable' : 'audit rejected';
      process.stderr.write(`[dependency-audit] ${error.label}: ${error.provider} ${reason}\n`);
      process.exitCode = 1;
    })
  )
);

await Effect.runPromise(program);
