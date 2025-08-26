# Roblox Dex Web Explorer

A web-based Roblox game explorer that receives real-time data from Roblox clients via WebSocket connections. Inspired by the original Dex debugger with a modern web interface.

## Features

- **Real-time Game Data**: Receives live Roblox game instance data via WebSocket
- **Dex-inspired UI**: Dark theme with familiar tree view and properties panel
- **Single Connection**: Only allows one Roblox client connection at a time
- **Live Updates**: Real-time monitoring of game object changes
- **Resizable Interface**: Adjustable explorer panel width
- **Search Functionality**: Find objects quickly in the game tree
- **Property Inspection**: View detailed object properties with proper formatting

## Setup

### 1. Start the Web Server

```bash
npm install
npm run dev
```

The web interface will be available at `http://localhost:5173`
WebSocket server runs on port `8080`

### 2. Connect from Roblox

Use one of the provided Lua scripts in your Roblox game:

#### Option A: Full Featured Client (`roblox-client.lua`)
- Complete game tree synchronization
- Real-time property monitoring
- Automatic reconnection
- Detailed object properties

#### Option B: Simple Client (`roblox-simple.lua`)
- Basic game data sending
- Minimal setup
- Good for testing

### 3. Update Server URL

In the Lua script, change the SERVER_URL to match your server:

```lua
local SERVER_URL = "ws://your-server-url:8080/ws"
```

For local testing:
```lua
local SERVER_URL = "ws://localhost:8080/ws"
```

## WebSocket Protocol

The client sends JSON messages with the following format:

### Message Types

#### `gameTree` - Full game state
```json
{
  "type": "gameTree",
  "data": {
    "instances": [
      {
        "id": "unique-id",
        "name": "ObjectName",
        "className": "Part",
        "path": "game.Workspace.ObjectName",
        "parent": "game.Workspace",
        "properties": {...},
        "children": []
      }
    ]
  }
}
```

#### `instanceAdded` - New object created
```json
{
  "type": "instanceAdded",
  "data": {
    "id": "unique-id",
    "name": "NewObject",
    "className": "Part",
    "path": "game.Workspace.NewObject",
    "parent": "game.Workspace",
    "properties": {...},
    "children": []
  }
}
```

#### `instanceRemoved` - Object deleted
```json
{
  "type": "instanceRemoved",
  "data": {
    "path": "game.Workspace.DeletedObject"
  }
}
```

#### `instanceChanged` - Object properties updated
```json
{
  "type": "instanceChanged",
  "data": {
    "id": "unique-id",
    "name": "ChangedObject",
    "className": "Part",
    "path": "game.Workspace.ChangedObject",
    "parent": "game.Workspace",
    "properties": {...},
    "children": []
  }
}
```

#### `ping` - Heartbeat
```json
{
  "type": "ping",
  "data": {
    "timestamp": 1234567890
  }
}
```

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js + WebSocket
- **Storage**: In-memory (development)
- **Styling**: Tailwind CSS with custom Dex theme
- **UI Components**: Custom components inspired by original Dex

## Development

The project follows a full-stack TypeScript architecture:

```
├── client/          # React frontend
├── server/          # Express backend + WebSocket
├── shared/          # Shared TypeScript schemas
├── roblox-client.lua    # Full Roblox client
└── roblox-simple.lua    # Simple Roblox client
```

## Connection Status

The web interface shows:
- Connection status (Connected/Disconnected)
- WebSocket URL
- Number of connected clients (max 1)
- Last ping timestamp

## Limitations

- Single connection only (by design)
- In-memory storage (data lost on server restart)
- Basic property monitoring in simple client
- No authentication (suitable for local development)

## Usage Tips

1. Start the web server first
2. Open the web interface in your browser
3. Run the Lua script in Roblox Studio or in-game
4. Watch real-time game data appear in the web explorer
5. Click on objects in the tree to view their properties
6. Use search to find specific objects quickly

The web explorer will automatically reconnect if the connection is lost.