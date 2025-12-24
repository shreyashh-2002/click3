
"use client";

import { useState } from 'react';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Target } from 'lucide-react';
import DraggablePanel from './draggable-panel';

type CalibrationPanelProps = {
    calibration: {
        scene1: THREE.Vector3 | null;
        target1: THREE.Vector3 | null;
        scene2: THREE.Vector3 | null;
        target2: THREE.Vector3 | null;
    };
    setCalibration: (calibration: any) => void;
    lastSceneClick: THREE.Vector3 | null;
    initialPosition: { x: number; y: number };
};

const VectorInput = ({ label, value, onChange }: { label: string, value: THREE.Vector3, onChange: (newValue: THREE.Vector3) => void }) => {
    
    const [tempVec, setTempVec] = useState(value.clone());

    const handleChange = (axis: 'x' | 'y' | 'z', val: string) => {
        const newVec = tempVec.clone();
        newVec[axis] = parseFloat(val) || 0;
        setTempVec(newVec);
    };

    const handleBlur = (axis: 'x' | 'y' | 'z', val: string) => {
        const num = parseFloat(val);
        if (!isNaN(num)) {
            onChange(tempVec.clone());
        }
    };
    
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <div className="flex gap-2">
                <Input type="number" value={tempVec.x} onChange={e => handleChange('x', e.target.value)} onBlur={e => handleBlur('x', e.target.value)} placeholder="X" aria-label={`${label} X`} step="0.1" />
                <Input type="number" value={tempVec.y} onChange={e => handleChange('y', e.target.value)} onBlur={e => handleBlur('y', e.target.value)} placeholder="Y" aria-label={`${label} Y`} step="0.1" />
                <Input type="number" value={tempVec.z} onChange={e => handleChange('z', e.target.value)} onBlur={e => handleBlur('z', e.target.value)} placeholder="Z" aria-label={`${label} Z`} step="0.1" />
            </div>
        </div>
    );
};

export default function CalibrationPanel({ calibration, setCalibration, lastSceneClick, initialPosition }: CalibrationPanelProps) {
    const { toast } = useToast();

    const handleUseLastClick = (pointNumber: 1 | 2) => {
        if (lastSceneClick) {
            setCalibration((prev: any) => ({ ...prev, [`scene${pointNumber}`]: lastSceneClick.clone() }));
            toast({
                title: `Point ${pointNumber} Set`,
                description: "Used the last clicked position as the scene point.",
            });
        } else {
            toast({
                variant: "destructive",
                title: "No Point Clicked",
                description: "Please click on the model first to select a point.",
            });
        }
    };
    
    const handleTargetChange = (pointNumber: 1 | 2, newValue: THREE.Vector3) => {
        setCalibration((prev: any) => ({ ...prev, [`target${pointNumber}`]: newValue }));
    };

    return (
        <DraggablePanel
            id="calibration-panel"
            title="Calibration"
            icon={<Target className="h-5 w-5 text-primary" />}
            description="Define two reference points for accurate mapping."
            initialPosition={initialPosition}
            className="w-96"
        >
            <div className="space-y-6">
                {/* Point 1 */}
                <div className="p-3 border rounded-lg space-y-3 bg-background/50">
                    <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-md">Reference Point 1</h3>
                        <Button size="sm" variant="outline" onClick={() => handleUseLastClick(1)}>Use Last Click</Button>
                    </div>
                    <div className="p-2 bg-muted rounded-md font-mono text-xs">
                        <span className='font-sans text-muted-foreground'>Scene: </span>
                        {calibration.scene1 ? `${calibration.scene1.x.toFixed(4)}, ${calibration.scene1.y.toFixed(4)}, ${calibration.scene1.z.toFixed(4)}` : 'Not Set'}
                    </div>
                    <VectorInput 
                        label="Target Point 1" 
                        value={calibration.target1 || new THREE.Vector3()}
                        onChange={(v) => handleTargetChange(1, v)}
                    />
                </div>

                {/* Point 2 */}
                <div className="p-3 border rounded-lg space-y-3 bg-background/50">
                     <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-md">Reference Point 2</h3>
                        <Button size="sm" variant="outline" onClick={() => handleUseLastClick(2)}>Use Last Click</Button>
                    </div>
                    <div className="p-2 bg-muted rounded-md font-mono text-xs">
                        <span className='font-sans text-muted-foreground'>Scene: </span>
                        {calibration.scene2 ? `${calibration.scene2.x.toFixed(4)}, ${calibration.scene2.y.toFixed(4)}, ${calibration.scene2.z.toFixed(4)}` : 'Not Set'}
                    </div>
                    <VectorInput 
                        label="Target Point 2" 
                        value={calibration.target2 || new THREE.Vector3()}
                        onChange={(v) => handleTargetChange(2, v)}
                    />
                </div>
            </div>
        </DraggablePanel>
    );
}

    