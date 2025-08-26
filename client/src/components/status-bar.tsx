import type { ConnectionStatus } from "@shared/schema";

interface StatusBarProps {
  connectionStatus?: ConnectionStatus;
}

export function StatusBar({ connectionStatus }: StatusBarProps) {
  const isConnected = connectionStatus?.isConnected ?? false;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  return (
    <div className="bg-[var(--dex-panel)] border-b border-[var(--dex-border)] px-4 py-2 flex items-center justify-between h-8">
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div 
            className={`w-2 h-2 rounded-full ${
              isConnected 
                ? 'bg-green-500 animate-pulse' 
                : 'bg-red-500'
            }`}
            data-testid="connection-status-indicator"
          />
          <span className="text-xs font-medium" data-testid="connection-status-text">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="text-xs text-[var(--dex-text-muted)] font-mono" data-testid="websocket-url">
          {wsUrl}
        </div>
      </div>
      <div className="flex items-center space-x-2 text-xs text-[var(--dex-text-muted)]">
        <span data-testid="client-count">
          {isConnected ? '1 client' : '0 clients'}
        </span>
        <span>•</span>
        <span data-testid="last-ping">
          {connectionStatus?.lastPing 
            ? `Last ping: ${new Date(connectionStatus.lastPing).toLocaleTimeString()}`
            : 'No pings'
          }
        </span>
      </div>
    </div>
  );
}
