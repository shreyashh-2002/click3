
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
    <main className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <ThreeScene 
        onCoordChange={handleCoordChange} 
        modelUrl={modelUrl}
        searchTerm={searchTerm}
        onSearchResults={handleSearchResults}
        yFilter={yFilter}
        onYFilterResults={handleFilterResults}
      />

      <header className="absolute top-0 left-0 p-4 z-10 w-full flex justify-between items-start">
        <div className="flex items-center gap-2 p-2 bg-background/80 rounded-lg backdrop-blur-sm border border-border/50">
            <Button onClick={() => setShowGenerator(c => !c)} variant={showGenerator ? "secondary" : "default"} size="sm">
                <Code className="mr-2 h-4 w-4" />
                Generator
            </Button>
            <Button onClick={() => setShowCornersGenerator(c => !c)} variant={showCornersGenerator ? "secondary" : "default"} size="sm">
                <SquareAsterisk className="mr-2 h-4 w-4" />
                Generator 2
            </Button>
            <Button onClick={() => setShowMeshSearch(c => !c)} variant={showMeshSearch ? "secondary" : "default"} size="sm">
                <Search className="mr-2 h-4 w-4" />
                Generator 3
            </Button>
            <Button onClick={() => setShowMeshFilter(c => !c)} variant={showMeshFilter ? "secondary" : "default"} size="sm">
                <Filter className="mr-2 h-4 w-4" />
                Generator 4
            </Button>
        </div>
        <div className="flex items-center gap-2 p-2 bg-background/80 rounded-lg backdrop-blur-sm border border-border/50">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".gltf,.glb"
            />
            <Button onClick={handleUploadClick} size="sm">
              <Upload className="mr-2 h-4 w-4" />
              Upload Model
            </Button>
        </div>
      </header>
      
      {showGenerator && (
        <CodeGeneratorPanel
          anchor={sceneClick}
          initialPosition={{ x: 30, y: 120 }}
        />
      )}

      {showCornersGenerator && (
        <CornersGeneratorPanel
          lastClick={sceneClick}
          initialPosition={{ x: 420, y: 120 }}
        />
      )}
      
      {showMeshSearch && (
        <MeshSearchPanel
          onSearch={handleSearch}
          results={searchResults}
          initialPosition={{ x: 810, y: 120 }}
        />
      )}

      {showMeshFilter && (
        <MeshFilterPanel
          onFilter={handleFilter}
          results={yFilterResults}
          initialPosition={{ x: 1200, y: 120 }}
        />
      )}

      {sceneClick && (
        <div className="absolute bottom-4 right-4 z-20 p-3 bg-background/80 rounded-lg backdrop-blur-sm border border-border/50 font-mono text-xs space-y-1 w-48">
          <p><span className="font-bold text-primary">X:</span> {sceneClick.x.toFixed(4)}</p>
          <p><span className="font-bold text-primary">Y:</span> {sceneClick.y.toFixed(4)}</p>
          <p><span className="font-bold text-primary">Z:</span> {sceneClick.z.toFixed(4)}</p>
        </div>
      )}
    </main>
  );
}
