import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Data, Effect } from 'effect';

interface AuditTarget {
  readonly directory: string;
  readonly label: string;
}

interface AuditFailureDetails {
  readonly cause: unknown | undefined;
  readonly label: string;
  readonly output: string;
  readonly retryable: boolean;
}

class AuditFailed extends Data.TaggedError('AuditFailed')<AuditFailureDetails> {}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10_000;
const TRANSIENT_AUDIT_FAILURE =
  /(?:429 Too Many Requests|503 Service Unavailable|EAI_AGAIN|ECONNRESET|ETIMEDOUT|audit endpoint returned an error|network timeout)/iu;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const auditTargets: ReadonlyArray<AuditTarget> = [
  { label: 'root', directory: fileURLToPath(new URL('../', import.meta.url)) },
  { label: 'site', directory: fileURLToPath(new URL('../site/', import.meta.url)) },
  { label: 'workers/api', directory: fileURLToPath(new URL('../workers/api/', import.meta.url)) },
];

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
    catch: cause => new AuditFailed({ cause, label: target.label, output: '', retryable: false }),
  }).pipe(
    Effect.flatMap(result => {
      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';
      const output = `${stdout}\n${stderr}`;
      writeProcessOutput(stdout, stderr);

      if (result.error !== undefined) {
        return Effect.fail(
          new AuditFailed({
            cause: result.error,
            label: target.label,
            output,
            retryable: false,
          })
        );
      }
      if (result.status === 0) return Effect.void;
      return Effect.fail(
        new AuditFailed({
          cause: undefined,
          label: target.label,
          output,
          retryable: TRANSIENT_AUDIT_FAILURE.test(output),
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

function auditTarget(target: AuditTarget): Effect.Effect<void, AuditFailed> {
  return auditTargetAttempt(target, 1).pipe(
    Effect.tap(() =>
      Effect.sync(() => process.stdout.write(`[npm-audit] ${target.label}: passed\n`))
    )
  );
}

const program = Effect.forEach(auditTargets, target => auditTarget(target), {
  concurrency: 1,
  discard: true,
}).pipe(
  Effect.catchAll(error =>
    Effect.sync(() => {
      const reason = error.retryable
        ? `registry unavailable after ${MAX_ATTEMPTS} attempts`
        : 'audit rejected';
      process.stderr.write(`[npm-audit] ${error.label}: ${reason}\n`);
      process.exitCode = 1;
    })
  )
);

await Effect.runPromise(program);
