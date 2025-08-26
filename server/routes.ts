import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import type { IBatchStorage } from "./storage";
const batchStorage = storage as IBatchStorage;
import { WebSocketMessageSchema, type ConnectionStatus } from "../shared/schema";
import compression from "compression";

// MAXIMUM SPEED in-memory storage with instant response buffers
let fastInstances: any[] = [];
let instancesMap = new Map<string, any>(); // Fast lookup by path
let fastConnection = {
  id: 'roblox-client',
  isConnected: false,
  connectedAt: null as Date | null,
  lastPing: null as Date | null,
  gameName: null as string | null,
  placeId: null as string | null,
};
let lastDataUpdate = 0;
let cachedResponse: string = '[]'; // Pre-stringified JSON for ultra-fast responses
let cachedConnectionResponse: string = JSON.stringify({
  id: 'roblox-client',
  isConnected: false,
  connectedAt: null,
  lastPing: null,
  gameName: null,
  placeId: null,
}); // Pre-stringified connection response
let responseBuffers = new Map<string, Buffer>(); // Pre-compressed buffers

export async function registerRoutes(app: Express): Promise<Server> {
  // Enable ultra-fast compression
  app.use(compression({
    level: 1, // Fastest compression level
    threshold: 1024, // Only compress responses > 1KB
  }));

  // INSTANT response API - maximum speed possible
  app.get("/api/instances", async (req, res) => {
    // Set headers for maximum speed and efficient caching
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=1');
    res.setHeader('ETag', `"${lastDataUpdate}"`);
    
    // Check ETag for client-side caching efficiency
    const clientETag = req.headers['if-none-match'];
    if (clientETag === `"${lastDataUpdate}"`) {
      return res.status(304).end();
    }
    
    // INSTANT response using pre-stringified cached data
    res.end(cachedResponse);
  });

  app.get("/api/connection", async (req, res) => {
    // INSTANT pre-stringified response for maximum speed
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=2');
    res.setHeader('ETag', `"conn-${fastConnection.lastPing ? new Date(fastConnection.lastPing).getTime() : 0}"`);
    
    // Check ETag for client-side caching efficiency  
    const clientETag = req.headers['if-none-match'];
    if (clientETag === `"conn-${fastConnection.lastPing ? new Date(fastConnection.lastPing).getTime() : 0}"`) {
      return res.status(304).end();
    }
    
    res.end(cachedConnectionResponse);
  });

  app.post("/api/clear-instances", async (req, res) => {
    // Ultra-fast memory clear
    fastInstances.length = 0; // Faster than fastInstances = []
    instancesMap.clear();
    cachedResponse = '[]';
    
    // Background database clear (don't wait)
    setImmediate(() => {
      storage.clearAllInstances().catch(console.error);
    });
    
    res.json({ success: true });
  });

  // HTTP endpoints for Roblox client data submission (replacing WebSocket)
  app.post("/api/game-tree", async (req, res) => {
    try {
      const { instances } = req.body;
      
      // Update connection status with data activity
      const connectionStatus: ConnectionStatus = {
        id: 'roblox-client',
        isConnected: true,
        connectedAt: new Date(),
        lastPing: new Date(), // Mark as active since we received data
        gameName: null,
        placeId: null,
      };
      await storage.setConnectionStatus(connectionStatus);

      // Clear and rebuild instances
      await storage.clearAllInstances();
      
      // Always use batch processing for better performance
      await batchStorage.addInstancesBatch(instances);
      
      console.log(`Received game tree with ${instances.length} instances via HTTP`);
      res.json({ success: true, processedCount: instances.length });
    } catch (error) {
      console.error('Error processing game tree:', error);
      res.status(500).json({ error: "Failed to process game tree" });
    }
  });

  app.post("/api/game-tree-batch", async (req, res) => {
    try {
      // Log ultra compression stats
      if (req.headers['x-ultra-compression']) {
        console.log(`⚡ ULTRA BATCH: ${req.headers['x-compression-ratio']}% compression ratio`);
      }
      
      const { instances, batchIndex, totalBatches, isLastBatch } = req.body;
      
      // Ultra-fast batch processing with optimized data structures
      const startTime = Date.now();
      
      // MAXIMUM SPEED batch insertion with efficient deduplication
      const pathSet = new Set(fastInstances.map(inst => inst.path));
      const newInstances = instances.filter(inst => !pathSet.has(inst.path));
      
      if (newInstances.length > 0) {
        fastInstances.push(...newInstances);
        for (const instance of newInstances) {
          instancesMap.set(instance.path, instance);
        }
        
        // Update cached responses only when there are actual changes
        cachedResponse = JSON.stringify(fastInstances);
      }
      
      fastConnection.isConnected = true;
      fastConnection.lastPing = new Date();
      cachedConnectionResponse = JSON.stringify(fastConnection);
      lastDataUpdate = Date.now();
      
      const processingTime = Date.now() - startTime;
      console.log(`⚡ ULTRA-FAST batch ${batchIndex + 1}/${totalBatches} with ${instances.length} instances in ${processingTime}ms`);
      
      // Background database storage (don't wait for it)
      setImmediate(() => {
        batchStorage.addInstancesBatch(instances).catch(error => {
          console.error('Background batch insert failed:', error);
        });
      });
      
      // Instant response
      res.json({ 
        success: true, 
        processedCount: instances.length,
        batchIndex: batchIndex,
        isLastBatch: isLastBatch,
        processingTime: processingTime
      });
    } catch (error) {
      console.error('Error processing batch:', error);
      res.status(500).json({ error: "Failed to process batch" });
    }
  });

  app.post("/api/incremental-update", async (req, res) => {
    try {
      // Log ultra compression stats
      if (req.headers['x-ultra-compression']) {
        console.log(`⚡ ULTRA UPDATE: ${req.headers['x-compression-ratio']}% compression`);
      }
      
      const { added, modified, removed } = req.body;
      const startTime = Date.now();
      
      // MAXIMUM SPEED operations with instant buffer updates
      if (added.length > 0) {
        fastInstances.push(...added); // Spread is faster than loops
        for (const instance of added) {
          instancesMap.set(instance.path, instance);
        }
      }
      
      if (modified.length > 0) {
        // Use map for instant O(1) lookups - no array searching
        for (const modifiedInstance of modified) {
          if (instancesMap.has(modifiedInstance.path)) {
            const index = fastInstances.findIndex(inst => inst.path === modifiedInstance.path);
            if (index !== -1) {
              fastInstances[index] = modifiedInstance;
            }
            instancesMap.set(modifiedInstance.path, modifiedInstance);
          } else {
            fastInstances.push(modifiedInstance);
            instancesMap.set(modifiedInstance.path, modifiedInstance);
          }
        }
      }
      
      if (removed.length > 0) {
        // Lightning-fast removal using Set + filter
        const removedSet = new Set(removed);
        fastInstances = fastInstances.filter(inst => {
          const shouldRemove = removedSet.has(inst.path);
          if (shouldRemove) {
            instancesMap.delete(inst.path);
          }
          return !shouldRemove;
        });
      }
      
      // INSTANT response buffer updates
      cachedResponse = JSON.stringify(fastInstances);
      cachedConnectionResponse = JSON.stringify(fastConnection);
      
      fastConnection.isConnected = true;
      fastConnection.lastPing = new Date();
      lastDataUpdate = Date.now();
      
      const processingTime = Date.now() - startTime;
      
      // Background database operations (don't wait)
      setImmediate(() => {
        if (added.length > 0) {
          batchStorage.addInstancesBatch(added).catch(console.error);
        }
        if (modified.length > 0) {
          batchStorage.addInstancesBatch(modified).catch(console.error);
        }
        if (removed.length > 0) {
          removed.forEach((path: string) => storage.removeInstance(path).catch(console.error));
        }
      });
      
      // Instant response
      res.json({ 
        success: true, 
        processed: { added: added.length, modified: modified.length, removed: removed.length },
        processingTime: processingTime
      });
    } catch (error) {
      console.error('Error processing incremental update:', error);
      res.status(500).json({ error: "Failed to process incremental update" });
    }
  });

  app.post("/api/instance", async (req, res) => {
    try {
      const { action, instance, path } = req.body;
      
      switch (action) {
        case 'add':
          await storage.addInstance(instance);
          console.log(`Instance added via HTTP: ${instance.path}`);
          break;
        case 'update':
          await storage.updateInstance(instance);
          console.log(`Instance updated via HTTP: ${instance.path}`);
          break;
        case 'remove':
          await storage.removeInstance(path);
          console.log(`Instance removed via HTTP: ${path}`);
          break;
        default:
          return res.status(400).json({ error: "Invalid action. Use 'add', 'update', or 'remove'" });
      }
      
      res.json({ success: true, action: action });
    } catch (error) {
      console.error(`Error ${req.body.action}ing instance:`, error);
      res.status(500).json({ error: `Failed to ${req.body.action} instance` });
    }
  });

  app.post("/api/ping", async (req, res) => {
    // Ultra-fast ping with compression stats
    const now = new Date();
    fastConnection.lastPing = now;
    fastConnection.isConnected = true;
    
    // Log compression stats from ultra client
    if (req.body && req.body.compressionStats) {
      const stats = req.body.compressionStats;
      console.log(`⚡ ULTRA STATS: ${stats.totalSaved} bytes saved (${stats.averageRatio}% avg compression)`);
    }
    
    // Background database update (don't wait)
    storage.setConnectionStatus(fastConnection).catch(console.error);
    
    res.json({ success: true, timestamp: now.toISOString(), ultraCompressionSupported: true });
  });

  app.post("/api/disconnect", async (req, res) => {
    try {
      console.log('Manual disconnect requested - clearing all data');
      
      // Clear all instance data
      await storage.clearAllInstances();
      
      // Update connection status to disconnected
      const disconnectedStatus: ConnectionStatus = {
        id: 'roblox-client',
        isConnected: false,
        connectedAt: null,
        lastPing: null,
        gameName: null,
        placeId: null,
      };
      await storage.setConnectionStatus(disconnectedStatus);
      
      res.json({ success: true, message: "Client disconnected and all data cleared" });
    } catch (error) {
      console.error('Error during manual disconnect:', error);
      res.status(500).json({ error: "Failed to disconnect and clear data" });
    }
  });

  // Efficient timeout checker using memory data
  setInterval(() => {
    if (fastConnection.lastPing) {
      const timeSinceLastPing = Date.now() - new Date(fastConnection.lastPing).getTime();
      const timeoutMs = 30000; // 30 seconds timeout (less aggressive)
      
      if (timeSinceLastPing > timeoutMs && fastConnection.isConnected) {
        console.log(`HTTP client timed out (${Math.round(timeSinceLastPing/1000)}s since last ping) - clearing all data`);
        
        // Clear fast memory data instantly
        fastInstances.length = 0; // More efficient than reassignment
        instancesMap.clear();
        fastConnection.isConnected = false;
        fastConnection.connectedAt = null;
        fastConnection.lastPing = null;
        
        // Update cached responses
        cachedResponse = '[]';
        cachedConnectionResponse = JSON.stringify(fastConnection);
        
        // Background database clear (don't wait)
        setImmediate(() => {
          storage.clearAllInstances().catch(console.error);
          storage.setConnectionStatus(fastConnection).catch(console.error);
        });
      }
    }
  }, 5000); // Check every 5 seconds instead of 2

  const httpServer = createServer(app);

  // WebSocket Server - listen on the same port as HTTP server
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws',
    clientTracking: true
  });
  let currentConnection: WebSocket | null = null;
  let heartbeatInterval: NodeJS.Timeout | null = null;
  
  // Batching state for processing large datasets
  let batchBuffer: any[] = [];
  let expectedBatches: number = 0;
  let processedBatches: number = 0;
  let totalExpectedInstances: number = 0;
  
  console.log('WebSocket server started on path /ws');

  const startHeartbeat = () => {
    heartbeatInterval = setInterval(() => {
      if (currentConnection && currentConnection.readyState === WebSocket.OPEN) {
        currentConnection.ping();
      }
    }, 30000); // Ping every 30 seconds
  };

  const stopHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  wss.on('connection', async (ws, req) => {
    // Check if this is a Roblox client (sending data) or web client (listening)
    const userAgent = req.headers['user-agent'] || '';
    const isRobloxClient = !userAgent.includes('Mozilla'); // Roblox doesn't send Mozilla user agent
    
    if (isRobloxClient) {
      // Close existing Roblox connection if any
      if (currentConnection && currentConnection.readyState === WebSocket.OPEN) {
        console.log('Closing existing connection for new client');
        currentConnection.close(1000, 'New client connecting');
        stopHeartbeat();
      }

      currentConnection = ws;
      console.log('Roblox client connected');
      
      // Clear previous data when new Roblox client connects
      await storage.clearAllInstances();

      // Update connection status
      const connectionStatus: ConnectionStatus = {
        id: 'roblox-client',
        isConnected: true,
        connectedAt: new Date(),
        lastPing: new Date(),
        gameName: null,
        placeId: null,
      };
      await storage.setConnectionStatus(connectionStatus);

      // Start heartbeat
      startHeartbeat();
    } else {
      console.log('Web client connected for listening');
      // Web clients just listen, don't change connection status
      return;
    }

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const validatedMessage = WebSocketMessageSchema.parse(message);
        
        switch (validatedMessage.type) {
          case 'gameTree':
            // Full game tree received - clear and rebuild
            await storage.clearAllInstances();
            if (validatedMessage.data.instances.length > 1000) {
              // Use batch processing for large datasets
              await batchStorage.addInstancesBatch(validatedMessage.data.instances);
            } else {
              // Use individual processing for smaller datasets
              for (const instance of validatedMessage.data.instances) {
                await storage.addInstance(instance);
              }
            }
            console.log(`Received game tree with ${validatedMessage.data.instances.length} instances`);
            break;
            
          case 'gameTreeStart':
            // Initialize batch processing
            console.log(`Starting batch processing: ${validatedMessage.data.totalInstances} instances in batches of ${validatedMessage.data.batchSize}`);
            batchBuffer = [];
            expectedBatches = Math.ceil(validatedMessage.data.totalInstances / validatedMessage.data.batchSize);
            processedBatches = 0;
            totalExpectedInstances = validatedMessage.data.totalInstances;
            
            // Clear existing data at start - this prevents conflicts
            try {
              await storage.clearAllInstances();
              console.log(`Cleared existing data, expecting ${expectedBatches} batches`);
            } catch (clearError: any) {
              console.error('Failed to clear instances:', clearError.message);
            }
            break;
            
          case 'gameTreeBatch':
            // Process batch of instances
            console.log(`Processing batch ${validatedMessage.data.batchIndex + 1}/${validatedMessage.data.totalBatches} with ${validatedMessage.data.instances.length} instances`);
            
            try {
              // Process this batch with simpler approach
              const instances = validatedMessage.data.instances;
              
              // Insert instances one by one to avoid batch conflicts
              let successCount = 0;
              for (const instance of instances) {
                try {
                  await storage.addInstance(instance);
                  successCount++;
                } catch (instanceError: any) {
                  // Skip duplicates silently
                  if (!instanceError.message.includes('duplicate') && !instanceError.message.includes('already exists')) {
                    console.warn(`Failed to insert instance ${instance.path}:`, instanceError.message);
                  }
                }
              }
              
              processedBatches++;
              
              // Send progress to client every 10 batches or at completion
              if (processedBatches % 10 === 0 || validatedMessage.data.isLastBatch) {
                console.log(`Progress: ${processedBatches}/${expectedBatches} batches processed (${successCount}/${instances.length} instances inserted)`);
              }
              
            } catch (error: any) {
              console.error(`Error processing batch ${validatedMessage.data.batchIndex}:`, error.message);
              // Continue processing other batches
            }
            break;
            
          case 'gameTreeComplete':
            // Batch processing complete
            const finalCount = await storage.getAllInstances();
            console.log(`Batch processing complete! Processed ${validatedMessage.data.totalProcessed} instances. Database has ${finalCount.length} instances.`);
            
            // Reset batch state
            batchBuffer = [];
            expectedBatches = 0;
            processedBatches = 0;
            totalExpectedInstances = 0;
            break;
            
          case 'incrementalUpdate':
            // Handle incremental updates - only new/changed data
            console.log(`Processing incremental update: ${validatedMessage.data.added.length} added, ${validatedMessage.data.modified.length} modified, ${validatedMessage.data.removed.length} removed`);
            
            try {
              // Process additions
              if (validatedMessage.data.added.length > 0) {
                await batchStorage.addInstancesBatch(validatedMessage.data.added);
              }
              
              // Process modifications
              if (validatedMessage.data.modified.length > 0) {
                await batchStorage.addInstancesBatch(validatedMessage.data.modified); // upsert behavior
              }
              
              // Process removals
              for (const path of validatedMessage.data.removed) {
                await storage.removeInstance(path);
              }
              
              console.log(`Incremental update completed successfully`);
            } catch (error) {
              console.error('Error processing incremental update:', error);
            }
            break;
            
          case 'bulkIncrementalUpdate':
            // Handle bulk incremental updates for very large changes
            console.log(`Processing bulk incremental update with ${validatedMessage.data.updates.length} update batches`);
            
            try {
              for (const updateBatch of validatedMessage.data.updates) {
                // Process additions
                if (updateBatch.added.length > 0) {
                  await batchStorage.addInstancesBatch(updateBatch.added);
                }
                
                // Process modifications
                if (updateBatch.modified.length > 0) {
                  await batchStorage.addInstancesBatch(updateBatch.modified);
                }
                
                // Process removals
                for (const path of updateBatch.removed) {
                  await storage.removeInstance(path);
                }
              }
              
              console.log(`Bulk incremental update completed successfully`);
            } catch (error) {
              console.error('Error processing bulk incremental update:', error);
            }
            break;

          case 'instanceAdded':
            await storage.addInstance(validatedMessage.data);
            console.log(`Instance added: ${validatedMessage.data.path}`);
            break;

          case 'instanceRemoved':
            await storage.removeInstance(validatedMessage.data.path);
            console.log(`Instance removed: ${validatedMessage.data.path}`);
            break;

          case 'instanceChanged':
            await storage.updateInstance(validatedMessage.data);
            console.log(`Instance updated: ${validatedMessage.data.path}`);
            break;

          case 'ping':
            // Update last ping time
            const status = await storage.getConnectionStatus();
            if (status) {
              status.lastPing = new Date();
              await storage.setConnectionStatus(status);
            }
            break;

          default:
            console.log('Unknown message type:', (validatedMessage as any).type);
        }
      } catch (error) {
        console.error('Invalid message received:', error);
      }
    });

    ws.on('close', async () => {
      console.log('Roblox client disconnected');
      currentConnection = null;
      stopHeartbeat();

      // Clear all instance data when disconnected
      await storage.clearAllInstances();

      // Update connection status
      const connectionStatus: ConnectionStatus = {
        id: 'roblox-client',
        isConnected: false,
        connectedAt: null,
        lastPing: null,
        gameName: null,
        placeId: null,
      };
      await storage.setConnectionStatus(connectionStatus);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  return httpServer;
}
