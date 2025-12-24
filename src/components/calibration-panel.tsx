"use client";

import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Target, CheckCircle } from 'lucide-react';
import DraggablePanel from './draggable-panel';

type Calibration = {
    scene1: THREE.Vector3 | null;
    target1: THREE.Vector3 | null;
    scene2: THREE.Vector3 | null;
    target2: THREE.Vector3 | null;
};

type CalibrationPanelProps = {
  sceneClick: THREE.Vector3 | null;
  onCalibrationChange: (cal: Calibration) => void;
  initialPosition: { x: number, y: number };
  calibration: Calibration;
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
        } else {
            setTargetX("");
            setTargetY("");
            setTargetZ("");
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
                    <Input placeholder="X" value={targetX} onChange={(e) => setTargetX(e.target.value)} onBlur={handleSetTarget} />
                    <Input placeholder="Y" value={targetY} onChange={(e) => setTargetY(e.target.value)} onBlur={handleSetTarget} />
                    <Input placeholder="Z" value={targetZ} onChange={(e) => setTargetZ(e.target.value)} onBlur={handleSetTarget} />
                </div>
                 {targetPoint && (
                    <div className="font-mono text-xs p-2 bg-muted rounded">
                        Target: {targetPoint.x.toFixed(2)}, {targetPoint.y.toFixed(2)}, {targetPoint.z.toFixed(2)}
                    </div>
                )}
            </div>
        </div>
    );
};


export default function CalibrationPanel({ sceneClick, onCalibrationChange, initialPosition, calibration }: CalibrationPanelProps) {
    const [cal, setCal] = useState<Calibration>(calibration);

    useEffect(() => {
        setCal(calibration);
    }, [calibration]);

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
