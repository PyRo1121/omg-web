import { type Component, For, Show, createMemo, createSignal } from 'solid-js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  HelpCircle,
  DollarSign,
  CheckCircle,
  Clock,
  User,
  Tag,
  X,
  Plus,
  ChevronRight,
} from 'lucide-solid';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type NoteType = 'general' | 'call' | 'email' | 'meeting' | 'support' | 'sales' | 'success';
export type TaskType = 'followup' | 'onboarding' | 'renewal' | 'upsell' | 'support';
export type CommunicationType = 'email' | 'chat' | 'phone' | 'meeting' | 'support_ticket';

interface Note {
  id: string;
  type: NoteType;
  content: string;
  createdAt: string;
  createdBy?: string;
}

interface Task {
  id: string;
  type: TaskType;
  title: string;
  dueDate: string;
  completed: boolean;
  priority?: 'low' | 'medium' | 'high';
}

interface Communication {
  id: string;
  type: CommunicationType;
  subject?: string;
  summary: string;
  date: string;
  direction: 'inbound' | 'outbound';
}

interface CRMTag {
  id: string;
  name: string;
  color: string;
}

type NoteTypeConfig = {
  [K in NoteType]: {
    icon: typeof MessageSquare;
    color: string;
    bg: string;
    label: string;
  };
};

const noteTypeConfig: NoteTypeConfig = {
  general: { icon: MessageSquare, color: 'text-nebula-400', bg: 'bg-nebula-500/10', label: 'Note' },
  call: { icon: Phone, color: 'text-plasma-400', bg: 'bg-plasma-500/10', label: 'Call' },
  email: { icon: Mail, color: 'text-indigo-400', bg: 'bg-indigo-500/10', label: 'Email' },
  meeting: { icon: Calendar, color: 'text-photon-400', bg: 'bg-photon-500/10', label: 'Meeting' },
  support: { icon: HelpCircle, color: 'text-solar-400', bg: 'bg-solar-500/10', label: 'Support' },
  sales: { icon: DollarSign, color: 'text-aurora-400', bg: 'bg-aurora-500/10', label: 'Sales' },
  success: {
    icon: CheckCircle,
    color: 'text-electric-400',
    bg: 'bg-electric-500/10',
    label: 'Success',
  },
};

type TaskTypeConfig = {
  [K in TaskType]: {
    icon: typeof Clock;
    color: string;
    bg: string;
    label: string;
  };
};

const taskTypeConfig: TaskTypeConfig = {
  followup: { icon: Phone, color: 'text-plasma-400', bg: 'bg-plasma-500/10', label: 'Follow-up' },
  onboarding: { icon: User, color: 'text-photon-400', bg: 'bg-photon-500/10', label: 'Onboarding' },
  renewal: { icon: Calendar, color: 'text-solar-400', bg: 'bg-solar-500/10', label: 'Renewal' },
  upsell: { icon: DollarSign, color: 'text-aurora-400', bg: 'bg-aurora-500/10', label: 'Upsell' },
  support: { icon: HelpCircle, color: 'text-flare-400', bg: 'bg-flare-500/10', label: 'Support' },
};

type CommTypeConfig = {
  [K in CommunicationType]: {
    icon: typeof Mail;
    color: string;
    label: string;
  };
};

const commTypeConfig: CommTypeConfig = {
  email: { icon: Mail, color: 'text-indigo-400', label: 'Email' },
  chat: { icon: MessageSquare, color: 'text-electric-400', label: 'Chat' },
  phone: { icon: Phone, color: 'text-aurora-400', label: 'Phone' },
  meeting: { icon: Calendar, color: 'text-photon-400', label: 'Meeting' },
  support_ticket: { icon: HelpCircle, color: 'text-solar-400', label: 'Ticket' },
};

interface NoteCardProps {
  note: Note;
  onDelete?: (id: string) => void;
  class?: string;
}

export const NoteCard: Component<NoteCardProps> = props => {
  const config = createMemo(() => noteTypeConfig[props.note.type]);
  const IconComponent = config().icon;

  return (
    <div
      class={cn(
        'bg-void-850 rounded-xl border border-white/5 p-4 transition-all hover:border-white/10',
        props.class
      )}
    >
      <div class="flex items-start gap-3">
        <div class={cn('shrink-0 rounded-lg p-2', config().bg)}>
          <IconComponent size={14} class={config().color} />
        </div>
        <div class="min-w-0 flex-1">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class={cn('text-xs font-bold tracking-wider uppercase', config().color)}>
              {config().label}
            </span>
            <div class="flex items-center gap-2">
              <span class="text-2xs text-nebula-600">{props.note.createdAt}</span>
              <Show when={props.onDelete}>
                <button
                  onClick={() => props.onDelete?.(props.note.id)}
                  class="text-nebula-600 hover:text-flare-400 hover:bg-flare-500/10 rounded p-1 transition-colors"
                >
                  <X size={12} />
                </button>
              </Show>
            </div>
          </div>
          <p class="text-nebula-300 text-sm leading-relaxed">{props.note.content}</p>
          <Show when={props.note.createdBy}>
            <p class="text-2xs text-nebula-600 mt-2">by {props.note.createdBy}</p>
          </Show>
        </div>
      </div>
    </div>
  );
};

interface NotesListProps {
  notes: Note[];
  onAddNote?: (content: string, type: NoteType) => void;
  onDeleteNote?: (id: string) => void;
  class?: string;
}

export const NotesList: Component<NotesListProps> = props => {
  const [showAdd, setShowAdd] = createSignal(false);
  const [newNoteContent, setNewNoteContent] = createSignal('');
  const [newNoteType, setNewNoteType] = createSignal<NoteType>('general');

  const handleAdd = () => {
    if (newNoteContent().trim() && props.onAddNote) {
      props.onAddNote(newNoteContent(), newNoteType());
      setNewNoteContent('');
      setShowAdd(false);
    }
  };

  return (
    <div class={cn('space-y-4', props.class)}>
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-bold tracking-wider text-white uppercase">Notes</h4>
        <button
          onClick={() => setShowAdd(!showAdd())}
          class="flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-xs font-bold text-indigo-400 transition-colors hover:bg-indigo-500/20"
        >
          <Plus size={12} />
          Add Note
        </button>
      </div>

      <Show when={showAdd()}>
        <div class="space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
          <div class="flex gap-2">
            <For each={Object.entries(noteTypeConfig)}>
              {([type, config]) => {
                const IconComponent = config.icon;
                return (
                  <button
                    type="button"
                    onClick={() =>
                      // SAFETY: The entry key comes from noteTypeConfig's own NoteType keys.
                      setNewNoteType(type as NoteType)
                    }
                    class={cn(
                      'rounded-lg p-2 transition-colors',
                      newNoteType() === type
                        ? cn(config.bg, config.color)
                        : 'text-nebula-500 hover:bg-white/5'
                    )}
                    title={config.label}
                  >
                    <IconComponent size={14} />
                  </button>
                );
              }}
            </For>
          </div>
          <textarea
            value={newNoteContent()}
            onInput={e => setNewNoteContent(e.currentTarget.value)}
            placeholder="Write your note..."
            class="bg-void-900 placeholder-nebula-600 h-20 w-full resize-none rounded-lg border border-white/10 px-3 py-2 text-sm text-white focus:border-indigo-500/50 focus:outline-none"
          />
          <div class="flex justify-end gap-2">
            <button
              onClick={() => setShowAdd(false)}
              class="text-nebula-400 px-3 py-1.5 text-xs font-bold transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              class="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500"
            >
              Save Note
            </button>
          </div>
        </div>
      </Show>

      <div class="space-y-2">
        <For each={props.notes}>
          {note => <NoteCard note={note} onDelete={props.onDeleteNote} />}
        </For>
        <Show when={props.notes.length === 0}>
          <p class="text-nebula-600 py-8 text-center text-sm">No notes yet</p>
        </Show>
      </div>
    </div>
  );
};

interface TagBadgeProps {
  tag: CRMTag;
  onRemove?: () => void;
  class?: string;
}

export const TagBadge: Component<TagBadgeProps> = props => {
  return (
    <div
      class={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-colors',
        props.class
      )}
      style={{
        'background-color': `${props.tag.color}20`,
        color: props.tag.color,
        border: `1px solid ${props.tag.color}40`,
      }}
    >
      <Tag size={10} />
      <span>{props.tag.name}</span>
      <Show when={props.onRemove}>
        <button
          onClick={props.onRemove}
          class="ml-0.5 rounded p-0.5 transition-colors hover:bg-white/20"
        >
          <X size={10} />
        </button>
      </Show>
    </div>
  );
};

interface TagsManagerProps {
  assignedTags: CRMTag[];
  availableTags: CRMTag[];
  onAssign?: (tagId: string) => void;
  onRemove?: (tagId: string) => void;
  onCreate?: (name: string, color: string) => void;
  class?: string;
}

const presetColors = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
];

export const TagsManager: Component<TagsManagerProps> = props => {
  const [showAdd, setShowAdd] = createSignal(false);
  const [newTagName, setNewTagName] = createSignal('');
  const [newTagColor, setNewTagColor] = createSignal(presetColors[0]);

  const unassignedTags = createMemo(() =>
    props.availableTags.filter(t => !props.assignedTags.some(at => at.id === t.id))
  );

  const handleCreate = () => {
    if (newTagName().trim() && props.onCreate) {
      props.onCreate(newTagName(), newTagColor());
      setNewTagName('');
      setShowAdd(false);
    }
  };

  return (
    <div class={cn('space-y-4', props.class)}>
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-bold tracking-wider text-white uppercase">Tags</h4>
        <button
          onClick={() => setShowAdd(!showAdd())}
          class="text-photon-400 bg-photon-500/10 hover:bg-photon-500/20 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
        >
          <Plus size={12} />
          New Tag
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <For each={props.assignedTags}>
          {tag => <TagBadge tag={tag} onRemove={() => props.onRemove?.(tag.id)} />}
        </For>
        <Show when={props.assignedTags.length === 0}>
          <p class="text-nebula-600 text-sm">No tags assigned</p>
        </Show>
      </div>

      <Show when={unassignedTags().length > 0}>
        <div class="border-t border-white/5 pt-2">
          <p class="text-nebula-600 mb-2 text-xs">Available tags:</p>
          <div class="flex flex-wrap gap-2">
            <For each={unassignedTags()}>
              {tag => (
                <button
                  onClick={() => props.onAssign?.(tag.id)}
                  class="inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs font-bold transition-all hover:scale-105"
                  style={{
                    'border-color': `${tag.color}40`,
                    color: tag.color,
                  }}
                >
                  <Plus size={10} />
                  {tag.name}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={showAdd()}>
        <div class="border-photon-500/30 bg-photon-500/5 space-y-3 rounded-xl border p-4">
          <input
            type="text"
            value={newTagName()}
            onInput={e => setNewTagName(e.currentTarget.value)}
            placeholder="Tag name"
            class="bg-void-900 placeholder-nebula-600 focus:border-photon-500/50 w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-white focus:outline-none"
          />
          <div class="flex flex-wrap gap-2">
            <For each={presetColors}>
              {color => (
                <button
                  onClick={() => setNewTagColor(color)}
                  class={cn(
                    'h-6 w-6 rounded-full transition-transform hover:scale-110',
                    newTagColor() === color &&
                      'ring-offset-void-900 ring-2 ring-white ring-offset-2'
                  )}
                  style={{ 'background-color': color }}
                />
              )}
            </For>
          </div>
          <div class="flex justify-end gap-2">
            <button
              onClick={() => setShowAdd(false)}
              class="text-nebula-400 px-3 py-1.5 text-xs font-bold transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              class="bg-photon-600 hover:bg-photon-500 rounded-lg px-4 py-1.5 text-xs font-bold text-white transition-colors"
            >
              Create Tag
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
};

interface TaskCardProps {
  task: Task;
  onToggle?: (id: string) => void;
  class?: string;
}

export const TaskCard: Component<TaskCardProps> = props => {
  const config = createMemo(() => taskTypeConfig[props.task.type]);
  const IconComponent = config().icon;

  const priorityColors = {
    low: 'text-nebula-500',
    medium: 'text-solar-400',
    high: 'text-flare-400',
  };

  return (
    <div
      class={cn(
        'bg-void-850 rounded-xl border p-4 transition-all',
        props.task.completed
          ? 'border-aurora-500/20 bg-aurora-500/5'
          : 'border-white/5 hover:border-white/10',
        props.class
      )}
    >
      <div class="flex items-start gap-3">
        <button
          onClick={() => props.onToggle?.(props.task.id)}
          class={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            props.task.completed
              ? 'bg-aurora-500 border-aurora-500 text-white'
              : 'border-nebula-600 hover:border-aurora-500'
          )}
        >
          <Show when={props.task.completed}>
            <CheckCircle size={12} />
          </Show>
        </button>
        <div class="min-w-0 flex-1">
          <p
            class={cn(
              'text-sm font-medium',
              props.task.completed ? 'text-nebula-500 line-through' : 'text-white'
            )}
          >
            {props.task.title}
          </p>
          <div class="mt-2 flex items-center gap-3">
            <div class={cn('flex items-center gap-1', config().color)}>
              <IconComponent size={12} />
              <span class="text-2xs font-bold uppercase">{config().label}</span>
            </div>
            <span class="text-2xs text-nebula-600 flex items-center gap-1">
              <Clock size={10} />
              {props.task.dueDate}
            </span>
            <Show when={props.task.priority}>
              <span
                class={cn('text-2xs font-bold uppercase', priorityColors[props.task.priority!])}
              >
                {props.task.priority}
              </span>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};

interface CommunicationTimelineProps {
  communications: Communication[];
  class?: string;
}

export const CommunicationTimeline: Component<CommunicationTimelineProps> = props => {
  return (
    <div class={cn('space-y-4', props.class)}>
      <h4 class="text-sm font-bold tracking-wider text-white uppercase">Communication History</h4>
      <div class="space-y-3">
        <For each={props.communications}>
          {(comm, index) => {
            const config = commTypeConfig[comm.type];
            const IconComponent = config.icon;

            return (
              <div class="flex gap-3">
                <div class="relative flex flex-col items-center">
                  <div
                    class={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full',
                      comm.direction === 'inbound' ? 'bg-indigo-500/10' : 'bg-aurora-500/10'
                    )}
                  >
                    <IconComponent size={14} class={config.color} />
                  </div>
                  <Show when={index() < props.communications.length - 1}>
                    <div class="bg-void-700 my-1 w-px flex-1" />
                  </Show>
                </div>
                <div class="flex-1 pb-4">
                  <div class="mb-1 flex items-center gap-2">
                    <span class="text-sm font-bold text-white">{config.label}</span>
                    <span
                      class={cn(
                        'text-2xs rounded px-1.5 py-0.5 font-bold uppercase',
                        comm.direction === 'inbound'
                          ? 'bg-indigo-500/10 text-indigo-400'
                          : 'bg-aurora-500/10 text-aurora-400'
                      )}
                    >
                      {comm.direction}
                    </span>
                    <span class="text-2xs text-nebula-600">{comm.date}</span>
                  </div>
                  <Show when={comm.subject}>
                    <p class="text-nebula-300 text-sm font-medium">{comm.subject}</p>
                  </Show>
                  <p class="text-nebula-500 text-sm">{comm.summary}</p>
                </div>
              </div>
            );
          }}
        </For>
        <Show when={props.communications.length === 0}>
          <p class="text-nebula-600 py-8 text-center text-sm">No communication history</p>
        </Show>
      </div>
    </div>
  );
};

interface CustomerCardProps {
  name: string;
  email: string;
  company?: string;
  tier: string;
  healthScore: number;
  stage: string;
  tags?: CRMTag[];
  lastActive?: string;
  onClick?: () => void;
  class?: string;
}

export const CustomerCard: Component<CustomerCardProps> = props => {
  const tierColors = {
    enterprise: 'text-solar-400 bg-solar-500/10 border-solar-500/25',
    team: 'text-electric-400 bg-electric-500/10 border-electric-500/25',
    pro: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
    free: 'text-nebula-400 bg-nebula-500/10 border-nebula-500/25',
  } as const;

  type TierKey = keyof typeof tierColors;

  const getTierColor = (tier: string) =>
    // SAFETY: The `in` guard confirms the tier is a configured key.
    tier in tierColors ? tierColors[tier as TierKey] : tierColors.free;

  const healthColor = () => {
    if (props.healthScore >= 80) {return 'text-aurora-400';}
    if (props.healthScore >= 60) {return 'text-electric-400';}
    if (props.healthScore >= 40) {return 'text-solar-400';}
    return 'text-flare-400';
  };

  return (
    <button
      onClick={props.onClick}
      class={cn(
        'bg-void-850 w-full rounded-2xl border border-white/5 p-5 text-left transition-all',
        'hover:bg-void-800 hover:border-white/10 hover:shadow-lg',
        'group',
        props.class
      )}
    >
      <div class="mb-3 flex items-start justify-between">
        <div class="flex items-center gap-3">
          <div class="to-photon-600 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 text-sm font-black text-white">
            {props.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p class="text-sm font-bold text-white">{props.name}</p>
            <p class="text-nebula-500 text-xs">{props.email}</p>
          </div>
        </div>
        <ChevronRight
          size={16}
          class="text-nebula-600 transition-all group-hover:translate-x-1 group-hover:text-white"
        />
      </div>

      <div class="mb-3 flex items-center gap-2">
        <span
          class={cn(
            'text-2xs rounded-full border px-2 py-0.5 font-black uppercase',
            getTierColor(props.tier.toLowerCase())
          )}
        >
          {props.tier}
        </span>
        <span class={cn('text-sm font-bold tabular-nums', healthColor())}>{props.healthScore}</span>
      </div>

      <Show when={props.tags && props.tags.length > 0}>
        <div class="mb-3 flex flex-wrap gap-1.5">
          <For each={props.tags!.slice(0, 3)}>
            {tag => (
              <span
                class="text-2xs rounded-full px-2 py-0.5 font-medium"
                style={{
                  'background-color': `${tag.color}15`,
                  color: tag.color,
                }}
              >
                {tag.name}
              </span>
            )}
          </For>
          <Show when={props.tags!.length > 3}>
            <span class="text-2xs bg-void-700 text-nebula-500 rounded-full px-2 py-0.5 font-medium">
              +{props.tags!.length - 3}
            </span>
          </Show>
        </div>
      </Show>

      <Show when={props.lastActive}>
        <p class="text-2xs text-nebula-600">Last active {props.lastActive}</p>
      </Show>
    </button>
  );
};

export default {
  NoteCard,
  NotesList,
  TagBadge,
  TagsManager,
  TaskCard,
  CommunicationTimeline,
  CustomerCard,
};
