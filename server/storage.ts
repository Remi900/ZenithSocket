import { type User, type InsertUser, type GameInstance, type ConnectionStatus, type DbGameInstance, gameInstances, connectionStatus, users } from "../shared/schema.js";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Game instances
  addInstance(instance: GameInstance): Promise<void>;
  removeInstance(path: string): Promise<void>;
  updateInstance(instance: GameInstance): Promise<void>;
  getInstance(path: string): Promise<GameInstance | undefined>;
  getAllInstances(): Promise<GameInstance[]>;
  clearAllInstances(): Promise<void>;
  
  // Connection status
  getConnectionStatus(): Promise<ConnectionStatus | undefined>;
  setConnectionStatus(status: ConnectionStatus): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private db: any;
  
  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    
    const connection = postgres(process.env.DATABASE_URL);
    this.db = drizzle(connection);
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await this.db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async addInstance(instance: GameInstance): Promise<void> {
    // Use upsert with primary key to handle duplicates efficiently
    await this.db.insert(gameInstances).values({
      id: instance.id,
      name: instance.name,
      className: instance.className,
      path: instance.path,
      parent: instance.parent,
      properties: instance.properties,
      children: instance.children,
    }).onConflictDoUpdate({
      target: gameInstances.id, // Use primary key for conflict resolution
      set: {
        name: instance.name,
        className: instance.className,
        path: instance.path,
        parent: instance.parent,
        properties: instance.properties,
        children: instance.children,
        updatedAt: sql`now()`,
      },
    });
  }

  async addInstancesBatch(instances: GameInstance[]): Promise<void> {
    if (instances.length === 0) return;
    
    // Remove duplicates within the batch to avoid conflicts
    const uniqueInstances = new Map<string, GameInstance>();
    for (const instance of instances) {
      uniqueInstances.set(instance.path, instance); // Last instance with same path wins
    }
    
    const uniqueInstancesList = Array.from(uniqueInstances.values());
    if (uniqueInstancesList.length === 0) return;
    
    // Process in smaller chunks to avoid constraint violations
    const CHUNK_SIZE = 100;
    const chunks = [];
    for (let i = 0; i < uniqueInstancesList.length; i += CHUNK_SIZE) {
      chunks.push(uniqueInstancesList.slice(i, i + CHUNK_SIZE));
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (const chunk of chunks) {
      try {
        // Try individual inserts with upsert logic to avoid constraint errors
        for (const instance of chunk) {
          try {
            await this.addInstance(instance);
            successCount++;
          } catch (error: any) {
            if (!error.message.includes('duplicate key')) {
              console.error(`Failed to insert instance ${instance.path}:`, error.message);
            }
            failCount++;
          }
        }
      } catch (error: any) {
        console.error(`Chunk processing failed:`, error.message);
        failCount += chunk.length;
      }
    }
    
    if (failCount > 0 && successCount === 0) {
      console.warn(`Batch processing completed: ${successCount} success, ${failCount} duplicates/failures`);
    }
  }

  async removeInstance(path: string): Promise<void> {
    await this.db.delete(gameInstances).where(eq(gameInstances.path, path));
  }

  async updateInstance(instance: GameInstance): Promise<void> {
    await this.db.update(gameInstances)
      .set({
        name: instance.name,
        className: instance.className,
        parent: instance.parent,
        properties: instance.properties,
        children: instance.children,
        updatedAt: sql`now()`,
      })
      .where(eq(gameInstances.path, instance.path));
  }

  async getInstance(path: string): Promise<GameInstance | undefined> {
    const result = await this.db.select().from(gameInstances).where(eq(gameInstances.path, path));
    const dbInstance = result[0];
    if (!dbInstance) return undefined;
    
    return {
      id: dbInstance.id,
      name: dbInstance.name,
      className: dbInstance.className,
      path: dbInstance.path,
      parent: dbInstance.parent,
      properties: dbInstance.properties as Record<string, any>,
      children: dbInstance.children as string[],
    };
  }

  async getAllInstances(): Promise<GameInstance[]> {
    const results = await this.db.select({
      id: gameInstances.id,
      name: gameInstances.name,
      className: gameInstances.className,
      path: gameInstances.path,
      parent: gameInstances.parent,
      properties: gameInstances.properties,
      children: gameInstances.children,
    }).from(gameInstances).limit(10000); // Limit to prevent massive queries
    
    return results.map((dbInstance: any) => ({
      id: dbInstance.id,
      name: dbInstance.name,
      className: dbInstance.className,
      path: dbInstance.path,
      parent: dbInstance.parent,
      properties: dbInstance.properties as Record<string, any>,
      children: dbInstance.children as string[],
    }));
  }

  async clearAllInstances(): Promise<void> {
    await this.db.delete(gameInstances);
  }

  async getConnectionStatus(): Promise<ConnectionStatus | undefined> {
    const result = await this.db.select({
      id: connectionStatus.id,
      isConnected: connectionStatus.isConnected,
      connectedAt: connectionStatus.connectedAt,
      lastPing: connectionStatus.lastPing,
      gameName: connectionStatus.gameName,
      placeId: connectionStatus.placeId,
    }).from(connectionStatus).where(eq(connectionStatus.id, 'roblox-client')).limit(1);
    
    const dbStatus = result[0];
    if (!dbStatus) return undefined;
    
    return {
      id: dbStatus.id,
      isConnected: dbStatus.isConnected,
      connectedAt: dbStatus.connectedAt,
      lastPing: dbStatus.lastPing,
      gameName: dbStatus.gameName,
      placeId: dbStatus.placeId,
    };
  }

  async setConnectionStatus(status: ConnectionStatus): Promise<void> {
    await this.db.insert(connectionStatus).values({
      id: status.id,
      isConnected: status.isConnected,
      connectedAt: status.connectedAt,
      lastPing: status.lastPing,
      gameName: status.gameName,
      placeId: status.placeId,
    }).onConflictDoUpdate({
      target: connectionStatus.id,
      set: {
        isConnected: status.isConnected,
        connectedAt: status.connectedAt,
        lastPing: status.lastPing,
        gameName: status.gameName,
        placeId: status.placeId,
      },
    });
  }
}

// Add batch processing interface
export interface IBatchStorage extends IStorage {
  addInstancesBatch(instances: GameInstance[]): Promise<void>;
}

export class BatchDatabaseStorage extends DatabaseStorage implements IBatchStorage {
  async addInstancesBatch(instances: GameInstance[]): Promise<void> {
    return super.addInstancesBatch(instances);
  }
}

export const storage = new BatchDatabaseStorage();
