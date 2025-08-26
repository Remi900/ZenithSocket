# Overview

This is a full-stack application that creates a Roblox game explorer interface, allowing users to inspect and browse Roblox game instances in real-time. The application consists of a React frontend with a modern UI built using shadcn/ui components, and an Express.js backend that manages WebSocket connections to receive game data from Roblox clients. The system displays game hierarchies in a tree view with detailed property inspection capabilities.

# User Preferences

Preferred communication style: Simple, everyday language.

# Recent Changes

## January 26, 2025
- Fixed Lua WebSocket connection issues for Roblox client
- Created corrected Lua script (`roblox-zenith.lua`) that properly uses Zenith WebSocket API
- Removed invalid `OnOpen` event handler that was causing script errors
- Added proper error handling and reconnection logic
- Enhanced game data serialization with more object types (Parts, Models, Scripts, Players)
- Added real-time monitoring for workspace changes and player join/leave events

# System Architecture

## Frontend Architecture

The frontend is built with **React** and **TypeScript**, using **Vite** as the build tool. The UI framework is based on **shadcn/ui** components with **Tailwind CSS** for styling. The application follows a component-based architecture with:

- **State Management**: Uses **TanStack React Query** for server state management and data fetching
- **Routing**: Implements client-side routing with **wouter** library
- **Real-time Updates**: WebSocket connection for live data synchronization with the backend
- **UI Components**: Comprehensive set of pre-built components from shadcn/ui for consistent design
- **Styling**: Dark theme with custom CSS variables and Tailwind utility classes

The frontend structure separates concerns with dedicated directories for components, pages, hooks, and utilities. The main application features include a tree view for browsing game instances, a properties panel for detailed inspection, and a status bar showing connection information.

## Backend Architecture

The backend uses **Express.js** with **TypeScript** and follows a RESTful API design with WebSocket support for real-time communication:

- **API Layer**: RESTful endpoints for managing game instances and connection status
- **WebSocket Server**: Handles real-time communication with Roblox game clients
- **Storage Layer**: Abstracted storage interface with in-memory implementation for development
- **Connection Management**: Single-client connection handling with heartbeat monitoring

The server architecture supports both HTTP API requests and WebSocket connections, allowing for both request-response patterns and real-time data streaming from connected Roblox clients.

## Data Storage Solutions

The application uses an **in-memory storage system** for development, implemented through a storage abstraction layer that can be easily swapped for persistent storage solutions. The storage handles:

- **Game Instances**: Hierarchical game object data with properties and relationships
- **Connection Status**: Real-time tracking of client connection state
- **User Management**: Basic user data structure (prepared for future authentication)

**Database Schema**: The system is prepared for **PostgreSQL** integration using **Drizzle ORM**, with schema definitions already established for users table and connection to Neon Database through environment configuration.

## External Dependencies

- **@neondatabase/serverless**: PostgreSQL database connection for Neon Database
- **drizzle-orm & drizzle-kit**: Type-safe ORM for database operations and migrations
- **@radix-ui/***: Comprehensive set of headless UI primitives for accessible components
- **@tanstack/react-query**: Powerful data synchronization library for React applications
- **ws (WebSocket)**: Real-time bidirectional communication between server and Roblox clients
- **express**: Web application framework for the Node.js backend
- **vite**: Fast build tool and development server for the frontend
- **tailwindcss**: Utility-first CSS framework for styling
- **react-hook-form**: Forms library with validation support
- **wouter**: Minimalist routing library for React