import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// Ultra compression decompression system for maximum bandwidth efficiency
function ultraDecompressRobloxData(compressed: string): string {
  const compressionPatterns = [
    '{"', '"}', '":', '",', ':[', ']}', ',{', '}]', '},{', '[{',
    '"name":', '"className":', '"path":', '"parent":', '"properties":', '"children":',
    '"id":', '"instances":', '"batchIndex":', '"totalBatches":', '"isLastBatch":',
    '"added":', '"modified":', '"removed":', '"timestamp":', '"type":',
    '"Part"', '"Model"', '"Script"', '"LocalScript"', '"Folder"', '"Workspace"',
    '"Players"', '"ReplicatedStorage"', '"ServerStorage"', '"Lighting"',
    '"Anchored":', '"Material":', '"Size":', '"Position":', '"Transparency":',
    '"Health":', '"MaxHealth":', '"Enabled":', '"Source":', '"Brightness":',
    '"true"', '"false"', '"nil"', 'true', 'false', 'null',
    'game.', '.Workspace', '.Players', '.ReplicatedStorage'
  ];

  const DECOMPRESSION_DICT: Record<string, string> = {};
  for (let i = 0; i < compressionPatterns.length; i++) {
    const token = String.fromCharCode(128 + (i % 127));
    DECOMPRESSION_DICT[token] = compressionPatterns[i];
  }

  let decompressed = compressed;

  // Pass 1: Replace tokens
  for (const [token, original] of Object.entries(DECOMPRESSION_DICT)) {
    decompressed = decompressed.split(token).join(original);
  }

  // Pass 2: Run-length encoding
  decompressed = decompressed.replace(/\u00FE(.)([\s\S])/g, (match, char, countChar) => {
    const count = countChar.charCodeAt(0);
    return char.repeat(count);
  });

  // Pass 3: Structure repeats
  decompressed = decompressed.replace(/\u00FD(\{[^}]+\})([\s\S])/g, (match, struct, countChar) => {
    const count = countChar.charCodeAt(0);
    const parts = [];
    for (let i = 0; i < count; i++) parts.push(struct);
    return parts.join(',');
  });

  // Pass 4: Property key expansion
  decompressed = decompressed.replace(/"properties":\{([^}]+)\}/g, (match, props) => {
    let expanded = props;
    const shortKeys: Record<string, string> = {
      '"N":': '"Name":', '"C":': '"ClassName":', '"A":': '"Anchored":',
      '"M":': '"Material":', '"S":': '"Size":', '"P":': '"Position":', 
      '"T":': '"Transparency":', '"H":': '"Health":'
    };
    for (const [short, full] of Object.entries(shortKeys)) {
      expanded = expanded.split(short).join(full);
    }
    return '"properties":{' + expanded + '}';
  });

  return decompressed;
}

// Ultra compression middleware for API routes
app.use('/api', express.raw({ type: '*/*', limit: '50mb' }), (req, res, next) => {
  if (req.headers['x-ultra-compression'] === 'RobloxUltraV2') {
    try {
      const bodyString = req.body.toString('utf8');
      let decompressed = bodyString;
      
      if (bodyString.startsWith('ULTRA_COMPRESSED_V2:')) {
        decompressed = ultraDecompressRobloxData(bodyString.substring(20));
        console.log(`⚡ ULTRA: ${req.headers['x-original-size']} → ${bodyString.length} bytes (-${req.headers['x-compression-ratio']}%)`);
      }
      
      req.body = JSON.parse(decompressed);
      next();
    } catch (error) {
      console.error('Ultra decompression failed:', error);
      res.status(400).json({ error: 'Ultra decompression failed' });
    }
  } else {
    // Handle non-compressed requests
    try {
      const bodyString = req.body.toString('utf8');
      if (bodyString.trim()) {
        req.body = JSON.parse(bodyString);
      }
      next();
    } catch (error) {
      next();
    }
  }
});

// Standard JSON parsing for non-API routes
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
    log(`⚡ ULTRA COMPRESSION SERVER serving on port ${port}`);
  });
})();