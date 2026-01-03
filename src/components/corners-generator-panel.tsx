
"use client";

import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Trash2, SquareAsterisk } from 'lucide-react';
import DraggablePanel from './draggable-panel';

type CornersGeneratorPanelProps = {
    lastClick: THREE.Vector3 | null;
    initialPosition: { x: number; y: number };
};

export default function CornersGeneratorPanel({ lastClick, initialPosition }: CornersGeneratorPanelProps) {
    const [corners, setCorners] = useState<THREE.Vector3[]>([]);
    const [generatedCode, setGeneratedCode] = useState('');
    const { toast } = useToast();

    useEffect(() => {
        if (lastClick && corners.length < 4) {
            // Avoid adding the same point twice on re-renders
            if (corners.length > 0 && corners[corners.length - 1].equals(lastClick)) {
                return;
            }
            setCorners(prev => [...prev, lastClick]);
        }
    }, [lastClick]);

    useEffect(() => {
        if (corners.length === 4) {
            const code = `corners: [\n${corners.map(c => `  [${c.x.toFixed(4)}, 2.2, ${c.z.toFixed(4)}]`).join(',\n')}\n]`;
            setGeneratedCode(code);
        } else {
            setGeneratedCode('');
        }
    }, [corners]);

    const handleCopy = () => {
        if (generatedCode) {
            navigator.clipboard.writeText(generatedCode);
            toast({
                title: "Code Copied!",
                description: "The corners array has been copied to your clipboard.",
            });
        }
    };
    
    const handleClear = () => {
        setCorners([]);
        setGeneratedCode('');
        toast({
            title: "Corners Cleared",
            description: "You can now select new points.",
        });
    };

    const getHelperText = () => {
        if (corners.length === 4) {
            return "Four points selected. Code generated below.";
        }
        return `Click ${4 - corners.length} more point(s) on the model.`;
    };

    return (
        <DraggablePanel
            id="corners-generator-panel"
            title="Corners Generator"
            icon={<SquareAsterisk className="h-5 w-5 text-primary" />}
            description="Select 4 points to generate a corners array."
            initialPosition={initialPosition}
            className="w-96"
        >
            <div className="space-y-4">
                <div className='space-y-2'>
                    <div className="flex justify-between items-center">
                        <p className="text-sm text-muted-foreground">{getHelperText()}</p>
                        <Button onClick={handleClear} variant="outline" size="sm">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Clear
                        </Button>
                    </div>
                    <div className="relative">
                        <Textarea
                            readOnly
                            value={generatedCode || `[${corners.length}/4] points selected...`}
                            className="font-mono text-xs h-32 resize-none bg-muted"
                            placeholder="Click on the model to select 4 corner points..."
                        />
                        {generatedCode && (
                            <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7" onClick={handleCopy}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
                 <div>
                    <h4 className="font-medium text-sm mb-2">Selected Points:</h4>
                    <div className="text-xs font-mono space-y-1 text-muted-foreground">
                        {corners.map((corner, index) => (
                            <p key={index}>
                                <span className="text-primary font-bold">P{index + 1}:</span> X: {corner.x.toFixed(2)}, Y: {corner.y.toFixed(2)}, Z: {corner.z.toFixed(2)}
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        </DraggablePanel>
    );
}
