// Ultra decompression system for hyper compressed Roblox client data
import { Request, Response, NextFunction } from 'express';

// Ultra decompression function
function ultraDecompressRobloxData(compressed: string): string {
  // Ultra comprehensive decompression dictionary matching the Lua client
  const compressionPatterns = [
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
    '0,0,0', '1,1,1', '255,255,255', '0.5', '1.0', '0.0'
  ];

  // Build decompression map
  const DECOMPRESSION_DICT: Record<string, string> = {};
  for (let i = 0; i < compressionPatterns.length; i++) {
    const token = String.fromCharCode(128 + (i % 127));
    DECOMPRESSION_DICT[token] = compressionPatterns[i];
  }

  let decompressed = compressed;

  // Pass 1: Replace compression tokens
  for (const [token, original] of Object.entries(DECOMPRESSION_DICT)) {
    decompressed = decompressed.split(token).join(original);
  }

  // Pass 2: Handle run-length encoding (254 marker)
  decompressed = decompressed.replace(/\u00FE(.)([\s\S])/g, (match, char, countChar) => {
    const count = countChar.charCodeAt(0);
    return char.repeat(count);
  });

  // Pass 3: Handle structure repeats (253 marker)
  decompressed = decompressed.replace(/\u00FD(\{[^}]+\})([\s\S])/g, (match, struct, countChar) => {
    const count = countChar.charCodeAt(0);
    const parts = [];
    for (let i = 0; i < count; i++) {
      parts.push(struct);
    }
    return parts.join(',');
  });

  // Pass 4: Expand micro-compressed property blocks
  decompressed = decompressed.replace(/"properties":\{([^}]+)\}/g, (match, props) => {
    let expanded = props;
    // Expand ultra-short property keys
    const shortKeys: Record<string, string> = {
      '"N":': '"Name":',
      '"C":': '"ClassName":',
      '"A":': '"Anchored":',
      '"M":': '"Material":',
      '"S":': '"Size":',
      '"P":': '"Position":',
      '"T":': '"Transparency":',
      '"H":': '"Health":'
    };
    for (const [short, full] of Object.entries(shortKeys)) {
      expanded = expanded.split(short).join(full);
    }
    return '"properties":{' + expanded + '}';
  });

  return decompressed;
}

// Ultra compression middleware
export function ultraCompressionMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.headers['x-ultra-compression'] === 'RobloxUltraV2') {
    try {
      const bodyString = (req as any).rawBody?.toString('utf8') || req.body?.toString('utf8');
      if (!bodyString) {
        return res.status(400).json({ error: 'No body data' });
      }

      let decompressed = bodyString;
      
      if (bodyString.startsWith('ULTRA_COMPRESSED_V2:')) {
        decompressed = ultraDecompressRobloxData(bodyString.substring(20));
        console.log(`⚡ ULTRA DECOMPRESSED: ${req.headers['x-original-size']} → ${bodyString.length} bytes (-${req.headers['x-compression-ratio']}%)`);
      }
      
      req.body = JSON.parse(decompressed);
      next();
    } catch (error) {
      console.error('Ultra decompression failed:', error);
      res.status(400).json({ error: 'Ultra decompression failed' });
    }
  } else {
    next();
  }
}