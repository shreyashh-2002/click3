"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";
import { Upload, SquareAsterisk, Search, Layout, ChevronRight } from 'lucide-react';
import ThreeScene from '@/components/three-scene';
import CornersGeneratorPanel from '@/components/corners-generator-panel';
import MeshSearchPanel, { type MeshInfo } from '@/components/mesh-search-panel';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  SidebarFooter,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

export default function Home() {
  const [sceneClick, setSceneClick] = useState<THREE.Vector3 | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isClient, setIsClient] = useState(false);
  
  // States for active panels
  const [showCornersGenerator, setShowCornersGenerator] = useState(false);
  const [showMeshSearch, setShowMeshSearch] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<MeshInfo[]>([]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleCoordChange = useCallback((newCoords: THREE.Vector3 | null) => {
    setSceneClick(newCoords);
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setModelUrl(url);
      setSceneClick(null);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleSearch = (term: string) => {
    setSearchTerm(term);
  };
  
  const handleSearchResults = useCallback((results: MeshInfo[]) => {
    setSearchResults(results);
  }, []);

  if (!isClient) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-border/50">
            <div className="flex items-center gap-2 px-2 py-4">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <SquareAsterisk className="size-5" />
              </div>
              <div className="flex flex-col gap-0.5 overflow-hidden group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold leading-none">Click Tracer</span>
                <span className="truncate text-xs text-muted-foreground">3D Dev Tool</span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <Collapsible asChild defaultOpen className="group/collapsible">
                      <div>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton tooltip="UI Options">
                            <Layout className="size-4" />
                            <span>UI</span>
                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton 
                                onClick={() => setShowCornersGenerator(!showCornersGenerator)}
                                isActive={showCornersGenerator}
                              >
                                <SquareAsterisk className="size-4 mr-2" />
                                <span>Coordinates</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton 
                                onClick={() => setShowMeshSearch(!showMeshSearch)}
                                isActive={showMeshSearch}
                              >
                                <Search className="size-4 mr-2" />
                                <span>Mesh Extraction</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-border/50 p-2">
            <SidebarTrigger />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="relative flex flex-col min-w-0 h-full overflow-hidden">
          <main className="flex-1 relative overflow-hidden">
            <ThreeScene 
              onCoordChange={handleCoordChange} 
              modelUrl={modelUrl}
              searchTerm={searchTerm}
              onSearchResults={handleSearchResults}
            />

            {/* Floating Upload Button - Top Right */}
            <div className="absolute top-4 right-4 z-30 floating-action-button">
              <Button onClick={handleUploadClick} className="shadow-2xl gap-2">
                <Upload className="size-4" />
                Upload Model
              </Button>
            </div>

            {showCornersGenerator && (
              <CornersGeneratorPanel
                lastClick={sceneClick}
                initialPosition={{ x: 20, y: 20 }}
              />
            )}
            
            {showMeshSearch && (
              <MeshSearchPanel
                onSearch={handleSearch}
                results={searchResults}
                initialPosition={{ x: 420, y: 20 }}
              />
            )}

            {sceneClick && (
              <div className="absolute bottom-4 right-4 z-20 p-3 bg-background/80 rounded-lg backdrop-blur-sm border border-border/50 font-mono text-xs space-y-1 w-48 shadow-xl">
                <p><span className="font-bold text-primary">X:</span> {sceneClick.x.toFixed(4)}</p>
                <p><span className="font-bold text-primary">Y:</span> {sceneClick.y.toFixed(4)}</p>
                <p><span className="font-bold text-primary">Z:</span> {sceneClick.z.toFixed(4)}</p>
              </div>
            )}
          </main>
        </SidebarInset>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".gltf,.glb"
        />
      </div>
    </SidebarProvider>
  );
}
