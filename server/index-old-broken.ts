import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// Fixed ultra decompression with proper character encoding
function ultraDecompressRobloxData(compressed: string): string {
  // Complete compression patterns matching Lua client exactly
  const COMPRESSION_DICT: string[] = [
    // JSON structure (highest frequency)
    '{"', '"}', '":', '",', ':[', ']}', ',{', '}]', '},{', '[{', 
    // Object properties (very high frequency)
    '"name":', '"className":', '"path":', '"parent":', '"properties":', '"children":', 
    '"id":', '"instances":', '"batchIndex":', '"totalBatches":', '"isLastBatch":',
    '"added":', '"modified":', '"removed":', '"timestamp":', '"type":',
    // Roblox classes (high frequency)
    '"Part"', '"Model"', '"Script"', '"LocalScript"', '"Folder"', '"Workspace"', 
    '"Players"', '"ReplicatedStorage"', '"ServerStorage"', '"Lighting"',
    '"StarterGui"', '"StarterPack"', '"StarterPlayer"', '"SoundService"',
    '"TweenService"', '"Teams"', '"Chat"', '"HttpService"', '"RunService"',
    '"UserInputService"', '"Humanoid"', '"MeshPart"', '"UnionOperation"',
    // Properties (medium frequency)
    '"Anchored":', '"Material":', '"Size":', '"Position":', '"Transparency":',
    '"Health":', '"MaxHealth":', '"Enabled":', '"Source":', '"Brightness":',
    '"TimeOfDay":', '"Gravity":', '"NumPlayers":', '"MaxPlayers":',
    // Values and patterns
    '"true"', '"false"', '"nil"', 'true', 'false', 'null',
    'game.', '.Workspace', '.Players', '.ReplicatedStorage', '.ServerStorage',
    // Common materials
    'Plastic', 'Wood', 'Concrete', 'Metal', 'Grass', 'Sand', 'Rock', 'Water',
    // Common numbers and patterns
    ',"0"', ',"1"', ',"2"', ',"3"', ',"4"', ',"5"', ',0,', ',1,', ',2,', 
    '0,0,0', '1,1,1', '255,255,255', '0.5', '1.0', '0.0',
  ];

  let decompressed = compressed;
  
  // Pass 1: Dictionary decompression with safe character mapping
  for (let i = 0; i < COMPRESSION_DICT.length; i++) {
    const token = String.fromCharCode(128 + (i % 127));
    const pattern = COMPRESSION_DICT[i];
    // Use split/join for exact replacement
    decompressed = decompressed.split(token).join(pattern);
  }

  // Pass 2: Run-length encoding decompression (\255 marker)
  let pos = 0;
  let result = '';
  while (pos < decompressed.length) {
    if (decompressed.charCodeAt(pos) === 255) {
      // Found RLE marker
      if (pos + 2 < decompressed.length) {
        const char = decompressed[pos + 1];
        const count = decompressed.charCodeAt(pos + 2);
        result += char.repeat(count);
        pos += 3;
      } else {
        result += decompressed[pos];
        pos++;
      }
    } else {
      result += decompressed[pos];
      pos++;
    }
  }
  decompressed = result;

  // Pass 3: Structure repeat decompression (\254 marker)
  pos = 0;
  result = '';
  while (pos < decompressed.length) {
    if (decompressed.charCodeAt(pos) === 254) {
      // Find the structure pattern
      let structStart = pos + 1;
      let braceCount = 0;
      let structEnd = structStart;
      
      // Find matching closing brace
      for (let i = structStart; i < decompressed.length; i++) {
        if (decompressed[i] === '{') braceCount++;
        else if (decompressed[i] === '}') braceCount--;
        
        if (braceCount === 0) {
          structEnd = i + 1;
          break;
        }
      }
      
      if (structEnd < decompressed.length) {
        const struct = decompressed.substring(structStart, structEnd);
        const count = decompressed.charCodeAt(structEnd);
        const parts = [];
        for (let i = 0; i < count; i++) {
          parts.push(struct);
        }
        result += parts.join(',');
        pos = structEnd + 1;
      } else {
        result += decompressed[pos];
        pos++;
      }
    } else {
      result += decompressed[pos];
      pos++;
    }
  }
  decompressed = result;

  // Pass 4: Expand micro-compressed property keys
  decompressed = decompressed.replace(/"properties":\{([^}]+)\}/g, (match, props) => {
    let expanded = props;
    // Expand ultra-short property keys
    const keyMap = {
      '"N":': '"Name":',
      '"C":': '"ClassName":',
      '"A":': '"Anchored":',
      '"M":': '"Material":',
      '"S":': '"Size":',
      '"P":': '"Position":',
      '"T":': '"Transparency":',
      '"H":': '"Health":'
    };
    
    for (const [short, full] of Object.entries(keyMap)) {
      expanded = expanded.split(short).join(full);
    }
    return '"properties":{' + expanded + '}';
  });

  return decompressed;
}

// Robust compression middleware with proper encoding handling
app.use('/api', express.raw({ type: '*/*', limit: '50mb' }), (req, res, next) => {
  if (req.headers['x-ultra-compression'] === 'RobloxUltraV2') {
    try {
      // Use latin1 encoding to preserve all byte values
      const bodyString = (req.body as Buffer).toString('latin1');
      console.log(`⚡ ULTRA: ${req.headers['x-original-size']} → ${bodyString.length} bytes (-${req.headers['x-compression-ratio']}%)`);
      
      let decompressed = bodyString;
      
      if (bodyString.startsWith('ULTRA_COMPRESSED_V2:')) {
        const compressedPart = bodyString.substring(20);
        console.log(`🔄 Decompressing ${compressedPart.length} bytes...`);
        decompressed = ultraDecompressRobloxData(compressedPart);
        console.log(`✅ DECOMPRESSED: ${compressedPart.length} → ${decompressed.length} chars`);
      }
      
      // Debug: Check if result looks like JSON
      const trimmed = decompressed.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        console.error('❌ Decompressed data doesn\'t look like JSON');
        console.error('First 200 chars:', trimmed.substring(0, 200));
        throw new Error('Decompressed data is not valid JSON format');
      }
      
      req.body = JSON.parse(decompressed);
      next();
    } catch (error) {
      console.error('❌ Ultra decompression failed:', (error as Error).message);
      res.status(400).json({ 
        error: 'Ultra decompression failed', 
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
      console.error('JSON parsing failed:', error);
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
    log(`⚡ ULTRA COMPRESSION SERVER (FIXED) serving on port ${port}`);
  });
})();