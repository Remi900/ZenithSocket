import { useState, useMemo, memo, useCallback, useRef, useEffect } from "react";
import { 
  ChevronRight, 
  Search, 
  RotateCcw, 
  Expand, 
  Minimize,
  Gamepad2,
  Box as CubeIcon,
  Users,
  User,
  Lightbulb,
  Database,
  Monitor,
  Box,
  Code,
  FileCode,
  Folder,
  Circle,
  Camera,
  Layers,
  Volume2,
  Settings,
  Zap,
  Shield,
  Package,
  Palette
} from "lucide-react";
import type { GameInstance } from "@shared/schema";

interface TreeViewProps {
  instances: GameInstance[];
  selectedNode: GameInstance | null;
  onSelectNode: (node: GameInstance) => void;
}

interface TreeNode {
  id: string;
  name: string;
  className: string;
  path: string;
  parent: string | null;
  properties: Record<string, any>;
  children: TreeNode[];
  depth: number;
  hasChildren: boolean;
  isVisible: boolean;
}

interface FlatNode {
  node: TreeNode;
  index: number;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
}

export function TreeView({ instances, selectedNode, onSelectNode }: TreeViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["game", "game.Workspace"]));
  const [searchTerm, setSearchTerm] = useState("");

  // Optimized tree building with memoization and efficient data structures
  const treeData = useMemo(() => {
    if (instances.length === 0) return [];

    // Use Map for O(1) lookups instead of array.find
    const nodeMap = new Map<string, TreeNode>();
    const pathToParentMap = new Map<string, string>();
    
    // Single pass: create nodes and build proper parent relationships
    instances.forEach(instance => {
      const pathSegments = instance.path.split('.');
      const parentPath = pathSegments.length > 1 ? pathSegments.slice(0, -1).join('.') : null;
      
      // Store the parent relationship based on path hierarchy
      if (parentPath) {
        pathToParentMap.set(instance.path, parentPath);
      }

      nodeMap.set(instance.path, {
        ...instance,
        parent: parentPath, // Use the calculated parent path, not the original parent field
        children: [],
        depth: pathSegments.length - 1,
        hasChildren: false,
        isVisible: true,
      });
    });

    // Build tree structure efficiently - ensure all nodes have proper parents
    const rootNodes: TreeNode[] = [];
    const orphanNodes: TreeNode[] = [];
    
    // Ensure we always have a root 'game' node even if not in data
    if (!nodeMap.has('game')) {
      nodeMap.set('game', {
        id: 'game_root',
        name: 'game',
        className: 'DataModel', 
        path: 'game',
        parent: null,
        properties: {},
        children: [],
        depth: 0,
        hasChildren: true,
        isVisible: true,
      });
      pathToParentMap.delete('game'); // Ensure game has no parent
      // Auto-expand game node
      if (!expandedNodes.has('game')) {
        setExpandedNodes(prev => new Set([...prev, 'game']));
      }
    }
    
    // Pre-create essential service nodes if they don't exist but we have children for them
    const essentialServices = ['Workspace', 'Players', 'Lighting', 'ReplicatedStorage', 'ServerStorage', 'StarterGui', 'StarterPlayer', 'StarterPack'];
    essentialServices.forEach(serviceName => {
      const servicePath = `game.${serviceName}`;
      const hasChildrenForService = instances.some(inst => inst.path.startsWith(servicePath + '.') || inst.path === servicePath);
      
      if (hasChildrenForService && !nodeMap.has(servicePath)) {
        nodeMap.set(servicePath, {
          id: `service_${serviceName}`,
          name: serviceName,
          className: serviceName,
          path: servicePath,
          parent: 'game',
          properties: {},
          children: [],
          depth: 1,
          hasChildren: false,
          isVisible: true,
        });
        pathToParentMap.set(servicePath, 'game');
      }
    });
    
    
    // First pass: try to place all nodes with their immediate parents
    for (const [path, node] of Array.from(nodeMap.entries())) {
      const parentPath = pathToParentMap.get(path);
      
      if (parentPath) {
        const parentNode = nodeMap.get(parentPath);
        if (parentNode) {
          parentNode.children.push(node);
          parentNode.hasChildren = true;
        } else {
          // Parent doesn't exist yet, this is an orphan
          orphanNodes.push(node);
        }
      } else if (path === 'game') {
        // Game is always the root
        rootNodes.push(node);
      } else {
        // Non-game root nodes are orphans that need to be handled
        orphanNodes.push(node);
      }
    }
    
    // Second pass: handle orphaned nodes by finding their closest existing ancestor
    orphanNodes.forEach(orphan => {
      const pathSegments = orphan.path.split('.');
      let placed = false;
      
      // Try to find the closest existing parent by walking up the path
      for (let i = pathSegments.length - 2; i >= 0; i--) {
        const ancestorPath = pathSegments.slice(0, i + 1).join('.');
        const ancestorNode = nodeMap.get(ancestorPath);
        
        if (ancestorNode) {
          // Create intermediate nodes if needed
          let currentParent = ancestorNode;
          
          for (let j = i + 1; j < pathSegments.length - 1; j++) {
            const intermediatePath = pathSegments.slice(0, j + 1).join('.');
            let intermediateNode = nodeMap.get(intermediatePath);
            
            if (!intermediateNode) {
              // Create a placeholder intermediate node with proper className
              const nodeName = pathSegments[j];
              let nodeClass = 'Folder'; // Default
              
              // Set proper class names for known Roblox services
              if (nodeName === 'Workspace') nodeClass = 'Workspace';
              else if (nodeName === 'Players') nodeClass = 'Players';
              else if (nodeName === 'Lighting') nodeClass = 'Lighting';
              else if (nodeName === 'ReplicatedStorage') nodeClass = 'ReplicatedStorage';
              else if (nodeName === 'ServerStorage') nodeClass = 'ServerStorage';
              else if (nodeName === 'StarterGui') nodeClass = 'StarterGui';
              else if (nodeName === 'StarterPlayer') nodeClass = 'StarterPlayer';
              else if (nodeName === 'StarterPack') nodeClass = 'StarterPack';
              
              intermediateNode = {
                id: `placeholder_${intermediatePath}`,
                name: nodeName,
                className: nodeClass,
                path: intermediatePath,
                parent: currentParent.path,
                properties: {},
                children: [],
                depth: j,
                hasChildren: false,
                isVisible: true,
              };
              
              nodeMap.set(intermediatePath, intermediateNode);
              currentParent.children.push(intermediateNode);
              currentParent.hasChildren = true;
            }
            
            currentParent = intermediateNode;
          }
          
          // Now place the orphan under its proper parent
          currentParent.children.push(orphan);
          currentParent.hasChildren = true;
          placed = true;
          break;
        }
      }
      
      // If we still couldn't place it, add to root as last resort
      if (!placed) {
        rootNodes.push(orphan);
      }
    });

    // Optimized sorting with localeCompare options and special ordering for root services
    const sortOptions: Intl.CollatorOptions = { numeric: true, sensitivity: 'base' };
    
    const getServicePriority = (name: string) => {
      const priorities: Record<string, number> = {
        'game': 0,
        'Workspace': 1,
        'Players': 2,
        'Lighting': 3,
        'ReplicatedStorage': 4,
        'ServerStorage': 5,
        'StarterGui': 6,
        'StarterPlayer': 7,
        'StarterPack': 8,
      };
      return priorities[name] ?? 999;
    };
    
    const sortTree = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => {
        const priorityA = getServicePriority(a.name);
        const priorityB = getServicePriority(b.name);
        
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        
        return a.name.localeCompare(b.name, undefined, sortOptions);
      });
      
      nodes.forEach(node => {
        if (node.children.length > 0) {
          sortTree(node.children);
        }
      });
    };

    sortTree(rootNodes);
    return rootNodes;
  }, [instances]);

  // Optimized search with efficient filtering and indexing
  const { filteredNodes, searchResults } = useMemo(() => {
    if (!searchTerm) {
      return { filteredNodes: treeData, searchResults: new Set<string>() };
    }

    const searchLower = searchTerm.toLowerCase();
    const matchingPaths = new Set<string>();
    const ancestorPaths = new Set<string>();
    
    // Build path-to-parent lookup for efficient ancestor traversal
    const pathParentMap = new Map<string, string>();
    instances.forEach(instance => {
      if (instance.parent) {
        pathParentMap.set(instance.path, instance.parent);
      }
    });

    // Find all matching nodes efficiently
    instances.forEach(instance => {
      if (instance.name.toLowerCase().includes(searchLower) ||
          instance.className.toLowerCase().includes(searchLower)) {
        matchingPaths.add(instance.path);
        
        // Add all ancestors efficiently using path-based hierarchy
        const pathSegments = instance.path.split('.');
        for (let i = pathSegments.length - 2; i >= 0; i--) {
          const ancestorPath = pathSegments.slice(0, i + 1).join('.');
          if (!ancestorPaths.has(ancestorPath)) {
            ancestorPaths.add(ancestorPath);
          }
        }
      }
    });

    const allVisiblePaths = new Set([...Array.from(matchingPaths), ...Array.from(ancestorPaths)]);

    // Efficiently filter tree by marking visibility
    const filterTree = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.reduce((filtered, node) => {
        if (allVisiblePaths.has(node.path)) {
          const filteredNode = {
            ...node,
            children: filterTree(node.children),
            isVisible: true,
          };
          filtered.push(filteredNode);
        }
        return filtered;
      }, [] as TreeNode[]);
    };

    return { 
      filteredNodes: filterTree(treeData), 
      searchResults: matchingPaths 
    };
  }, [treeData, searchTerm, instances]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allPaths = new Set<string>();
    const collectPaths = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.hasChildren) {
          allPaths.add(node.path);
        }
        collectPaths(node.children);
      });
    };
    collectPaths(filteredNodes);
    setExpandedNodes(allPaths);
  }, [filteredNodes]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set(["game", "game.Workspace"]));
  }, []);

  // Flatten tree for virtualization
  const flattenedNodes = useMemo(() => {
    const flattened: FlatNode[] = [];
    let index = 0;

    const flatten = (nodes: TreeNode[], depth = 0) => {
      nodes.forEach(node => {
        const isExpanded = expandedNodes.has(node.path);
        flattened.push({
          node,
          index: index++,
          depth,
          isExpanded,
          hasChildren: node.hasChildren,
        });
        
        if (node.hasChildren && isExpanded) {
          flatten(node.children, depth + 1);
        }
      });
    };

    flatten(filteredNodes);
    return flattened;
  }, [filteredNodes, expandedNodes]);

  // Virtual scrolling setup
  const containerRef = useRef<HTMLDivElement>(null);
  const [virtualState, setVirtualState] = useState({
    scrollTop: 0,
    containerHeight: 0,
  });
  const [isInitialized, setIsInitialized] = useState(false);
  
  const ITEM_HEIGHT = 24; // Height of each tree item
  const OVERSCAN = 5; // Render extra items for smooth scrolling
  
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setVirtualState(prev => ({
          ...prev,
          containerHeight: containerRef.current!.clientHeight,
        }));
      }
    };
    
    // Initialize immediately and set up observers
    const initialize = () => {
      updateHeight();
      setIsInitialized(true);
    };
    
    // Try immediate initialization
    if (containerRef.current) {
      initialize();
    } else {
      // Wait a bit for DOM to be ready
      const initTimeout = setTimeout(initialize, 10);
    }
    
    // Set up resize observer for dynamic updates
    const resizeObserver = new ResizeObserver(updateHeight);
    
    const observeWhenReady = () => {
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      } else {
        setTimeout(observeWhenReady, 10);
      }
    };
    
    observeWhenReady();
    
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    
    setVirtualState(prev => ({
      ...prev,
      scrollTop,
    }));
  }, []);

  // Calculate visible range with proper bounds checking
  const containerHeight = Math.max(virtualState.containerHeight, 400); // Default height if not initialized
  const scrollTop = Math.max(virtualState.scrollTop, 0);
  
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT) + (OVERSCAN * 2);
  const endIndex = Math.min(flattenedNodes.length - 1, startIndex + visibleCount);
  
  const visibleNodes = flattenedNodes.slice(startIndex, endIndex + 1);
  const totalHeight = flattenedNodes.length * ITEM_HEIGHT;
  const offsetY = startIndex * ITEM_HEIGHT;

  // Memoized icon lookup with cached results
  const iconMap = useMemo(() => ({
    'DataModel': Gamepad2,
    'Workspace': CubeIcon,
    'Players': Users,
    'Player': User,
    'Lighting': Lightbulb,
    'ReplicatedStorage': Database,
    'ServerStorage': Shield,
    'StarterGui': Monitor,
    'StarterPack': Package,
    'StarterPlayer': User,
    'SoundService': Volume2,
    'TweenService': Zap,
    'UserInputService': Settings,
    'RunService': Settings,
    'HttpService': Settings,
    'Teams': Users,
    'Chat': Settings,
    'Part': Box,
    'Model': Layers,
    'Camera': Camera,
    'Terrain': Layers,
    'SpawnLocation': Circle,
    'Script': Code,
    'LocalScript': FileCode,
    'ModuleScript': Package,
    'Folder': Folder,
    'Tool': Settings,
    'Accessory': Palette,
    'Attachment': Circle,
    'MeshPart': Box,
    'UnionOperation': Box,
    'WeldConstraint': Circle,
    'Motor6D': Circle,
    'Humanoid': User,
    'BodyVelocity': Zap,
    'BodyPosition': Zap,
    'BodyAngularVelocity': Zap,
    'Fire': Zap,
    'Smoke': Circle,
    'Explosion': Zap,
    'Sound': Volume2,
    'ClickDetector': Circle,
    'ProximityPrompt': Circle,
    'BillboardGui': Monitor,
    'SurfaceGui': Monitor,
    'ScreenGui': Monitor,
    'Frame': Box,
    'TextLabel': Settings,
    'TextButton': Settings,
    'ImageLabel': Palette,
    'ImageButton': Palette,
    'ScrollingFrame': Box,
    'TextBox': Settings,
    'RemoteEvent': Zap,
    'RemoteFunction': Zap,
    'BindableEvent': Circle,
    'BindableFunction': Circle,
    'IntValue': Settings,
    'NumberValue': Settings,
    'StringValue': Settings,
    'BoolValue': Settings,
    'ObjectValue': Settings,
    'Vector3Value': Settings,
    'CFrameValue': Settings,
    'RayValue': Settings,
    'BrickColorValue': Palette,
    'Color3Value': Palette,
  }), []);

  const getIconForClass = useCallback((className: string) => {
    return iconMap[className as keyof typeof iconMap] || Circle;
  }, [iconMap]);

  // Memoized tree node component for performance
  const TreeNodeItem = memo(({ flatNode, isSelected, onSelect, onToggleExpand }: {
    flatNode: FlatNode;
    isSelected: boolean;
    onSelect: () => void;
    onToggleExpand: () => void;
  }) => {
    const { node, depth, isExpanded, hasChildren } = flatNode;
    const IconComponent = getIconForClass(node.className);
    const isHighlighted = searchResults.has(node.path);

    return (
      <div
        className={`tree-node flex items-center py-1 px-2 cursor-pointer text-xs transition-colors ${
          isSelected ? 'bg-[var(--dex-hover)]' : ''
        } ${isHighlighted ? 'bg-yellow-100/10' : ''} hover:bg-[var(--dex-hover)]/50`}
        style={{ 
          height: ITEM_HEIGHT, 
          paddingLeft: `${8 + depth * 16}px` 
        }}
        onClick={onSelect}
        data-testid={`tree-node-${node.name}`}
      >
        <div className="w-3 mr-1 flex justify-center">
          {hasChildren && (
            <ChevronRight
              size={12}
              className={`tree-expand text-[var(--dex-text-muted)] transition-transform ${
                isExpanded ? 'rotate-90' : ''
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              data-testid={`expand-${node.name}`}
            />
          )}
        </div>
        <IconComponent size={14} className="mr-2 flex-shrink-0 text-[var(--dex-text-muted)]" />
        <span className="font-mono text-xs truncate flex-1" title={node.name}>
          {isHighlighted && searchTerm ? (
            node.name.split(new RegExp(`(${searchTerm})`, 'gi')).map((part, i) => (
              part.toLowerCase() === searchTerm.toLowerCase() ? (
                <mark key={i} className="bg-yellow-400/30 text-yellow-100 rounded px-0.5">{part}</mark>
              ) : part
            ))
          ) : (
            node.name
          )}
        </span>
        <span className="text-[10px] text-[var(--dex-text-muted)] ml-1 opacity-70">
          {node.className}
        </span>
      </div>
    );
  });

  return (
    <>
      <div className="bg-[var(--dex-panel)] border-b border-[var(--dex-border)] p-3">
        <div className="flex items-center space-x-2 mb-3">
          <h3 className="font-medium text-sm">Explorer</h3>
          <div className="flex-1"></div>
          <button 
            className="text-[var(--dex-text-muted)] hover:text-[var(--dex-text)] p-1" 
            title="Refresh"
            data-testid="button-refresh"
          >
            <RotateCcw size={12} />
          </button>
          <button 
            className="text-[var(--dex-text-muted)] hover:text-[var(--dex-text)] p-1" 
            title="Expand All"
            onClick={expandAll}
            data-testid="button-expand-all"
          >
            <Expand size={12} />
          </button>
          <button 
            className="text-[var(--dex-text-muted)] hover:text-[var(--dex-text)] p-1" 
            title="Collapse All"
            onClick={collapseAll}
            data-testid="button-collapse-all"
          >
            <Minimize size={12} />
          </button>
        </div>
        
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search objects..." 
            className="w-full bg-[var(--dex-bg)] border border-[var(--dex-border)] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--dex-accent)]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search"
          />
          <Search size={12} className="absolute right-3 top-2 text-[var(--dex-text-muted)]" />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div 
          ref={containerRef}
          className="h-full overflow-y-auto custom-scrollbar" 
          data-testid="tree-container"
          onScroll={handleScroll}
        >
          {flattenedNodes.length === 0 ? (
            <div className="p-4 text-center text-[var(--dex-text-muted)] text-xs">
              {instances.length === 0 ? 'No game data received' : 'No matching objects'}
              {/* Debug info */}
              {instances.length > 0 && (
                <div className="mt-2 text-[10px] opacity-50">
                  Raw paths: {instances.slice(0, 5).map(i => i.path).join(', ')}
                  {instances.length > 5 && '...'}
                </div>
              )}
            </div>
          ) : flattenedNodes.length > 0 ? (
            <div style={{ height: Math.max(totalHeight, containerHeight), position: 'relative' }}>
              <div style={{ transform: `translateY(${offsetY}px)` }}>
                {visibleNodes.map((flatNode) => {
                  const isSelected = selectedNode?.path === flatNode.node.path;
                  const instance = instances.find(i => i.path === flatNode.node.path);
                  if (!instance && !flatNode.node.path.startsWith('placeholder_')) return null;
                  
                  return (
                    <TreeNodeItem
                      key={flatNode.node.path}
                      flatNode={flatNode}
                      isSelected={isSelected}
                      onSelect={() => instance && onSelectNode(instance)}
                      onToggleExpand={() => toggleExpanded(flatNode.node.path)}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-[var(--dex-text-muted)] text-xs">
              {isInitialized ? 'Loading tree view...' : 'Initializing...'}
            </div>
          )}
          {searchTerm && (
            <div className="sticky bottom-0 bg-[var(--dex-panel)] border-t border-[var(--dex-border)] px-3 py-2 text-xs text-[var(--dex-text-muted)]">
              Found {searchResults.size} match{searchResults.size !== 1 ? 'es' : ''} in {flattenedNodes.length} visible nodes
            </div>
          )}
        </div>
      </div>
    </>
  );
}
