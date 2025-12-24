"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Info, Upload, Orbit, Grab } from 'lucide-react';
import ThreeScene from '@/components/three-scene';

type DraggablePanelProps = {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  children: React.ReactNode;
  initialPosition: { x: number; y: number };
  className?: string;
};

const DraggablePanel = ({ id, title, icon, description, children, initialPosition, className }: DraggablePanelProps) => {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    e.preventDefault();
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    });
  }, [isDragging]);

  const onMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div
      ref={panelRef}
      id={id}
      style={{ top: `${position.y}px`, left: `${position.x}px` }}
      className={`absolute z-20 w-80 ${className}`}
    >
      <Card className="bg-background/80 backdrop-blur-sm border-border/50 shadow-2xl">
        <CardHeader onMouseDown={onMouseDown} className="cursor-grab active:cursor-grabbing">
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
            <Grab className="w-4 h-4 ml-auto text-muted-foreground" />
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
};

// Function to map scene coordinates to your target coordinate system
const mapCoordinates = (sceneCoords: THREE.Vector3): THREE.Vector3 => {
    // Based on the example:
    // Scene: X: 15.8739, Y: 3.9051, Z: -5.1564
    // Target: X: 8.0, Y: 3, Z: -4
    
    // This is a simple offset calculation. If there's scaling involved,
    // we would need more points to determine the transformation accurately.
    const sceneP = { x: 15.8739, y: 3.9051, z: -5.1564 };
    const targetP = { x: 8, y: 3, z: -4 };

    const offsetX = targetP.x - sceneP.x;
    const offsetY = targetP.y - sceneP.y;
    const offsetZ = targetP.z - sceneP.z;

    // We assume a simple linear offset for now.
    return new THREE.Vector3(
        sceneCoords.x + offsetX,
        sceneCoords.y + offsetY,
        sceneCoords.z + offsetZ
    );
};


export default function Home() {
  const [coords, setCoords] = useState<THREE.Vector3 | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleCoordChange = useCallback((newCoords: THREE.Vector3 | null) => {
    if (newCoords) {
        // Apply coordinate mapping here
        const mappedCoords = mapCoordinates(newCoords);
        setCoords(mappedCoords);
    } else {
        setCoords(null);
    }
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setModelUrl(url);
      setCoords(null);
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

      <header className="absolute top-0 left-0 p-4 z-10 w-full flex justify-between items-center">
        <div className="flex items-center gap-3">
            <Orbit className="w-8 h-8 text-primary" />
            <div>
                <h1 className="text-2xl font-bold font-headline">Click Tracer</h1>
                <p className="text-sm text-muted-foreground">Click on the model to get coordinates</p>
            </div>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".gltf,.glb"
        />
        <Button onClick={handleUploadClick}>
          <Upload className="mr-2 h-4 w-4" />
          Upload Model
        </Button>
      </header>

      <DraggablePanel
        id="coords-panel"
        title="Coordinate Data"
        icon={<Info className="h-5 w-5 text-primary" />}
        description={coords ? "Information about the selected point." : "Click on the model to see details."}
        initialPosition={{ x: window.innerWidth - 350, y: 30 }}
      >
        <div className="space-y-4">
          <h3 className="font-semibold text-md">Mapped Coordinates</h3>
          {coords ? (
            <div className="p-3 bg-muted rounded-lg font-mono text-xs space-y-1">
              <p><span className="font-bold text-primary">X:</span> {coords.x.toFixed(4)}</p>
              <p><span className="font-bold text-primary">Y:</span> {coords.y.toFixed(4)}</p>
              <p><span className="font-bold text-primary">Z:</span> {coords.z.toFixed(4)}</p>
            </div>
          ) : (
            <p className="text-muted-foreground italic text-sm text-center">No point selected.</p>
          )}
        </div>
      </DraggablePanel>
    </main>
  );
}
