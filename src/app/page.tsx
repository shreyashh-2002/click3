"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Info, Upload, Orbit, Grab, Target } from 'lucide-react';
import ThreeScene from '@/components/three-scene';
import CalibrationPanel from '@/components/calibration-panel';

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
    // Prevent dragging when interacting with form elements
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) {
      return;
    }
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


export default function Home() {
  const [coords, setCoords] = useState<THREE.Vector3 | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [sceneClick, setSceneClick] = useState<THREE.Vector3 | null>(null);
  const [calibration, setCalibration] = useState<{
    scene1: THREE.Vector3 | null,
    target1: THREE.Vector3 | null,
    scene2: THREE.Vector3 | null,
    target2: THREE.Vector3 | null,
  }>({ 
    scene1: new THREE.Vector3(15.6768, 3.9051, -5.2787),
    target1: new THREE.Vector3(8, 3, -4),
    scene2: new THREE.Vector3(18.8391, 2.2537, -8.1187),
    target2: new THREE.Vector3(12, 3, -6)
  });
  const [isCalibrating, setIsCalibrating] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const mapCoordinates = useCallback((sceneCoords: THREE.Vector3): THREE.Vector3 => {
      if (!calibration.scene1 || !calibration.target1 || !calibration.scene2 || !calibration.target2) {
          // Return raw coordinates if not calibrated
          return sceneCoords;
      }

      // This performs a linear interpolation/extrapolation for each axis independently.
      // It's a robust way to handle scaling and translation differences between coordinate systems.
      // Formula: target = t1 + (s - s1) * (t2 - t1) / (s2 - s1)

      const s1 = calibration.scene1;
      const t1 = calibration.target1;
      const s2 = calibration.scene2;
      const t2 = calibration.target2;
      const s = sceneCoords;
      
      const target = new THREE.Vector3();

      // X-axis
      const sceneDeltaX = s2.x - s1.x;
      if (sceneDeltaX === 0) {
        target.x = t1.x; // No change on this axis, just use offset
      } else {
        target.x = t1.x + (s.x - s1.x) * (t2.x - t1.x) / sceneDeltaX;
      }
      
      // Y-axis
      const sceneDeltaY = s2.y - s1.y;
      if (sceneDeltaY === 0) {
        target.y = t1.y; // No change on this axis, just use offset
      } else {
        target.y = t1.y + (s.y - s1.y) * (t2.y - t1.y) / sceneDeltaY;
      }

      // Z-axis
      const sceneDeltaZ = s2.z - s1.z;
      if (sceneDeltaZ === 0) {
        target.z = t1.z; // No change on this axis, just use offset
      } else {
        target.z = t1.z + (s.z - s1.z) * (t2.z - t1.z) / sceneDeltaZ;
      }

      return target;
  }, [calibration]);

  const handleCoordChange = useCallback((newCoords: THREE.Vector3 | null) => {
    setSceneClick(newCoords);
    if (newCoords) {
        const mappedCoords = mapCoordinates(newCoords);
        setCoords(mappedCoords);
    } else {
        setCoords(null);
    }
  }, [mapCoordinates]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setModelUrl(url);
      setCoords(null);
      setSceneClick(null);
      // Reset calibration when new model is loaded
      setCalibration({ scene1: null, target1: null, scene2: null, target2: null });
      setIsCalibrating(false);
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
        <div className="flex items-center gap-2">
            <Button onClick={() => setIsCalibrating(c => !c)} variant={isCalibrating ? "secondary" : "outline"}>
                <Target className="mr-2 h-4 w-4" />
                {isCalibrating ? "Finish Calibration" : "Calibrate"}
            </Button>
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
        </div>
      </header>

      {isCalibrating && (
        <CalibrationPanel
          sceneClick={sceneClick}
          onCalibrationChange={setCalibration}
          initialPosition={{ x: 30, y: 100 }}
          calibration={calibration}
        />
      )}

      <DraggablePanel
        id="coords-panel"
        title="Coordinate Data"
        icon={<Info className="h-5 w-5 text-primary" />}
        description={coords ? "Information about the selected point." : "Click on the model to see details."}
        initialPosition={{ x: isClient ? window.innerWidth - 350 : 0, y: 30 }}
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
