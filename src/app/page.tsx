
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";
import { Info, Upload, Code } from 'lucide-react';
import ThreeScene from '@/components/three-scene';
import CodeGeneratorPanel from '@/components/code-generator-panel';

export default function Home() {
  const [sceneClick, setSceneClick] = useState<THREE.Vector3 | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  
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

  if (!isClient) {
    return null;
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <ThreeScene onCoordChange={handleCoordChange} modelUrl={modelUrl} />

      <header className="absolute top-0 left-0 p-4 z-10 w-full flex justify-between items-start">
        <div className="flex items-center gap-2 p-2 bg-background/80 rounded-lg backdrop-blur-sm border border-border/50">
            <Button onClick={() => setShowGenerator(c => !c)} variant={showGenerator ? "secondary" : "outline"} size="sm">
                <Code className="mr-2 h-4 w-4" />
                Generator
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
