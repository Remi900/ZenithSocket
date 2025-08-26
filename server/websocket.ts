import WebSocket from 'ws';
import { WebSocketMessageSchema, ConnectionStatus } from '../shared/schema.js';
import { IStorage } from './storage.js';

export class WebSocketManager {
  private wss: WebSocket.Server;
  private currentConnection: WebSocket | null = null;
  private storage: IStorage;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(storage: IStorage, port: number = 8080) {
    this.storage = storage;
    this.wss = new WebSocket.Server({ port });
    
    this.wss.on('connection', (ws) => {
      this.handleConnection(ws);
    });

    console.log(`WebSocket server started on port ${port}`);
  }

  private async handleConnection(ws: WebSocket) {
    // Only allow one connection at a time
    if (this.currentConnection) {
      console.log('Rejecting new connection - already have an active connection');
      ws.close(1000, 'Only one connection allowed');
      return;
    }

    this.currentConnection = ws;
    console.log('Roblox client connected');

    // Clear previous data when new client connects
    await this.storage.clearAllInstances();

    // Update connection status
    const connectionStatus: ConnectionStatus = {
      id: 'roblox-client',
      isConnected: true,
      connectedAt: new Date(),
      lastPing: new Date(),
      gameName: null,
      placeId: null,
    };
    await this.storage.setConnectionStatus(connectionStatus);

    // Start heartbeat
    this.startHeartbeat();

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const validatedMessage = WebSocketMessageSchema.parse(message);
        await this.handleMessage(validatedMessage);
      } catch (error) {
        console.error('Invalid message received:', error);
      }
    });

    ws.on('close', async () => {
      console.log('Roblox client disconnected');
      this.currentConnection = null;
      this.stopHeartbeat();

      // Clear all instance data when disconnected
      await this.storage.clearAllInstances();

      // Update connection status
      const connectionStatus: ConnectionStatus = {
        id: 'roblox-client',
        isConnected: false,
        connectedAt: null,
        lastPing: null,
        gameName: null,
        placeId: null,
      };
      await this.storage.setConnectionStatus(connectionStatus);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  private async handleMessage(message: any) {
    switch (message.type) {
      case 'gameTree':
        // Full game tree received - clear and rebuild
        await this.storage.clearAllInstances();
        for (const instance of message.data.instances) {
          await this.storage.addInstance(instance);
        }
        console.log(`Received game tree with ${message.data.instances.length} instances`);
        break;

      case 'instanceAdded':
        await this.storage.addInstance(message.data);
        console.log(`Instance added: ${message.data.path}`);
        break;

      case 'instanceRemoved':
        await this.storage.removeInstance(message.data.path);
        console.log(`Instance removed: ${message.data.path}`);
        break;

      case 'instanceChanged':
        await this.storage.updateInstance(message.data);
        console.log(`Instance updated: ${message.data.path}`);
        break;

      case 'ping':
        // Update last ping time
        const status = await this.storage.getConnectionStatus();
        if (status) {
          status.lastPing = new Date();
          await this.storage.setConnectionStatus(status);
        }
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.currentConnection && this.currentConnection.readyState === WebSocket.OPEN) {
        this.currentConnection.ping();
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public isConnected(): boolean {
    return this.currentConnection !== null && this.currentConnection.readyState === WebSocket.OPEN;
  }

  public getConnectionCount(): number {
    return this.isConnected() ? 1 : 0;
  }
}