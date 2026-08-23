import { GitHubIcon, GoogleIcon } from '~/components/ui/BrandIcons';
import type { TelemetryDashboard } from '~/lib/contracts/telemetry-dashboard';
import {
  Award,
  Bug,
  ChartColumn,
  Code,
  Coffee,
  Crown,
  Flame,
  Gem,
  GitBranch,
  Heart,
  LayoutDashboard,
  Lightbulb,
  Mail,
  Minus,
  Monitor,
  Package,
  Rocket,
  Settings,
  Shield,
  Star,
  Swords,
  Target,
  Terminal,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-solid';
import type { Component } from 'solid-js';

/** A selectable section of the customer dashboard. */
export type DashboardTab =
  'overview' | 'analytics' | 'achievements' | 'machines' | 'settings' | 'admin';

/** A telemetry date range offered by the analytics controls. */
export type DashboardDateRange = '7d' | '14d' | '30d' | '90d';

/** An icon component rendered by the dashboard. */
type DashboardIcon = Component<{ readonly class?: string }>;

/** A dashboard tab and its presentation metadata. */
interface DashboardTabOption {
  readonly id: DashboardTab;
  readonly label: string;
  readonly icon: LucideIcon;
}

/** A supported telemetry export serialization. */
type TelemetryExportFormat = 'csv' | 'json';

/** Presentation metadata for a stat-card trend. */
interface TrendPresentation {
  readonly icon: LucideIcon;
  readonly color: string;
}

/** Serialized telemetry ready for the browser download boundary. */
interface TelemetryExport {
  readonly content: string;
  readonly filename: string;
  readonly mimeType: 'application/json' | 'text/csv';
}

type DailyUsage = TelemetryDashboard['daily'][number];
type Machine = TelemetryDashboard['machines'][number];
type Achievement = TelemetryDashboard['achievements'][number];

const BASE_TABS: ReadonlyArray<DashboardTabOption> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: ChartColumn },
  { id: 'achievements', label: 'Achievements', icon: Award },
  { id: 'machines', label: 'Machines', icon: Monitor },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const ADMIN_TAB: DashboardTabOption = { id: 'admin', label: 'Admin', icon: Shield };

/** Date range choices rendered by the analytics toolbar. */
export const DASHBOARD_DATE_RANGES: ReadonlyArray<{
  readonly label: DashboardDateRange;
  readonly value: DashboardDateRange;
}> = [
  { label: '7d', value: '7d' },
  { label: '14d', value: '14d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
];

const ACHIEVEMENT_ICON_RULES: ReadonlyArray<{
  readonly terms: ReadonlyArray<string>;
  readonly icon: LucideIcon;
}> = [
  { terms: ['FIRST', 'START'], icon: Rocket },
  { terms: ['SPEED', 'FAST'], icon: Zap },
  { terms: ['PACKAGE', 'INSTALL'], icon: Package },
  { terms: ['COMMAND', 'RUN'], icon: Terminal },
  { terms: ['SECURITY', 'SBOM'], icon: Shield },
  { terms: ['BUG', 'FIX'], icon: Bug },
  { terms: ['RUNTIME', 'SWITCH'], icon: Code },
  { terms: ['MASTER', 'EXPERT'], icon: Crown },
  { terms: ['STREAK', 'DAILY'], icon: Flame },
  { terms: ['STAR', 'TOP'], icon: Star },
  { terms: ['DIAMOND', 'ELITE'], icon: Gem },
  { terms: ['TROPHY', 'CHAMPION'], icon: Trophy },
  { terms: ['LOVE', 'HEART'], icon: Heart },
  { terms: ['COFFEE', 'CAFFEINE'], icon: Coffee },
  { terms: ['IDEA', 'INNOVATION'], icon: Lightbulb },
  { terms: ['BRANCH', 'GIT'], icon: GitBranch },
  { terms: ['BATTLE', 'FIGHT'], icon: Swords },
];

/** Format a dashboard timestamp with date and time. */
export function formatDashboardDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format a dashboard timestamp as an abbreviated month and day. */
export function formatDashboardShortDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Select the icon used for a connected account provider. */
export function getProviderIcon(provider: string): DashboardIcon {
  switch (provider) {
    case 'github':
      return GitHubIcon;
    case 'google':
      return GoogleIcon;
    case 'credential':
      return Mail;
    default:
      return Shield;
  }
}

/** Select the icon used for an achievement from its display name. */
export function getAchievementIcon(_emoji: string, name: string): LucideIcon {
  const normalizedName = name.toUpperCase();
  return (
    ACHIEVEMENT_ICON_RULES.find(rule => rule.terms.some(term => normalizedName.includes(term)))
      ?.icon ?? Target
  );
}

/** Derive the tabs visible to a dashboard role. */
export function getDashboardTabs(role: string | undefined): ReadonlyArray<DashboardTabOption> {
  return role === 'admin' ? [...BASE_TABS, ADMIN_TAB] : [...BASE_TABS];
}

/** Derive the trend icon and color for a stat card. */
export function getTrendPresentation(trend: number | undefined): TrendPresentation {
  if (!trend || trend === 0) {
    return { icon: Minus, color: 'text-slate-500' };
  }
  return trend > 0
    ? { icon: TrendingUp, color: 'text-emerald-400' }
    : { icon: TrendingDown, color: 'text-red-400' };
}

/** Format the absolute trend percentage displayed by a stat card. */
export function formatTrendPercentage(trend: number | undefined): string {
  return Math.abs(trend || 0).toFixed(1);
}

/** Format saved milliseconds in the dashboard's compact unit style. */
export function formatDashboardTimeSaved(milliseconds: number): string {
  const hours = milliseconds / 3_600_000;
  if (hours < 1) {
    return `${Math.round((milliseconds / 60_000) * 10) / 10}m`;
  }
  if (hours < 24) {
    return `${Math.round(hours * 10) / 10}h`;
  }
  return `${Math.round((hours / 24) * 10) / 10}d`;
}

/** Calculate the rounded average number of commands across daily usage rows. */
export function getAverageCommandsPerDay(daily: ReadonlyArray<DailyUsage>): number {
  if (daily.length === 0) {
    return 0;
  }
  return Math.round(daily.reduce((sum, day) => sum + day.commands_run, 0) / daily.length);
}

/** Find the first highest-command day in a daily usage series. */
export function getPeakDay(daily: ReadonlyArray<DailyUsage>): DailyUsage | null {
  const [firstDay, ...remainingDays] = daily;
  if (firstDay === undefined) {
    return null;
  }
  return remainingDays.reduce(
    (highest, day) => (day.commands_run > highest.commands_run ? day : highest),
    firstDay
  );
}

/** Sum installed and searched package totals. */
export function getTotalPackages(usage: TelemetryDashboard['usage'] | undefined): number {
  return usage ? usage.total_packages_installed + usage.total_packages_searched : 0;
}

/** Count machines whose numeric active flag is truthy. */
export function countActiveMachines(machines: ReadonlyArray<Machine>): number {
  return machines.filter(machine => machine.is_active).length;
}

/** Count achievements marked as unlocked. */
export function countUnlockedAchievements(achievements: ReadonlyArray<Achievement>): number {
  return achievements.filter(achievement => achievement.unlocked).length;
}

function getBarHeight(value: number, values: ReadonlyArray<number>): number {
  return (value / Math.max(...values, 1)) * 100;
}

/** Calculate a command bar's percentage height against its series. */
export function getCommandBarHeight(day: DailyUsage, daily: ReadonlyArray<DailyUsage>): number {
  return getBarHeight(
    day.commands_run,
    daily.map(entry => entry.commands_run)
  );
}

/** Calculate a package bar's percentage height against its series. */
export function getPackageBarHeight(day: DailyUsage, daily: ReadonlyArray<DailyUsage>): number {
  return getBarHeight(
    day.packages_installed || 0,
    daily.map(entry => entry.packages_installed || 0)
  );
}

/** Return the final seven daily usage rows shown by the overview chart. */
export function getRecentDailyUsage(daily: ReadonlyArray<DailyUsage>): ReadonlyArray<DailyUsage> {
  return daily.slice(-7);
}

/** Derive the display name for a registered machine. */
export function getMachineDisplayName(machine: Machine): string {
  return machine.hostname || machine.machine_id.substring(0, 8);
}

/** Format a nullable OMG version for a machine card. */
export function formatMachineVersion(version: string | null): string {
  return `v${version || 'unknown'}`;
}

/** Format the abbreviated machine identifier shown in a machine card. */
export function formatMachineId(machineId: string): string {
  return `${machineId.substring(0, 12)}...`;
}

/** Derive the browser label shown for a session user agent. */
export function getSessionBrowser(userAgent: string | null): string {
  return userAgent?.split(' ')[0] || 'Unknown Browser';
}

/** Derive the location label shown for a session IP address. */
export function getSessionLocation(ipAddress: string | null): string {
  return ipAddress || 'Unknown location';
}

/** Serialize telemetry for a dated CSV or JSON browser download. */
export function createTelemetryExport(
  data: TelemetryDashboard,
  format: TelemetryExportFormat,
  exportedAt: Date
): TelemetryExport {
  const date = exportedAt.toISOString().split('T')[0];
  if (format === 'json') {
    return {
      content: JSON.stringify(data, null, 2),
      filename: `omg-telemetry-${date}.json`,
      mimeType: 'application/json',
    };
  }

  const rows = [
    ['Date', 'Commands', 'Packages Installed', 'Packages Searched', 'Time Saved (ms)'],
    ...data.daily.map(day => [
      day.date,
      day.commands_run,
      day.packages_installed || 0,
      day.packages_searched || 0,
      day.time_saved_ms,
    ]),
  ];
  return {
    content: rows.map(row => row.join(',')).join('\n'),
    filename: `omg-telemetry-${date}.csv`,
    mimeType: 'text/csv',
  };
}
