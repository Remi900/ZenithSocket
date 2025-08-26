import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { compress, decompress } from '@mongodb-js/zstd';

const app = express();

// Zstandard compression middleware - maximum efficiency!
app.use('/api', express.raw({ type: '*/*', limit: '50mb' }), async (req, res, next) => {
  if (req.headers['x-zstd-compression'] === 'true') {
    try {
      const compressedBuffer = req.body as Buffer;
      console.log(`🗜️ ZSTD: Received ${compressedBuffer.length} compressed bytes`);
      
      // Decompress using Zstandard
      const decompressedBuffer = await decompress(compressedBuffer);
      const decompressedString = decompressedBuffer.toString('utf8');
      
      const originalSize = parseInt(req.headers['x-original-size'] as string) || decompressedString.length;
      const compressionRatio = Math.round(((originalSize - compressedBuffer.length) / originalSize) * 100);
      
      console.log(`✅ ZSTD DECOMPRESSED: ${compressedBuffer.length} → ${decompressedString.length} bytes (+${compressionRatio}% efficiency)`);
      
      req.body = JSON.parse(decompressedString);
      next();
    } catch (error) {
      console.error('❌ Zstd decompression failed:', (error as Error).message);
      res.status(400).json({ 
        error: 'Zstd decompression failed', 
        details: (error as Error).message 
      });
    }
  } else {
    // Handle non-compressed requests
    try {
      const bodyString = (req.body as Buffer).toString('utf8');
      if (bodyString.trim()) {
        req.body = JSON.parse(bodyString);
      } else {
        req.body = {};
      }
      next();
    } catch (error) {
      req.body = {};
      next();
    }
  }
});

// Standard middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`🗜️ ZSTANDARD COMPRESSION SERVER serving on port ${port}`);
  });
})();