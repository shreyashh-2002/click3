"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Grab, Target, CheckCircle } from 'lucide-react';

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
      className={`absolute z-20 w-96 ${className}`}
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


type CalibrationPanelProps = {
  sceneClick: THREE.Vector3 | null;
  onCalibrationChange: (cal: {
    scene1: THREE.Vector3 | null;
    target1: THREE.Vector3 | null;
    scene2: THREE.Vector3 | null;
    target2: THREE.Vector3 | null;
  }) => void;
  initialPosition: { x: number, y: number };
};

const CalibrationPoint = ({
    title,
    pointNumber,
    sceneClick,
    onSceneSet,
    onTargetSet,
    scenePoint,
    targetPoint
}: {
    title: string;
    pointNumber: 1 | 2;
    sceneClick: THREE.Vector3 | null;
    onSceneSet: (point: THREE.Vector3) => void;
    onTargetSet: (point: THREE.Vector3) => void;
    scenePoint: THREE.Vector3 | null;
    targetPoint: THREE.Vector3 | null;
}) => {
    const [targetX, setTargetX] = useState(targetPoint?.x.toString() || "");
    const [targetY, setTargetY] = useState(targetPoint?.y.toString() || "");
    const [targetZ, setTargetZ] = useState(targetPoint?.z.toString() || "");

    useEffect(() => {
        if (targetPoint) {
            setTargetX(targetPoint.x.toString());
            setTargetY(targetPoint.y.toString());
            setTargetZ(targetPoint.z.toString());
        }
    }, [targetPoint]);

    const handleSetTarget = () => {
        const x = parseFloat(targetX);
        const y = parseFloat(targetY);
        const z = parseFloat(targetZ);
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
            onTargetSet(new THREE.Vector3(x, y, z));
        }
    };

    return (
        <div className="space-y-3 p-3 border rounded-lg bg-background/50">
            <h4 className="font-semibold text-md flex items-center gap-2">{title}
                {scenePoint && targetPoint && <CheckCircle className="w-4 h-4 text-green-500" />}
            </h4>

            <div className="space-y-2">
                <Button onClick={() => sceneClick && onSceneSet(sceneClick)} disabled={!sceneClick} className="w-full">
                    Set Scene Point {pointNumber} from Click
                </Button>
                {scenePoint && (
                    <div className="font-mono text-xs p-2 bg-muted rounded">
                        Scene: {scenePoint.x.toFixed(2)}, {scenePoint.y.toFixed(2)}, {scenePoint.z.toFixed(2)}
                    </div>
                )}
            </div>

            <div className="space-y-2">
                 <Label>Target Point {pointNumber} (From Project)</Label>
                <div className="flex gap-2">
                    <Input placeholder="X" value={targetX} onChange={(e) => setTargetX(e.target.value)} />
                    <Input placeholder="Y" value={targetY} onChange={(e) => setTargetY(e.target.value)} />
                    <Input placeholder="Z" value={targetZ} onChange={(e) => setTargetZ(e.target.value)} />
                </div>
                 <Button onClick={handleSetTarget} className="w-full" variant="outline">Set Target Point {pointNumber}</Button>
                 {targetPoint && (
                    <div className="font-mono text-xs p-2 bg-muted rounded">
                        Target: {targetPoint.x.toFixed(2)}, {targetPoint.y.toFixed(2)}, {targetPoint.z.toFixed(2)}
                    </div>
                )}
            </div>
        </div>
    );
};


export default function CalibrationPanel({ sceneClick, onCalibrationChange, initialPosition }: CalibrationPanelProps) {
    const [cal, setCal] = useState({
        scene1: null as THREE.Vector3 | null,
        target1: null as THREE.Vector3 | null,
        scene2: null as THREE.Vector3 | null,
        target2: null as THREE.Vector3 | null,
    });

    useEffect(() => {
        onCalibrationChange(cal);
    }, [cal, onCalibrationChange]);

    return (
        <DraggablePanel
            id="calibration-panel"
            title="Coordinate Calibration"
            icon={<Target className="h-5 w-5 text-primary" />}
            description="Define two reference points to align coordinate systems."
            initialPosition={initialPosition}
        >
            <div className="space-y-4">
                <CalibrationPoint
                    title="Reference Point 1"
                    pointNumber={1}
                    sceneClick={sceneClick}
                    scenePoint={cal.scene1}
                    targetPoint={cal.target1}
                    onSceneSet={(p) => setCal(c => ({...c, scene1: p}))}
                    onTargetSet={(p) => setCal(c => ({...c, target1: p}))}
                />
                 <CalibrationPoint
                    title="Reference Point 2"
                    pointNumber={2}
                    sceneClick={sceneClick}
                    scenePoint={cal.scene2}
                    targetPoint={cal.target2}
                    onSceneSet={(p) => setCal(c => ({...c, scene2: p}))}
                    onTargetSet={(p) => setCal(c => ({...c, target2: p}))}
                />
            </div>
        </DraggablePanel>
    );
}
