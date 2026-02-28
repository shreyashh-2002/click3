
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";
import { Upload, Code, SquareAsterisk, Search, Filter } from 'lucide-react';
import ThreeScene from '@/components/three-scene';
import CodeGeneratorPanel from '@/components/code-generator-panel';
import CornersGeneratorPanel from '@/components/corners-generator-panel';
import MeshSearchPanel, { type MeshInfo } from '@/components/mesh-search-panel';
import MeshFilterPanel from '@/components/mesh-filter-panel';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
} from "@/components/ui/sidebar"
import { Separator } from '@/components/ui/separator';

export default function Home() {
  const [sceneClick, setSceneClick] = useState<THREE.Vector3 | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showCornersGenerator, setShowCornersGenerator] = useState(false);
  const [showMeshSearch, setShowMeshSearch] = useState(false);
  const [showMeshFilter, setShowMeshFilter] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<MeshInfo[]>([]);

  const [yFilter, setYFilter] = useState<{y: number, corners?: string, enabled: boolean} | null>(null);
  const [yFilterResults, setYFilterResults] = useState<string[]>([]);

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

  const handleFilter = (params: { y: number, corners?: string }) => {
    setYFilter({ ...params, enabled: true });
  };

  const handleFilterResults = useCallback((results: string[]) => {
    setYFilterResults(results);
    setYFilter(f => f ? { ...f, enabled: false } : null); // Reset trigger
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
                <Code className="size-5" />
              </div>
              <div className="flex flex-col gap-0.5 overflow-hidden group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold leading-none">Click Tracer</span>
                <span className="truncate text-xs text-muted-foreground">3D Dev Tool</span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Generators</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setShowGenerator(!showGenerator)}
                      isActive={showGenerator}
                      tooltip="Generator 1"
                    >
                      <Code />
                      <span>Generator 1</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setShowCornersGenerator(!showCornersGenerator)}
                      isActive={showCornersGenerator}
                      tooltip="Generator 2"
                    >
                      <SquareAsterisk />
                      <span>Generator 2</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setShowMeshSearch(!showMeshSearch)}
                      isActive={showMeshSearch}
                      tooltip="Generator 3"
                    >
                      <Search />
                      <span>Generator 3</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setShowMeshFilter(!showMeshFilter)}
                      isActive={showMeshFilter}
                      tooltip="Generator 4"
                    >
                      <Filter />
                      <span>Generator 4</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            
            <SidebarGroup className="mt-auto">
              <SidebarGroupLabel>Actions</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleUploadClick} tooltip="Upload .GLB/.GLTF">
                      <Upload />
                      <span>Upload Model</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-border/50 p-2">
            <SidebarTrigger />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="relative flex flex-col min-w-0 h-full">
          <main className="flex-1 relative overflow-hidden">
            <ThreeScene 
              onCoordChange={handleCoordChange} 
              modelUrl={modelUrl}
              searchTerm={searchTerm}
              onSearchResults={handleSearchResults}
              yFilter={yFilter}
              onYFilterResults={handleFilterResults}
            />

            {showGenerator && (
              <CodeGeneratorPanel
                anchor={sceneClick}
                initialPosition={{ x: 20, y: 20 }}
              />
            )}

            {showCornersGenerator && (
              <CornersGeneratorPanel
                lastClick={sceneClick}
                initialPosition={{ x: 410, y: 20 }}
              />
            )}
            
            {showMeshSearch && (
              <MeshSearchPanel
                onSearch={handleSearch}
                results={searchResults}
                initialPosition={{ x: 800, y: 20 }}
              />
            )}

            {showMeshFilter && (
              <MeshFilterPanel
                onFilter={handleFilter}
                results={yFilterResults}
                initialPosition={{ x: 1190, y: 20 }}
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
