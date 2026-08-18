import { type Component, For, Show, createSignal, createMemo } from 'solid-js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  BarChart3,
  LineChart,
  PieChart,
  Table2,
  Grid3X3,
  Plus,
  Trash2,
  GripVertical,
  Save,
  Filter,
  Download,
  Check,
  X,
  Layers,
  FileText,
} from 'lucide-solid';
import { useAdminAdvancedMetrics } from '../../../lib/api-hooks';
import { valueForKey } from '../../../lib/lookup';
import type { AdminAdvancedMetrics } from '../../../lib/api';
import { CardSkeleton } from '../../ui/Skeleton';
import { BarChart, DonutChart, Sparkline } from '../../../design-system/components/Charts';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type VisualizationType = 'bar' | 'line' | 'pie' | 'table' | 'heatmap' | 'kpi';
type MetricCategory = 'engagement' | 'revenue' | 'users' | 'features' | 'health';
type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'none';

const SCHEDULE_FREQUENCIES = {
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  none: 'none',
} as const satisfies Record<ScheduleFrequency, ScheduleFrequency>;

const FILTER_OPERATORS = {
  equals: 'equals',
  contains: 'contains',
  greater: 'greater',
  less: 'less',
} as const;

interface Metric {
  id: string;
  name: string;
  category: MetricCategory;
  dataKey: string;
  format: 'number' | 'currency' | 'percent';
}

interface Dimension {
  id: string;
  name: string;
  dataKey: string;
}

interface ReportFilter {
  dimension: string;
  operator: 'equals' | 'contains' | 'greater' | 'less';
  value: string;
}

interface ReportConfig {
  id: string;
  name: string;
  description: string;
  visualization: VisualizationType;
  metrics: string[];
  dimensions: string[];
  filters: ReportFilter[];
  schedule: ScheduleFrequency;
  recipients: string[];
}

const AVAILABLE_METRICS: Metric[] = [
  {
    id: 'dau',
    name: 'Daily Active Users',
    category: 'engagement',
    dataKey: 'engagement.dau',
    format: 'number',
  },
  {
    id: 'wau',
    name: 'Weekly Active Users',
    category: 'engagement',
    dataKey: 'engagement.wau',
    format: 'number',
  },
  {
    id: 'mau',
    name: 'Monthly Active Users',
    category: 'engagement',
    dataKey: 'engagement.mau',
    format: 'number',
  },
  {
    id: 'mrr',
    name: 'Monthly Recurring Revenue',
    category: 'revenue',
    dataKey: 'revenue_metrics.current_mrr',
    format: 'currency',
  },
  {
    id: 'arr',
    name: 'Annual Recurring Revenue',
    category: 'revenue',
    dataKey: 'revenue_metrics.projected_arr',
    format: 'currency',
  },
  {
    id: 'expansion_mrr',
    name: 'Expansion MRR',
    category: 'revenue',
    dataKey: 'revenue_metrics.expansion_mrr_12m',
    format: 'currency',
  },
  {
    id: 'churn_risk',
    name: 'Churn Risk Users',
    category: 'health',
    dataKey: 'churn_risk_segments',
    format: 'number',
  },
  {
    id: 'activation_rate',
    name: 'Week 1 Activation Rate',
    category: 'users',
    dataKey: 'time_to_value.pct_activated_week1',
    format: 'percent',
  },
  {
    id: 'install_adopters',
    name: 'Install Feature Adopters',
    category: 'features',
    dataKey: 'feature_adoption.install_adopters',
    format: 'number',
  },
  {
    id: 'search_adopters',
    name: 'Search Feature Adopters',
    category: 'features',
    dataKey: 'feature_adoption.search_adopters',
    format: 'number',
  },
  {
    id: 'runtime_adopters',
    name: 'Runtime Feature Adopters',
    category: 'features',
    dataKey: 'feature_adoption.runtime_adopters',
    format: 'number',
  },
];

const AVAILABLE_DIMENSIONS: Dimension[] = [
  { id: 'tier', name: 'Subscription Tier', dataKey: 'tier' },
  { id: 'lifecycle', name: 'Lifecycle Stage', dataKey: 'lifecycle_stage' },
  { id: 'platform', name: 'Platform', dataKey: 'platform' },
  { id: 'country', name: 'Country', dataKey: 'country' },
  { id: 'week', name: 'Week', dataKey: 'week' },
  { id: 'month', name: 'Month', dataKey: 'month' },
];

const VISUALIZATION_OPTIONS: { type: VisualizationType; icon: typeof BarChart3; label: string }[] =
  [
    { type: 'bar', icon: BarChart3, label: 'Bar Chart' },
    { type: 'line', icon: LineChart, label: 'Line Chart' },
    { type: 'pie', icon: PieChart, label: 'Pie Chart' },
    { type: 'table', icon: Table2, label: 'Data Table' },
    { type: 'heatmap', icon: Grid3X3, label: 'Heatmap' },
    { type: 'kpi', icon: Layers, label: 'KPI Cards' },
  ];

const CATEGORY_COLORS = {
  engagement: '#6366f1',
  revenue: '#10b981',
  users: '#8b5cf6',
  features: '#f59e0b',
  health: '#ef4444',
} satisfies Record<MetricCategory, string>;

const MetricChip: Component<{
  metric: Metric;
  selected: boolean;
  onToggle: () => void;
}> = props => {
  return (
    <button
      onClick={props.onToggle}
      class={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-all',
        props.selected
          ? 'border-white/20 bg-white/10 text-white'
          : 'bg-void-850 text-nebula-400 border-white/5 hover:border-white/10 hover:text-white'
      )}
    >
      <div
        class="h-2 w-2 rounded-full"
        style={{ 'background-color': CATEGORY_COLORS[props.metric.category] }}
      />
      {props.metric.name}
      <Show when={props.selected}>
        <Check size={12} class="text-aurora-400" />
      </Show>
    </button>
  );
};

const DimensionChip: Component<{
  dimension: Dimension;
  selected: boolean;
  onToggle: () => void;
}> = props => {
  return (
    <button
      onClick={props.onToggle}
      class={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-all',
        props.selected
          ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400'
          : 'bg-void-850 text-nebula-400 border-white/5 hover:border-white/10 hover:text-white'
      )}
    >
      <Grid3X3 size={12} />
      {props.dimension.name}
      <Show when={props.selected}>
        <Check size={12} class="text-aurora-400" />
      </Show>
    </button>
  );
};

const FilterRow: Component<{
  filter: ReportFilter;
  dimensions: Dimension[];
  onUpdate: (filter: ReportFilter) => void;
  onRemove: () => void;
}> = props => {
  return (
    <div class="bg-void-850 flex items-center gap-2 rounded-lg border border-white/5 p-2">
      <GripVertical size={14} class="text-nebula-600 cursor-grab" />

      <select
        value={props.filter.dimension}
        onChange={e => props.onUpdate({ ...props.filter, dimension: e.currentTarget.value })}
        class="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white"
      >
        <For each={props.dimensions}>{dim => <option value={dim.id}>{dim.name}</option>}</For>
      </select>

      <select
        value={props.filter.operator}
        onChange={e =>
          props.onUpdate({
            ...props.filter,
            operator:
              valueForKey(Object.entries(FILTER_OPERATORS), e.currentTarget.value) ?? 'equals',
          })
        }
        class="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white"
      >
        <option value="equals">equals</option>
        <option value="contains">contains</option>
        <option value="greater">greater than</option>
        <option value="less">less than</option>
      </select>

      <input
        type="text"
        value={props.filter.value}
        onInput={e => props.onUpdate({ ...props.filter, value: e.currentTarget.value })}
        placeholder="Value..."
        class="placeholder-nebula-500 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white"
      />

      <button
        onClick={props.onRemove}
        class="text-nebula-500 hover:bg-flare-500/10 hover:text-flare-400 rounded-lg p-1.5 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
};

type ReportDataValue =
  string | number | boolean | null | ReportDataValue[] | { [key: string]: ReportDataValue };
type ReportData = AdminAdvancedMetrics & Record<string, ReportDataValue>;

function formatReportValue(value: number, format: 'number' | 'currency' | 'percent') {
  if (format === 'currency') {
    return `$${value.toLocaleString()}`;
  }
  if (format === 'percent') {
    return `${value.toFixed(1)}%`;
  }
  return value.toLocaleString();
}

const ReportPreview: Component<{
  config: ReportConfig;
  data: ReportData | undefined;
}> = props => {
  const selectedMetrics = createMemo(() =>
    AVAILABLE_METRICS.filter(m => props.config.metrics.includes(m.id))
  );

  const chartData = createMemo(() => {
    if (!props.data) {
      return [];
    }
    const metrics = selectedMetrics();
    return metrics.map(metric => ({
      label: metric.name,
      value: Number(getNestedValue(props.data, metric.dataKey)) || 0,
      color: CATEGORY_COLORS[metric.category],
    }));
  });

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="text-nebula-400 text-sm font-black tracking-widest uppercase">Preview</h4>
        <span class="text-2xs text-nebula-500">Live data</span>
      </div>

      <Show
        when={props.config.metrics.length > 0}
        fallback={
          <div class="bg-void-900 flex h-48 items-center justify-center rounded-xl border border-dashed border-white/10">
            <p class="text-nebula-500 text-sm">Select metrics to see preview</p>
          </div>
        }
      >
        <Show when={props.config.visualization === 'bar'}>
          <div class="bg-void-850 rounded-xl border border-white/5 p-4">
            <BarChart data={chartData()} height={200} showLabels showValues />
          </div>
        </Show>

        <Show when={props.config.visualization === 'pie'}>
          <div class="bg-void-850 flex justify-center rounded-xl border border-white/5 p-4">
            <DonutChart
              data={chartData()}
              size={200}
              thickness={40}
              centerLabel="Total"
              showLegend
            />
          </div>
        </Show>

        <Show when={props.config.visualization === 'kpi'}>
          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <For each={selectedMetrics()}>
              {metric => {
                const value = Number(getNestedValue(props.data, metric.dataKey)) || 0;
                return (
                  <div class="bg-void-850 rounded-xl border border-white/5 p-4">
                    <p class="text-2xs text-nebula-500 font-bold tracking-widest uppercase">
                      {metric.name}
                    </p>
                    <p
                      class="font-display mt-1 text-2xl font-black"
                      style={{ color: CATEGORY_COLORS[metric.category] }}
                    >
                      {formatReportValue(value, metric.format)}
                    </p>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>

        <Show when={props.config.visualization === 'table'}>
          <div class="bg-void-850 overflow-hidden rounded-xl border border-white/5">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-void-800 border-b border-white/5">
                  <th class="text-nebula-500 px-4 py-2 text-left text-xs font-bold tracking-widest uppercase">
                    Metric
                  </th>
                  <th class="text-nebula-500 px-4 py-2 text-right text-xs font-bold tracking-widest uppercase">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                <For each={selectedMetrics()}>
                  {metric => {
                    const value = Number(getNestedValue(props.data, metric.dataKey)) || 0;
                    return (
                      <tr class="border-b border-white/5">
                        <td class="px-4 py-3 text-white">{metric.name}</td>
                        <td class="px-4 py-3 text-right font-mono font-bold text-white">
                          {formatReportValue(value, metric.format)}
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </Show>

        <Show when={props.config.visualization === 'line'}>
          <div class="bg-void-850 rounded-xl border border-white/5 p-4">
            <div class="flex h-48 items-center justify-center">
              <div class="space-y-4">
                <For each={selectedMetrics()}>
                  {metric => (
                    <div class="flex items-center gap-4">
                      <span class="text-nebula-400 w-32 text-xs">{metric.name}</span>
                      <Sparkline
                        data={generateSparklineData(8)}
                        width={200}
                        height={32}
                        color={CATEGORY_COLORS[metric.category]}
                        showArea
                      />
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Show>

        <Show when={props.config.visualization === 'heatmap'}>
          <div class="bg-void-850 flex h-48 items-center justify-center rounded-xl border border-white/5">
            <div class="text-center">
              <Grid3X3 size={32} class="text-nebula-600 mx-auto mb-2" />
              <p class="text-nebula-500 text-sm">Heatmap requires time dimension</p>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
};

function isReportObject(value: ReportDataValue | undefined): value is ReportData {
  return value instanceof Object && !Array.isArray(value);
}

function getNestedValue(obj: ReportData | undefined, path: string): ReportDataValue | undefined {
  if (!obj) {
    return undefined;
  }
  let current: ReportDataValue | undefined = obj;
  for (const key of path.split('.')) {
    if (!isReportObject(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function generateSparklineData(points: number): number[] {
  let value = 50;
  return Array.from({ length: points }, () => {
    value = Math.max(10, Math.min(90, value + (value * 0.1 - value * 0.05)));
    return value;
  });
}

const SavedReportCard: Component<{
  report: ReportConfig;
  onLoad: () => void;
  onDelete: () => void;
}> = props => {
  const vizOption = () =>
    VISUALIZATION_OPTIONS.find(v => v.type === props.report.visualization) ||
    VISUALIZATION_OPTIONS[0];
  const IconComponent = vizOption().icon;

  return (
    <div class="group bg-void-850 flex items-center gap-4 rounded-xl border border-white/5 p-4 transition-all hover:border-white/10">
      <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10">
        <IconComponent size={18} class="text-indigo-400" />
      </div>

      <div class="min-w-0 flex-1">
        <h4 class="truncate font-bold text-white">{props.report.name}</h4>
        <p class="text-2xs text-nebula-500">
          {props.report.metrics.length} metrics · {vizOption().label}
        </p>
      </div>

      <div class="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={props.onLoad}
          class="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-600"
        >
          Load
        </button>
        <button
          onClick={props.onDelete}
          class="text-nebula-400 hover:bg-flare-500/10 hover:text-flare-400 rounded-lg border border-white/10 p-1.5 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

function createMetricBucket(): Metric[] {
  return [];
}

export const CustomReportBuilder: Component = () => {
  const [reportName, setReportName] = createSignal('Untitled Report');
  const [reportDescription, setReportDescription] = createSignal('');
  const [selectedViz, setSelectedViz] = createSignal<VisualizationType>('bar');
  const [selectedMetrics, setSelectedMetrics] = createSignal<string[]>([]);
  const [selectedDimensions, setSelectedDimensions] = createSignal<string[]>([]);
  const [filters, setFilters] = createSignal<ReportFilter[]>([]);
  const [schedule, setSchedule] = createSignal<ScheduleFrequency>('none');
  const [recipients, setRecipients] = createSignal('');
  const [savedReports, setSavedReports] = createSignal<ReportConfig[]>([]);
  const [showSaveModal, setShowSaveModal] = createSignal(false);

  const metricsQuery = useAdminAdvancedMetrics();

  const currentConfig = createMemo((): ReportConfig => ({
    id: `report-${Date.now()}`,
    name: reportName(),
    description: reportDescription(),
    visualization: selectedViz(),
    metrics: selectedMetrics(),
    dimensions: selectedDimensions(),
    filters: filters(),
    schedule: schedule(),
    recipients: recipients()
      .split(',')
      .map(r => r.trim())
      .filter(Boolean),
  }));

  const toggleMetric = (metricId: string) => {
    setSelectedMetrics(prev =>
      prev.includes(metricId) ? prev.filter(id => id !== metricId) : [...prev, metricId]
    );
  };

  const toggleDimension = (dimId: string) => {
    setSelectedDimensions(prev =>
      prev.includes(dimId) ? prev.filter(id => id !== dimId) : [...prev, dimId]
    );
  };

  const addFilter = () => {
    setFilters(prev => [
      ...prev,
      { dimension: AVAILABLE_DIMENSIONS[0].id, operator: 'equals', value: '' },
    ]);
  };

  const updateFilter = (index: number, filter: ReportFilter) => {
    setFilters(prev => prev.map((f, i) => (i === index ? filter : f)));
  };

  const removeFilter = (index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  };

  const saveReport = () => {
    setSavedReports(prev => [...prev, currentConfig()]);
    setShowSaveModal(false);
  };

  const loadReport = (report: ReportConfig) => {
    setReportName(report.name);
    setReportDescription(report.description);
    setSelectedViz(report.visualization);
    setSelectedMetrics(report.metrics);
    setSelectedDimensions(report.dimensions);
    setFilters(report.filters);
    setSchedule(report.schedule);
    setRecipients(report.recipients.join(', '));
  };

  const deleteReport = (reportId: string) => {
    setSavedReports(prev => prev.filter(r => r.id !== reportId));
  };

  const exportReport = () => {
    const config = currentConfig();
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const metricsByCategory = createMemo(() => {
    const grouped = {
      engagement: createMetricBucket(),
      revenue: createMetricBucket(),
      users: createMetricBucket(),
      features: createMetricBucket(),
      health: createMetricBucket(),
    } satisfies Record<MetricCategory, Metric[]>;
    for (const metric of AVAILABLE_METRICS) {
      grouped[metric.category].push(metric);
    }
    return grouped;
  });

  return (
    <div class="space-y-8">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 class="flex items-center gap-3 text-2xl font-black tracking-tight text-white">
            <div class="rounded-xl bg-indigo-500/10 p-2">
              <FileText size={24} class="text-indigo-400" />
            </div>
            Custom Report Builder
          </h2>
          <p class="text-nebula-500 mt-2 text-sm">
            Build custom reports with drag-and-drop metrics and visualizations
          </p>
        </div>

        <div class="flex items-center gap-3">
          <button
            onClick={exportReport}
            disabled={selectedMetrics().length === 0}
            class="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} />
            Export
          </button>

          <button
            onClick={() => setShowSaveModal(true)}
            disabled={selectedMetrics().length === 0}
            class="flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={16} />
            Save Report
          </button>
        </div>
      </div>

      <div class="grid gap-8 lg:grid-cols-3">
        <div class="space-y-6 lg:col-span-2">
          <div class="bg-void-850 rounded-2xl border border-white/5 p-6">
            <h3 class="mb-4 text-sm font-black tracking-widest text-white uppercase">
              Report Details
            </h3>
            <div class="space-y-4">
              <div>
                <label class="text-nebula-400 mb-1 block text-xs font-bold">Report Name</label>
                <input
                  type="text"
                  value={reportName()}
                  onInput={e => setReportName(e.currentTarget.value)}
                  class="placeholder-nebula-500 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                />
              </div>
              <div>
                <label class="text-nebula-400 mb-1 block text-xs font-bold">Description</label>
                <textarea
                  value={reportDescription()}
                  onInput={e => setReportDescription(e.currentTarget.value)}
                  placeholder="What does this report show?"
                  rows={2}
                  class="placeholder-nebula-500 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div class="bg-void-850 rounded-2xl border border-white/5 p-6">
            <h3 class="mb-4 text-sm font-black tracking-widest text-white uppercase">
              Visualization Type
            </h3>
            <div class="grid grid-cols-3 gap-3 md:grid-cols-6">
              <For each={VISUALIZATION_OPTIONS}>
                {option => (
                  <button
                    onClick={() => setSelectedViz(option.type)}
                    class={cn(
                      'flex flex-col items-center gap-2 rounded-xl border p-4 transition-all',
                      selectedViz() === option.type
                        ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400'
                        : 'bg-void-800 text-nebula-400 border-white/5 hover:border-white/10 hover:text-white'
                    )}
                  >
                    <option.icon size={24} />
                    <span class="text-2xs font-bold">{option.label}</span>
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="bg-void-850 rounded-2xl border border-white/5 p-6">
            <h3 class="mb-4 text-sm font-black tracking-widest text-white uppercase">
              Select Metrics
            </h3>
            <div class="space-y-4">
              <For each={Object.entries(metricsByCategory())}>
                {([category, metrics]) => (
                  <Show when={metrics.length > 0}>
                    <div>
                      <p
                        class="text-2xs mb-2 font-bold tracking-widest uppercase"
                        style={{
                          color:
                            valueForKey(Object.entries(CATEGORY_COLORS), category) ??
                            CATEGORY_COLORS.engagement,
                        }}
                      >
                        {category}
                      </p>
                      <div class="flex flex-wrap gap-2">
                        <For each={metrics}>
                          {metric => (
                            <MetricChip
                              metric={metric}
                              selected={selectedMetrics().includes(metric.id)}
                              onToggle={() => toggleMetric(metric.id)}
                            />
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                )}
              </For>
            </div>
          </div>

          <div class="bg-void-850 rounded-2xl border border-white/5 p-6">
            <h3 class="mb-4 text-sm font-black tracking-widest text-white uppercase">
              Group By (Dimensions)
            </h3>
            <div class="flex flex-wrap gap-2">
              <For each={AVAILABLE_DIMENSIONS}>
                {dim => (
                  <DimensionChip
                    dimension={dim}
                    selected={selectedDimensions().includes(dim.id)}
                    onToggle={() => toggleDimension(dim.id)}
                  />
                )}
              </For>
            </div>
          </div>

          <div class="bg-void-850 rounded-2xl border border-white/5 p-6">
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-sm font-black tracking-widest text-white uppercase">Filters</h3>
              <button
                onClick={addFilter}
                class="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-white/10"
              >
                <Plus size={14} />
                Add Filter
              </button>
            </div>

            <Show
              when={filters().length > 0}
              fallback={
                <div class="bg-void-900 rounded-xl border border-dashed border-white/10 p-6 text-center">
                  <Filter size={24} class="text-nebula-600 mx-auto mb-2" />
                  <p class="text-nebula-500 text-sm">No filters applied</p>
                </div>
              }
            >
              <div class="space-y-2">
                <For each={filters()}>
                  {(filter, i) => (
                    <FilterRow
                      filter={filter}
                      dimensions={AVAILABLE_DIMENSIONS}
                      onUpdate={f => updateFilter(i(), f)}
                      onRemove={() => removeFilter(i())}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>

          <div class="bg-void-850 rounded-2xl border border-white/5 p-6">
            <h3 class="mb-4 text-sm font-black tracking-widest text-white uppercase">
              Schedule Delivery
            </h3>
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label class="text-nebula-400 mb-1 block text-xs font-bold">Frequency</label>
                <select
                  value={schedule()}
                  onChange={e => {
                    setSchedule(
                      valueForKey(Object.entries(SCHEDULE_FREQUENCIES), e.currentTarget.value) ??
                        'none'
                    );
                  }}
                  class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white focus:outline-none"
                >
                  <option value="none">Don't schedule</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label class="text-nebula-400 mb-1 block text-xs font-bold">Recipients</label>
                <input
                  type="text"
                  value={recipients()}
                  onInput={e => setRecipients(e.currentTarget.value)}
                  placeholder="email@example.com, team@example.com"
                  disabled={schedule() === 'none'}
                  class="placeholder-nebula-500 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <Show when={metricsQuery.isLoading}>
            <CardSkeleton />
          </Show>

          <Show when={metricsQuery.isSuccess}>
            <div class="bg-void-850 rounded-2xl border border-white/5 p-6">
              <ReportPreview
                config={currentConfig()}
                // SAFETY: useAdminAdvancedMetrics parses the API response as AdminAdvancedMetrics.
                data={metricsQuery.data as ReportData}
              />
            </div>
          </Show>

          <div class="bg-void-850 rounded-2xl border border-white/5 p-6">
            <h3 class="mb-4 text-sm font-black tracking-widest text-white uppercase">
              Saved Reports
            </h3>
            <Show
              when={savedReports().length > 0}
              fallback={
                <div class="bg-void-900 rounded-xl border border-dashed border-white/10 p-6 text-center">
                  <Save size={24} class="text-nebula-600 mx-auto mb-2" />
                  <p class="text-nebula-500 text-sm">No saved reports yet</p>
                </div>
              }
            >
              <div class="space-y-3">
                <For each={savedReports()}>
                  {report => (
                    <SavedReportCard
                      report={report}
                      onLoad={() => loadReport(report)}
                      onDelete={() => deleteReport(report.id)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>

      <Show when={showSaveModal()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div class="bg-void-900 w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl">
            <h3 class="mb-4 text-lg font-black text-white">Save Report</h3>
            <p class="text-nebula-400 mb-6 text-sm">
              Save "{reportName()}" with {selectedMetrics().length} metrics?
            </p>
            <div class="flex justify-end gap-3">
              <button
                onClick={() => setShowSaveModal(false)}
                class="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={saveReport}
                class="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-indigo-600"
              >
                Save Report
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default CustomReportBuilder;
