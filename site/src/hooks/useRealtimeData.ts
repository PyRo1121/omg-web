import { reportClientError, reportClientWarning } from '~/lib/observability';
import { casesHandled } from '~/lib/prelude';
import { createSignal, onCleanup, type Accessor, type Setter } from 'solid-js';
import {
  parseTelemetryMessage,
  type CommandEvent,
  type SessionEvent,
  type HealthUpdate,
  type TelemetryMessage,
} from './telemetry-message';

export type { CommandEvent, SessionEvent, HealthUpdate, TelemetryMessage };

export interface RealtimeConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
  reconnectAttempt: number;
  lastConnectedAt?: string;
}

export interface RealtimeDataState {
  commands: CommandEvent[];
  activeSessions: Map<string, SessionEvent>;
  health: HealthUpdate | null;
}

export interface UseRealtimeDataOptions {
  wsUrl: string;
  maxCommands?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  onCommand?: (event: CommandEvent) => void;
  onSession?: (event: SessionEvent) => void;
  onHealth?: (update: HealthUpdate) => void;
  onError?: (error: Error) => void;
}

export interface UseRealtimeDataReturn {
  connectionState: Accessor<RealtimeConnectionState>;
  isConnected: Accessor<boolean>;
  commands: Accessor<CommandEvent[]>;
  activeSessions: Accessor<SessionEvent[]>;
  activeSessionsMap: Accessor<Map<string, SessionEvent>>;
  health: Accessor<HealthUpdate | null>;
  commandCount: Accessor<number>;
  activeSessionCount: Accessor<number>;
  sessionsByCountry: Accessor<Map<string, SessionEvent[]>>;
  connect: () => void;
  disconnect: () => void;
  clearCommands: () => void;
}

interface MessageHandlerDependencies {
  readonly maxCommands: number;
  readonly setCommands: Setter<CommandEvent[]>;
  readonly setActiveSessions: Setter<Map<string, SessionEvent>>;
  readonly setHealth: Setter<HealthUpdate | null>;
  readonly onCommand: ((event: CommandEvent) => void) | undefined;
  readonly onSession: ((event: SessionEvent) => void) | undefined;
  readonly onHealth: ((update: HealthUpdate) => void) | undefined;
}

interface ConnectionDependencies {
  readonly wsUrl: string;
  readonly autoReconnect: boolean;
  readonly maxReconnectAttempts: number;
  readonly connectionState: Accessor<RealtimeConnectionState>;
  readonly setConnectionState: Setter<RealtimeConnectionState>;
  readonly handleMessage: (message: TelemetryMessage) => void;
  readonly onError: ((error: Error) => void) | undefined;
}

interface ConnectionActions {
  readonly connect: () => void;
  readonly disconnect: () => void;
}

const DEFAULT_MAX_COMMANDS = 100;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1_000;
const MAX_RECONNECT_DELAY = 30_000;

function reconnectDelay(attempt: number): number {
  const delay = Math.min(BASE_RECONNECT_DELAY * 2 ** attempt, MAX_RECONNECT_DELAY);
  return delay + delay * Math.random() * 0.25;
}

function groupSessionsByCountry(
  activeSessions: ReadonlyMap<string, SessionEvent>
): Map<string, SessionEvent[]> {
  const sessions = new Map<string, SessionEvent[]>();
  for (const session of activeSessions.values()) {
    const countryCode = session.geo?.country_code ?? 'UNKNOWN';
    const countrySessions = sessions.get(countryCode) ?? [];
    countrySessions.push(session);
    sessions.set(countryCode, countrySessions);
  }
  return sessions;
}

function createMessageHandler(
  dependencies: MessageHandlerDependencies
): (message: TelemetryMessage) => void {
  return message => {
    switch (message.type) {
      case 'command_event':
        dependencies.setCommands(previous =>
          [message.data, ...previous].slice(0, dependencies.maxCommands)
        );
        dependencies.onCommand?.(message.data);
        return;
      case 'session_start':
        dependencies.setActiveSessions(previous => {
          const updated = new Map(previous);
          updated.set(message.data.session_id, { ...message.data, is_active: true });
          return updated;
        });
        dependencies.onSession?.(message.data);
        return;
      case 'session_end':
        dependencies.setActiveSessions(previous => {
          const updated = new Map(previous);
          updated.delete(message.data.session_id);
          return updated;
        });
        dependencies.onSession?.({ ...message.data, is_active: false });
        return;
      case 'health_update':
        dependencies.setHealth(message.data);
        dependencies.onHealth?.(message.data);
        return;
      default:
        return casesHandled(message);
    }
  };
}

function createConnectionActions(dependencies: ConnectionDependencies): ConnectionActions {
  let socket: WebSocket | null = null;
  let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let manualDisconnect = false;

  const disconnect = (): void => {
    manualDisconnect = true;
    if (reconnectTimeoutId !== null) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }
    socket?.close(1_000, 'Client disconnect');
    socket = null;
    dependencies.setConnectionState({ status: 'disconnected', reconnectAttempt: 0 });
  };

  const connect = (): void => {
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    manualDisconnect = false;
    dependencies.setConnectionState(previous => ({ ...previous, status: 'connecting' }));

    try {
      socket = new WebSocket(dependencies.wsUrl);
      socket.addEventListener('open', () => {
        dependencies.setConnectionState({
          status: 'connected',
          reconnectAttempt: 0,
          lastConnectedAt: new Date().toISOString(),
        });
      });
      socket.addEventListener('message', event => {
        try {
          const message = parseTelemetryMessage(JSON.parse(event.data));
          if (message === null) {
            reportClientWarning('[useRealtimeData] Dropping unrecognized telemetry message');
            return;
          }
          dependencies.handleMessage(message);
        } catch (cause: unknown) {
          reportClientError('[useRealtimeData] Failed to parse message', cause);
        }
      });
      socket.addEventListener('error', () => {
        const error = new Error('WebSocket connection error');
        dependencies.setConnectionState(previous => ({
          ...previous,
          status: 'error',
          error: error.message,
        }));
        dependencies.onError?.(error);
      });
      socket.addEventListener('close', () => {
        socket = null;
        if (manualDisconnect) {
          dependencies.setConnectionState({ status: 'disconnected', reconnectAttempt: 0 });
          return;
        }

        const nextAttempt = dependencies.connectionState().reconnectAttempt + 1;
        if (!dependencies.autoReconnect || nextAttempt > dependencies.maxReconnectAttempts) {
          dependencies.setConnectionState({
            status: 'error',
            reconnectAttempt: nextAttempt,
            error: dependencies.autoReconnect
              ? 'Max reconnection attempts reached'
              : 'Connection closed',
          });
          return;
        }

        const delay = reconnectDelay(nextAttempt - 1);
        dependencies.setConnectionState({
          status: 'disconnected',
          reconnectAttempt: nextAttempt,
          error: `Connection closed. Reconnecting in ${Math.round(delay / 1_000)}s...`,
        });
        reconnectTimeoutId = setTimeout(connect, delay);
      });
    } catch (cause: unknown) {
      const error = cause instanceof Error ? cause : new Error('Failed to connect', { cause });
      dependencies.setConnectionState({
        status: 'error',
        reconnectAttempt: dependencies.connectionState().reconnectAttempt,
        error: error.message,
      });
      dependencies.onError?.(error);
    }
  };

  return { connect, disconnect };
}

export function useRealtimeData(options: UseRealtimeDataOptions): UseRealtimeDataReturn {
  const maxCommands = options.maxCommands ?? DEFAULT_MAX_COMMANDS;
  const [connectionState, setConnectionState] = createSignal<RealtimeConnectionState>({
    status: 'disconnected',
    reconnectAttempt: 0,
  });
  const [commands, setCommands] = createSignal<CommandEvent[]>([]);
  const [activeSessions, setActiveSessions] = createSignal<Map<string, SessionEvent>>(new Map());
  const [health, setHealth] = createSignal<HealthUpdate | null>(null);

  const handleMessage = createMessageHandler({
    maxCommands,
    setCommands,
    setActiveSessions,
    setHealth,
    onCommand: options.onCommand,
    onSession: options.onSession,
    onHealth: options.onHealth,
  });
  const connection = createConnectionActions({
    wsUrl: options.wsUrl,
    autoReconnect: options.autoReconnect ?? true,
    maxReconnectAttempts: options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
    connectionState,
    setConnectionState,
    handleMessage,
    onError: options.onError,
  });

  onCleanup(connection.disconnect);

  return {
    connectionState,
    isConnected: () => connectionState().status === 'connected',
    commands,
    activeSessions: () => Array.from(activeSessions().values()),
    activeSessionsMap: activeSessions,
    health,
    commandCount: () => commands().length,
    activeSessionCount: () => activeSessions().size,
    sessionsByCountry: () => groupSessionsByCountry(activeSessions()),
    connect: connection.connect,
    disconnect: connection.disconnect,
    clearCommands: () => setCommands([]),
  };
}

export default useRealtimeData;
