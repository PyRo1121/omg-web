// This module is the untrusted Worker JSON boundary; callers receive only Schema-decoded values.

import * as Schema from 'effect/Schema';
import { Effect } from 'effect';
import {
  LicensingDashboardSchema,
  type LicensingDashboard,
} from '../../../shared/licensing-dashboard';
import { parseTelemetryDashboard, type TelemetryDashboard } from './telemetry-dashboard';

/** Canonical licensing dashboard payload could not be decoded or projected. */
export class LicensingDashboardParseError extends Error {
  readonly _tag = 'LicensingDashboardParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

function projectTelemetryDashboard(source: LicensingDashboard) {
  return {
    user: {
      id: source.user.id,
      email: source.user.email,
      name: source.user.name ?? source.user.email,
      role: source.is_admin ? 'admin' : 'user',
    },
    license: source.license,
    usage: {
      total_commands: source.usage.total_commands,
      total_packages_installed: source.usage.total_packages_installed,
      total_packages_searched: source.usage.total_packages_searched,
      total_runtimes_switched: source.usage.total_runtimes_switched,
      total_sbom_generated: source.usage.total_sbom_generated,
      total_vulnerabilities_found: source.usage.total_vulnerabilities_found,
      total_time_saved_ms: source.usage.total_time_saved_ms,
    },
    daily: source.usage.daily.map(row => ({
      date: row.date,
      commands_run: row.commands_run,
      packages_installed: 0,
      packages_searched: 0,
      time_saved_ms: row.time_saved_ms,
    })),
    machines: source.machines.map(machine => ({
      id: machine.id,
      machine_id: machine.machine_id,
      hostname: machine.hostname,
      os: machine.os,
      arch: machine.arch,
      omg_version: machine.omg_version,
      is_active: machine.is_active,
      last_seen_at: machine.last_seen_at,
    })),
    achievements: source.achievements.map(achievement => ({
      id: achievement.id,
      achievement_id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      icon: achievement.emoji,
      category: 'usage',
      points: 0,
      progress: achievement.unlocked ? 100 : 0,
      unlocked: achievement.unlocked,
      unlocked_at: achievement.unlocked_at,
    })),
    global_stats: source.global_stats,
  };
}

/** Decode the canonical Worker response and project it into the dashboard view contract. */
export function parseLicensingDashboard(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<TelemetryDashboard, LicensingDashboardParseError> {
  return Schema.decodeUnknown(LicensingDashboardSchema)(value).pipe(
    Effect.mapError(
      cause => new LicensingDashboardParseError('Licensing dashboard has an invalid shape', cause)
    ),
    Effect.flatMap(source =>
      parseTelemetryDashboard(projectTelemetryDashboard(source)).pipe(
        Effect.mapError(
          cause =>
            new LicensingDashboardParseError(
              'Licensing dashboard projection has an invalid shape',
              cause
            )
        )
      )
    )
  );
}
