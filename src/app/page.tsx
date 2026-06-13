"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";

import { Upload, SquareAsterisk, Layout, ChevronRight, Database, BookOpen, Wind, Map, Layers, Copy, Check, Tag } from 'lucide-react';



import ThreeScene from '@/components/three-scene';
import CornersGeneratorPanel from '@/components/corners-generator-panel';
import MeshExtractionPanel from '@/components/mesh-extraction-panel';
import OrdMapperPanel from '@/components/ord-mapper-panel';
import DraggablePanel from '@/components/draggable-panel';

import MeshNamesPanel, { MeshListItem } from '@/components/mesh-names-panel';

import { useToast } from '@/hooks/use-toast';
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
  const [selectedMesh, setSelectedMesh] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const { toast } = useToast();
  
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [showMeshExtraction, setShowMeshExtraction] = useState(false);

  const [showMeshNames, setShowMeshNames] = useState(false);

  const [showOrdMapper, setShowOrdMapper] = useState(false);
  const [showLms, setShowLms] = useState(false);
  const [showHvac, setShowHvac] = useState(false);
  const [showFloorLayout, setShowFloorLayout] = useState(false);


  const [labelMode, setLabelMode] = useState<'none' | 'name' | 'coords'>('none');
  const [labelPrefix, setLabelPrefix] = useState('');
  
  const [extractionParams, setExtractionParams] = useState<{ yThreshold: number; corners: number[][] } | null>(null);
  const [extractionResults, setExtractionResults] = useState<string[]>([]);
  const [meshList, setMeshList] = useState<MeshListItem[]>([]);





  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleCoordChange = useCallback((newCoords: THREE.Vector3 | null) => {
    setSceneClick(newCoords);
  }, []);


  const handleMeshListLoaded = useCallback((loadedMeshes: MeshListItem[]) => {
    setMeshList(loadedMeshes);
  }, []);

  const handleSelectMeshFromList = useCallback((mesh: MeshListItem) => {
    setSelectedMesh(mesh.name);
    // Directly update the scene pointer coordinate to mesh center
    setSceneClick(mesh.center);
    toast({
      title: "Located Mesh",
      description: `Marker moved to center of: ${mesh.name}`,
    });
  }, [toast]);


  const handleMeshSelect = useCallback((name: string | null) => {
    setSelectedMesh(name);
    setIsCopied(false);
  }, []);

  const handleCopyMeshName = () => {
    if (selectedMesh) {
      navigator.clipboard.writeText(selectedMesh);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      toast({
        title: "Copied!",
        description: "Mesh name copied to clipboard.",
      });
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setModelUrl(url);
      setSceneClick(null);
      setSelectedMesh(null);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleExtractionResults = useCallback((results: string[]) => {
    setExtractionResults(results);
  }, []);

  if (!isClient) return null;

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
                                onClick={() => setShowCoordinates(!showCoordinates)}
                                isActive={showCoordinates}
                              >
                                <SquareAsterisk className="size-4 mr-2" />
                                <span>Coordinates</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton 
                                onClick={() => setShowMeshExtraction(!showMeshExtraction)}
                                isActive={showMeshExtraction}
                              >
                                <Layers className="size-4 mr-2" />
                                <span>Mesh Extraction</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton 
                                onClick={() => setShowMeshNames(!showMeshNames)}
                                isActive={showMeshNames}
                              >
                                <Tag className="size-4 mr-2" />
                                <span>Mesh Names</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>

                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <Collapsible asChild className="group/collapsible">
                      <div>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton tooltip="ORD Options">
                            <Database className="size-4" />
                            <span>ORD</span>
                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton 
                                onClick={() => setShowOrdMapper(!showOrdMapper)}
                                isActive={showOrdMapper}
                              >
                                <Database className="size-4 mr-2" />
                                <span>ORD Mapper</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton onClick={() => setShowLms(!showLms)} isActive={showLms}>
                                <BookOpen className="size-4 mr-2" />
                                <span>LMS</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton onClick={() => setShowHvac(!showHvac)} isActive={showHvac}>
                                <Wind className="size-4 mr-2" />
                                <span>HVAC</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton onClick={() => setShowFloorLayout(!showFloorLayout)} isActive={showFloorLayout}>
                                <Map className="size-4 mr-2" />
                                <span>Floor Layout</span>
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
              onMeshSelect={handleMeshSelect}
              modelUrl={modelUrl}
              extractionParams={extractionParams}
              onExtractionResults={handleExtractionResults}

              selectedCoord={sceneClick}
              onMeshListLoaded={handleMeshListLoaded}
              labelMode={labelMode}
              labelPrefix={labelPrefix}

            />

            {/* Mesh Name Overlay (Top Left) */}
            {selectedMesh && (
              <div className="absolute top-4 left-4 z-40 mesh-name-overlay">
                <div className="flex items-center gap-2 p-3 bg-background/90 backdrop-blur-md border border-border shadow-2xl rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Selected Mesh</span>
                    <span className="text-sm font-mono font-medium text-primary truncate max-w-[250px]" title={selectedMesh}>
                      {selectedMesh}
                    </span>
                  </div>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="size-8 ml-2 hover:bg-primary/10 hover:text-primary transition-colors"
                    onClick={handleCopyMeshName}
                  >
                    {isCopied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="absolute top-4 right-4 z-30 floating-action-button">
              <Button onClick={handleUploadClick} className="shadow-2xl gap-2">
                <Upload className="size-4" />
                Upload Model
              </Button>
            </div>

            {showCoordinates && (
              <CornersGeneratorPanel
                lastClick={sceneClick}
                initialPosition={{ x: 20, y: 100 }}
              />
            )}
            
            {showMeshExtraction && (
              <MeshExtractionPanel
                onExtract={setExtractionParams}
                results={extractionResults}
                initialPosition={{ x: 420, y: 100 }}
              />
            )}


            {showMeshNames && (
              <MeshNamesPanel
                meshes={meshList}
                onSelectMesh={handleSelectMeshFromList}
                selectedMeshName={selectedMesh}
                initialPosition={{ x: 420, y: 200 }}
                labelMode={labelMode}
                onLabelModeChange={setLabelMode}
                labelPrefix={labelPrefix}
                onLabelPrefixChange={setLabelPrefix}
              />
            )}


            {showOrdMapper && <OrdMapperPanel initialPosition={{ x: 20, y: 500 }} />}

            {showLms && (
              <DraggablePanel id="lms-panel" title="LMS Integration" icon={<BookOpen className="h-5 w-5 text-primary" />} description="LMS Placeholder" initialPosition={{ x: 820, y: 100 }}>
                <div className="p-4 bg-muted rounded-md text-xs">LMS data visualization placeholder.</div>
              </DraggablePanel>
            )}

            {showHvac && (
              <DraggablePanel id="hvac-panel" title="HVAC Analysis" icon={<Wind className="h-5 w-5 text-primary" />} description="HVAC Placeholder" initialPosition={{ x: 820, y: 300 }}>
                <div className="p-4 bg-muted rounded-md text-xs">HVAC analysis placeholder.</div>
              </DraggablePanel>
            )}

            {showFloorLayout && (
              <DraggablePanel id="floor-layout-panel" title="Floor Layout" icon={<Map className="h-5 w-5 text-primary" />} description="Floor Layout Placeholder" initialPosition={{ x: 820, y: 500 }}>
                <div className="p-4 bg-muted rounded-md text-xs">Floor layout sync tools placeholder.</div>
              </DraggablePanel>
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

        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".gltf,.glb" />
      </div>
    </SidebarProvider>
  );
}