import { useState, useRef, useCallback } from "react";
import { StatusBar } from "@/components/status-bar";
import { TreeView } from "@/components/tree-view";
import { PropertiesPanel } from "@/components/properties-panel";
import { useWebSocket } from "@/hooks/use-websocket";
import { useQuery } from "@tanstack/react-query";
import type { GameInstance, ConnectionStatus } from "@shared/schema";

export default function Explorer() {
  const [selectedNode, setSelectedNode] = useState<GameInstance | null>(null);
  const [explorerWidth, setExplorerWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: instances = [] } = useQuery<GameInstance[]>({
    queryKey: ['/api/instances'],
    refetchInterval: 2000, // Efficient polling - 2 seconds
  });

  const { data: connectionStatus } = useQuery<ConnectionStatus>({
    queryKey: ['/api/connection'],
    refetchInterval: 3000, // Efficient polling - 3 seconds
  });

  useWebSocket();

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;
    
    if (newWidth >= 200 && newWidth <= 600) {
      setExplorerWidth(newWidth);
    }
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Attach global mouse events
  useState(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => handleMouseMove(e);
    const handleGlobalMouseUp = () => handleMouseUp();

    if (isResizing) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  });

  return (
    <div className="h-screen flex flex-col bg-[var(--dex-bg)] text-[var(--dex-text)]" ref={containerRef}>
      <StatusBar connectionStatus={connectionStatus} />
      
      <div className="flex-1 flex min-h-0">
        <div 
          className="bg-[var(--dex-bg)] border-r border-[var(--dex-border)] flex flex-col"
          style={{ width: explorerWidth }}
        >
          <TreeView 
            instances={instances}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
          />
        </div>

        <div 
          className="w-1 bg-[var(--dex-border)] resizer hover:bg-[var(--dex-accent)] cursor-col-resize"
          onMouseDown={handleMouseDown}
          style={{ cursor: isResizing ? 'col-resize' : 'col-resize' }}
        />

        <div className="flex-1 bg-[var(--dex-bg)] flex flex-col min-w-0">
          <PropertiesPanel selectedNode={selectedNode} />
        </div>
      </div>
    </div>
  );
}
