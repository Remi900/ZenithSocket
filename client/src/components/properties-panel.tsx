import { Copy, Code } from "lucide-react";
import type { GameInstance } from "@shared/schema";

interface PropertiesPanelProps {
  selectedNode: GameInstance | null;
}

export function PropertiesPanel({ selectedNode }: PropertiesPanelProps) {
  const getIconForClass = (className: string) => {
    const iconMap: Record<string, string> = {
      'Game': 'fas fa-gamepad text-blue-400',
      'Workspace': 'fas fa-cube text-green-400',
      'Players': 'fas fa-users text-yellow-400',
      'Player': 'fas fa-user text-blue-300',
      'Lighting': 'fas fa-lightbulb text-yellow-300',
      'ReplicatedStorage': 'fas fa-database text-orange-400',
      'StarterGui': 'fas fa-desktop text-cyan-400',
      'Part': 'fas fa-cube text-gray-400',
      'Script': 'fas fa-code text-green-300',
      'LocalScript': 'fas fa-file-code text-blue-300',
      'ModuleScript': 'fas fa-box text-purple-400',
      'Folder': 'fas fa-folder text-yellow-500',
    };
    return iconMap[className] || 'fas fa-circle text-gray-500';
  };

  const formatPropertyValue = (value: any): { formatted: string; className: string } => {
    if (value === null || value === undefined) {
      return { formatted: 'nil', className: 'text-gray-400' };
    }
    
    if (typeof value === 'boolean') {
      return { formatted: value.toString(), className: 'text-blue-300' };
    }
    
    if (typeof value === 'string') {
      return { formatted: `"${value}"`, className: 'text-green-300' };
    }
    
    if (typeof value === 'number') {
      return { formatted: value.toString(), className: 'text-orange-300' };
    }
    
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return { formatted: `[${value.length} items]`, className: 'text-purple-300' };
      }
      
      // Handle Vector3, Color3, etc.
      if (value.X !== undefined && value.Y !== undefined && value.Z !== undefined) {
        return { formatted: `${value.X}, ${value.Y}, ${value.Z}`, className: 'text-orange-300' };
      }
      
      if (value.R !== undefined && value.G !== undefined && value.B !== undefined) {
        return { formatted: `${Math.round(value.R * 255)}, ${Math.round(value.G * 255)}, ${Math.round(value.B * 255)}`, className: 'text-cyan-300' };
      }
      
      return { formatted: JSON.stringify(value), className: 'text-purple-300' };
    }
    
    return { formatted: value.toString(), className: 'text-[var(--dex-text)]' };
  };

  const copyPath = () => {
    if (selectedNode) {
      navigator.clipboard.writeText(selectedNode.path);
    }
  };

  if (!selectedNode) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-[var(--dex-text-muted)]">
          <i className="fas fa-mouse-pointer text-2xl mb-2 block"></i>
          <p className="text-sm">Select an object to view its properties</p>
        </div>
      </div>
    );
  }

  const properties = Object.entries(selectedNode.properties || {});
  
  return (
    <>
      <div className="bg-[var(--dex-panel)] border-b border-[var(--dex-border)] p-3">
        <div className="flex items-center space-x-2 mb-2">
          <i className={`${getIconForClass(selectedNode.className)} text-sm`} />
          <h3 className="font-medium text-sm" data-testid="selected-object-name">
            {selectedNode.name}
          </h3>
          <span className="text-xs text-[var(--dex-text-muted)]" data-testid="selected-object-class">
            ({selectedNode.className})
          </span>
        </div>
        <div className="text-xs text-[var(--dex-text-muted)] font-mono" data-testid="selected-object-path">
          {selectedNode.path}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto custom-scrollbar">
          <div className="p-3 space-y-1">
            {/* Show built-in properties first */}
            <div className="border-b border-[var(--dex-border)] pb-2 mb-3">
              <div className="flex items-center justify-between py-1">
                <span className="font-mono text-xs text-[var(--dex-text-muted)]">Name</span>
                <span className="font-mono text-xs text-green-300">"{selectedNode.name}"</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="font-mono text-xs text-[var(--dex-text-muted)]">Parent</span>
                <span className="font-mono text-xs text-green-300">
                  "{(() => {
                    const pathSegments = selectedNode.path.split('.');
                    return pathSegments.length > 1 ? pathSegments.slice(0, -1).join('.') : 'nil';
                  })()}"
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="font-mono text-xs text-[var(--dex-text-muted)]">ClassName</span>
                <span className="font-mono text-xs text-green-300">"{selectedNode.className}"</span>
              </div>
            </div>
            
            {properties.length === 0 ? (
              <div className="text-center text-[var(--dex-text-muted)] text-xs py-4">
                No additional properties
              </div>
            ) : (
              properties.map(([key, value]) => {
                // Skip built-in properties we're showing above
                if (['Name', 'Parent', 'ClassName', 'name', 'parent', 'className'].includes(key)) {
                  return null;
                }
                
                const { formatted, className } = formatPropertyValue(value);
                
                return (
                  <div key={key} className="flex items-center justify-between py-1" data-testid={`property-${key}`}>
                    <span className="font-mono text-xs text-[var(--dex-text-muted)]">
                      {key}
                    </span>
                    <div className="flex items-center space-x-2">
                      {key === 'BrickColor' && typeof value === 'object' && value?.Color && (
                        <div 
                          className="w-3 h-3 rounded-sm border border-[var(--dex-border)]"
                          style={{ 
                            backgroundColor: `rgb(${Math.round(value.Color.R * 255)}, ${Math.round(value.Color.G * 255)}, ${Math.round(value.Color.B * 255)})` 
                          }}
                        />
                      )}
                      <span className={`font-mono text-xs ${className}`}>
                        {formatted}
                      </span>
                    </div>
                  </div>
                );
              }).filter(Boolean)
            )}
          </div>
        </div>
      </div>

      <div className="bg-[var(--dex-panel)] border-t border-[var(--dex-border)] p-2 flex items-center justify-between text-xs text-[var(--dex-text-muted)]">
        <span data-testid="property-count">
          {properties.filter(([key]) => !['Name', 'Parent', 'ClassName', 'name', 'parent', 'className'].includes(key)).length + 3} properties
        </span>
        <div className="flex items-center space-x-2">
          <button 
            className="hover:text-[var(--dex-text)]" 
            title="Copy Path"
            onClick={copyPath}
            data-testid="button-copy-path"
          >
            <Copy size={12} />
          </button>
          <button 
            className="hover:text-[var(--dex-text)]" 
            title="View Source"
            data-testid="button-view-source"
          >
            <Code size={12} />
          </button>
        </div>
      </div>
    </>
  );
}
