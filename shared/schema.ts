import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Game Instances Database Table
export const gameInstances = pgTable("game_instances", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  className: text("class_name").notNull(),
  path: text("path").notNull().unique(),
  parent: text("parent"),
  properties: jsonb("properties").notNull().default('{}'),
  children: jsonb("children").notNull().default('[]'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGameInstanceSchema = createInsertSchema(gameInstances);
export type InsertGameInstance = z.infer<typeof insertGameInstanceSchema>;
export type DbGameInstance = typeof gameInstances.$inferSelect;

// Connection Status Database Table
export const connectionStatus = pgTable("connection_status", {
  id: text("id").primaryKey(),
  isConnected: boolean("is_connected").notNull(),
  connectedAt: timestamp("connected_at"),
  lastPing: timestamp("last_ping"),
  gameName: text("game_name"),
  placeId: text("place_id"),
});

// Game Instance Schema
export const GameInstanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  className: z.string(),
  path: z.string(),
  parent: z.string().nullable(),
  properties: z.record(z.any()),
  children: z.array(z.string()).default([]),
});

export type GameInstance = z.infer<typeof GameInstanceSchema>;

// Connection Status Schema
export const ConnectionStatusSchema = z.object({
  id: z.string(),
  isConnected: z.boolean(),
  connectedAt: z.date().nullable(),
  lastPing: z.date().nullable(),
  gameName: z.string().nullable(),
  placeId: z.string().nullable(),
});

export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

// WebSocket Message Schema
export const WebSocketMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("gameTree"),
    data: z.object({
      instances: z.array(GameInstanceSchema),
    }),
  }),
  z.object({
    type: z.literal("gameTreeBatch"),
    data: z.object({
      batchIndex: z.number(),
      totalBatches: z.number(),
      instances: z.array(GameInstanceSchema),
      isFirstBatch: z.boolean().optional(),
      isLastBatch: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal("gameTreeStart"),
    data: z.object({
      totalInstances: z.number(),
      batchSize: z.number(),
    }),
  }),
  z.object({
    type: z.literal("gameTreeComplete"),
    data: z.object({
      totalProcessed: z.number(),
    }),
  }),
  z.object({
    type: z.literal("incrementalUpdate"),
    data: z.object({
      added: z.array(GameInstanceSchema).default([]),
      modified: z.array(GameInstanceSchema).default([]),
      removed: z.array(z.string()).default([]), // paths of removed instances
      timestamp: z.number(),
    }),
  }),
  z.object({
    type: z.literal("bulkIncrementalUpdate"),
    data: z.object({
      updates: z.array(z.object({
        added: z.array(GameInstanceSchema).default([]),
        modified: z.array(GameInstanceSchema).default([]),
        removed: z.array(z.string()).default([]),
      })),
      timestamp: z.number(),
    }),
  }),
  z.object({
    type: z.literal("instanceAdded"),
    data: GameInstanceSchema,
  }),
  z.object({
    type: z.literal("instanceRemoved"),
    data: z.object({
      path: z.string(),
    }),
  }),
  z.object({
    type: z.literal("instanceChanged"),
    data: GameInstanceSchema,
  }),
  z.object({
    type: z.literal("ping"),
    data: z.object({
      timestamp: z.number(),
    }),
  }),
]);

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;
