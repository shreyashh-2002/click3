
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";
import { Info, Upload, Orbit, Code, Target } from 'lucide-react';
import ThreeScene from '@/components/three-scene';
import CodeGeneratorPanel from '@/components/code-generator-panel';
import DraggablePanel from '@/components/draggable-panel';
import CalibrationPanel from '@/components/calibration-panel';


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
  const [showGenerator, setShowGenerator] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);
  
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

  const mapCoordinates = useCallback((sceneCoords: THREE.Vector3): THREE.Vector3 => {
      if (!calibration.scene1 || !calibration.target1 || !calibration.scene2 || !calibration.target2) {
          return sceneCoords;
      }

      // This is a more robust linear interpolation/extrapolation for each axis.
      // The formula is: y = y1 + (x - x1) * (y2 - y1) / (x2 - x1)
      // Where 'x' is the input scene coordinate and 'y' is the output target coordinate.
      const s1 = calibration.scene1; // (x1, y1, z1) for the scene
      const t1 = calibration.target1; // (x1, y1, z1) for the target
      const s2 = calibration.scene2; // (x2, y2, z2) for the scene
      const t2 = calibration.target2; // (x2, y2, z2) for the target
      const s = sceneCoords; // The input scene coordinate (x, y, z)
      
      const target = new THREE.Vector3();

      const calculate = (s_val: number, s1_val: number, s2_val: number, t1_val: number, t2_val: number) => {
        const sceneDelta = s2_val - s1_val;
        // Avoid division by zero. If the scene points have the same value on an axis, 
        // we can't determine a scale, so we assume a simple offset from the first point.
        if (Math.abs(sceneDelta) < 1e-6) {
            return t1_val + (s_val - s1_val);
        }
        const scale = (t2_val - t1_val) / sceneDelta;
        return t1_val + (s_val - s1_val) * scale;
      }

      target.x = calculate(s.x, s1.x, s2.x, t1.x, t2.x);
      target.y = calculate(s.y, s1.y, s2.y, t1.y, t2.y);
      target.z = calculate(s.z, s1.z, s2.z, t1.z, t2.z);

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
      // Reset calibration to default when a new model is loaded
      setCalibration({ 
        scene1: new THREE.Vector3(15.6768, 3.9051, -5.2787),
        target1: new THREE.Vector3(8, 3, -4),
        scene2: new THREE.Vector3(18.8391, 2.2537, -8.1187),
        target2: new THREE.Vector3(12, 3, -6)
      });
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
            <Orbit className="w-8 h-8 text-primary" />
            <div>
                <h1 className="text-2xl font-bold font-headline">Click Tracer</h1>
                <p className="text-sm text-muted-foreground">Click on the model to get coordinates</p>
            </div>
        </div>
        <div className="flex items-center gap-2 p-2 bg-background/80 rounded-lg backdrop-blur-sm border border-border/50">
            <Button onClick={() => setShowCalibration(c => !c)} variant={showCalibration ? "secondary" : "outline"} size="sm">
                <Target className="mr-2 h-4 w-4" />
                Calibration
            </Button>
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
          anchor={coords}
          initialPosition={{ x: 30, y: 120 }}
        />
      )}

      {showCalibration && (
        <CalibrationPanel 
          calibration={calibration}
          setCalibration={setCalibration}
          lastSceneClick={sceneClick}
          initialPosition={{ x: 30, y: (showGenerator ? 500 : 120) }}
        />
      )}

      <DraggablePanel
        id="coords-panel"
        title="Coordinate Data"
        icon={<Info className="h-5 w-5 text-primary" />}
        description={coords ? "Information about the selected point." : "Click on the model to see details."}
        initialPosition={{ x: windowSize.width - 350, y: windowSize.height - 250 }}
        className="w-80"
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
