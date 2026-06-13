"use client";

import { useState } from 'react';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Copy, Navigation, Search, Tag } from 'lucide-react';
import DraggablePanel from './draggable-panel';

export type MeshListItem = {
  name: string;
  center: THREE.Vector3;
};

type MeshNamesPanelProps = {
  meshes: MeshListItem[];
  onSelectMesh: (mesh: MeshListItem) => void;
  selectedMeshName: string | null;
  initialPosition: { x: number; y: number };
  labelMode: 'none' | 'name' | 'coords';
  onLabelModeChange: (mode: 'none' | 'name' | 'coords') => void;
  labelPrefix: string;
  onLabelPrefixChange: (prefix: string) => void;
};

export default function MeshNamesPanel({
  meshes,
  onSelectMesh,
  selectedMeshName,
  initialPosition,
  labelMode,
  onLabelModeChange,
  labelPrefix,
  onLabelPrefixChange,
}: MeshNamesPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const handleCopyAll = () => {
    if (meshes.length === 0) return;
    const names = Array.from(new Set(meshes.map(m => m.name))).join('\n');
    navigator.clipboard.writeText(names);
    toast({
      title: "Copied!",
      description: `Copied all ${meshes.length} names to clipboard.`,
    });
  };

  const filteredMeshes = meshes.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DraggablePanel
      id="mesh-names-panel"
      title="Mesh Names"
      icon={<Tag className="h-5 w-5 text-primary" />}
      description="View, search and locate all loaded mesh names."
      initialPosition={initialPosition}
      className="w-96"
    >
      <div className="space-y-4">
        {/* Label Mode Selection */}
        <div className="space-y-2 border-b border-border/40 pb-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Tag className="size-3.5 text-primary" />
            3D Canvas Label Overlay
          </label>
          <div className="grid grid-cols-3 gap-1 p-1 bg-muted/40 rounded-lg border border-border/35">
            <button
              onClick={() => onLabelModeChange('none')}
              className={`text-[11px] py-1 px-1.5 rounded-md font-medium cursor-pointer transition-all ${
                labelMode === 'none'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40'
              }`}
            >
              Off
            </button>
            <button
              onClick={() => onLabelModeChange('name')}
              className={`text-[11px] py-1 px-1.5 rounded-md font-medium cursor-pointer transition-all ${
                labelMode === 'name'
                  ? 'bg-background text-primary shadow-sm font-semibold border-l border-primary/20'
                  : 'text-muted-foreground hover:bg-muted/40'
              }`}
            >
              Names Begins
            </button>
            <button
              onClick={() => onLabelModeChange('coords')}
              className={`text-[11px] py-1 px-1.5 rounded-md font-medium cursor-pointer transition-all ${
                labelMode === 'coords'
                  ? 'bg-background text-primary shadow-sm font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40'
              }`}
            >
              Coordinates
            </button>
          </div>

          {/* Conditional Input for filter prefix */}
          {labelMode !== 'none' && (
            <div className="space-y-1.5 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="text-[9px] font-mono text-muted-foreground">
                Prefix Filter (Starts with, e.g. FAS):
              </label>
              <Input
                type="text"
                placeholder="Matches all if empty..."
                value={labelPrefix}
                onChange={(e) => onLabelPrefixChange(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
          )}
        </div>

        {/* Search Input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground animate-in fade-in" />
            <Input
              type="text"
              placeholder="Search meshes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 text-xs font-mono"
            />
          </div>
          <Button onClick={handleCopyAll} variant="outline" size="sm" className="h-9 gap-1 text-xs">
            <Copy className="h-3.5 w-3.5" />
            Copy All
          </Button>
        </div>

        {/* Scrollable List */}
        <div className="border border-border/50 rounded-md bg-muted/30">
          <ScrollArea className="h-72 w-full p-2">
            {filteredMeshes.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No meshes found.
              </div>
            ) : (
              <div className="space-y-1">
                {filteredMeshes.map((mesh, index) => {
                  const isSelected = selectedMeshName === mesh.name;
                  return (
                    <div
                      key={`${mesh.name}-${index}`}
                      onClick={() => onSelectMesh(mesh)}
                      className={`
                        group flex items-center justify-between p-2 rounded-md cursor-pointer transition-all duration-150 text-xs font-mono
                        ${isSelected 
                          ? 'bg-primary/20 text-primary font-semibold border-l-2 border-primary' 
                          : 'hover:bg-muted text-foreground'
                        }
                      `}
                    >
                      <div className="flex flex-col gap-0.5 truncate max-w-[220px]">
                        <span className="truncate font-medium" title={mesh.name}>
                          {mesh.name}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          Center: [{mesh.center.x.toFixed(2)}, {mesh.center.y.toFixed(2)}, {mesh.center.z.toFixed(2)}]
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6 hover:bg-primary/10 hover:text-primary"
                          title="Locate Mesh"
                        >
                          <Navigation className="size-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/40 pt-2">
          <span>Total matches: {filteredMeshes.length} / {meshes.length}</span>
          <span className="text-primary italic">Click a row to locate</span>
        </div>
      </div>
    </DraggablePanel>
  );
}
