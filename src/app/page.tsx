
"use client";

import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";
import { Info, Upload, Code } from 'lucide-react';
import ThreeScene from '@/components/three-scene';
import CodeGeneratorPanel from '@/components/code-generator-panel';
import DraggablePanel from '@/components/draggable-panel';

export default function Home() {
  const [sceneClick, setSceneClick] = useState<THREE.Vector3 | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  
  const [windowSize, setWindowSize] = useState({width: 0, height: 0});

  useEffect(() => {
    setIsClient(true);
    const handleResize = () => {
        setWindowSize({width: window.innerWidth, height: window.innerHeight});
    }
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleCoordChange = (newCoords: THREE.Vector3 | null) => {
    setSceneClick(newCoords);
  };

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
        <div className="flex items-center gap-3 bg-background/80 p-3 rounded-lg backdrop-blur-sm border border-border/50">
            <svg width="32" height="32" viewBox="0 0 24 24" className="text-primary"><path fill="currentColor" d="M20.9 8.3c-.3-.2-.6-.2-.9 0l-1.3.8c-.3.2-.4.5-.4.8v4.8c0 .3.1.6.4.8l1.3.8c.1.1.3.1.4.1s.3-.1.4-.1l1.3-.8c.3-.2.4-.5.4-.8V9.1c0-.3-.1-.6-.4-.8zM3.1 8.3c-.3-.2-.6-.2-.9 0l-1.3.8c-.3.2-.4.5-.4.8v4.8c0 .3.1.6.4.8l1.3.8c.1.1.3.1.4.1s.3-.1.4-.1l1.3-.8c.3-.2.4-.5.4-.8V9.1c0-.3-.1-.6-.4-.8zM12 2.1c-.3 0-.6.1-.9.4L4 7.6c-.3.2-.4.5-.4.8v.8c0 .3.1.6.4.8l7.1 4.2c.2.1.5.1.7 0l7.1-4.2c.3-.2.4-.5.4-.8v-.8c0-.3-.1-.6-.4-.8l-7.1-5.1c-.2-.2-.5-.4-.8-.4zm0 11.5L4.9 9.4l7.1-4.2L19.1 9.4l-7.1 4.2zM12 13.5c-.3 0-.6.1-.9.4l-7.1 5.1c-.3.2-.4.5-.4.8v.8c0 .3.1.6.4.8l7.1 4.2c.2.1.5.1.7 0l7.1-4.2c.3-.2.4-.5.4-.8v-.8c0-.3-.1-.6-.4-.8l-7.1-5.1c-.3-.3-.6-.4-.9-.4zm0 11.5l-7.1-4.2l7.1-4.2l7.1 4.2l-7.1 4.2z"></path></svg>
            <div>
                <h1 className="text-2xl font-bold font-headline">Click Tracer</h1>
                <p className="text-sm text-muted-foreground">Click on the model to get coordinates</p>
            </div>
        </div>
        <div className="flex items-center gap-2 p-2 bg-background/80 rounded-lg backdrop-blur-sm border border-border/50">
            <Button onClick={() => setShowGenerator(c => !c)} variant={showGenerator ? "secondary" : "outline"} size="sm">
                <Code className="mr-2 h-4 w-4" />
                Generator
            </Button>
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

      <DraggablePanel
        id="coords-panel"
        title="Scene Coordinates"
        icon={<Info className="h-5 w-5 text-primary" />}
        description={sceneClick ? "Information about the selected point." : "Click on the model to see details."}
        initialPosition={{ x: windowSize.width - 450, y: windowSize.height - 200 }}
        className="w-96"
      >
        <div className="space-y-4">
            <div>
              {sceneClick ? (
                <div className="p-3 bg-muted rounded-lg font-mono text-xs space-y-1">
                  <p><span className="font-bold text-primary">X:</span> {sceneClick.x.toFixed(4)}</p>
                  <p><span className="font-bold text-primary">Y:</span> {sceneClick.y.toFixed(4)}</p>
                  <p><span className="font-bold text-primary">Z:</span> {sceneClick.z.toFixed(4)}</p>
                </div>
              ) : (
                <p className="text-muted-foreground italic text-sm text-center py-4">No point selected.</p>
              )}
            </div>
        </div>
      </DraggablePanel>
    </main>
  );
}
