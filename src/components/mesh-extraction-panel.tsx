"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Map, Layers } from 'lucide-react';
import DraggablePanel from './draggable-panel';

type MeshExtractionPanelProps = {
    onExtract: (params: { yThreshold: number; corners: number[][] }) => void;
    results: string[];
    initialPosition: { x: number; y: number };
};

export default function MeshExtractionPanel({ onExtract, results, initialPosition }: MeshExtractionPanelProps) {
    const [yValue, setYValue] = useState('2.0');
    const [cornersInput, setCornersInput] = useState('');
    const { toast } = useToast();

    const handleExtract = () => {
        let corners: number[][] = [];
        
        if (!cornersInput.trim()) {
            toast({
                variant: 'destructive',
                title: "Missing Coordinates",
                description: "Please provide a corners array.",
            });
            return;
        }

        try {
            // Robust parsing for common JS/JSON array formats including 'corners: [...]'
            let cleaned = cornersInput.trim();
            
            // Remove 'corners:' label if present
            if (cleaned.startsWith('corners:')) {
                cleaned = cleaned.replace(/^corners:\s*/, '');
            }
            
            // Basic cleanup for JSON parsing
            cleaned = cleaned.replace(/,\s*\]/g, ']'); // Remove trailing commas
            
            // Evaluate if it looks like a JS array but isn't strict JSON
            // Using JSON.parse is safer than eval
            corners = JSON.parse(cleaned);

            if (!Array.isArray(corners) || corners.length < 3) {
                throw new Error("Invalid array structure");
            }
        } catch (e) {
            toast({
                variant: 'destructive',
                title: "Invalid Format",
                description: "Ensure your corners are in a valid array format: [[x,y,z], [x,y,z], ...]",
            });
            return;
        }

        onExtract({
            yThreshold: parseFloat(yValue),
            corners
        });
    };

    const handleCopy = () => {
        if (results.length > 0) {
            navigator.clipboard.writeText(JSON.stringify(results, null, 2));
            toast({ title: "Copied!", description: `Copied ${results.length} mesh names.` });
        }
    };

    return (
        <DraggablePanel
            id="mesh-extraction-panel"
            title="Mesh Extraction"
            icon={<Layers className="h-5 w-5 text-primary" />}
            description="Extract meshes within a boundary and above a Y threshold."
            initialPosition={initialPosition}
            className="w-96"
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Y-Axis Threshold (Greater Than)</Label>
                    <Input
                        type="number"
                        step="0.1"
                        value={yValue}
                        onChange={(e) => setYValue(e.target.value)}
                        placeholder="e.g., 2.0"
                    />
                </div>
                
                <div className="space-y-2">
                    <Label>Boundary Corners Array</Label>
                    <Textarea
                        value={cornersInput}
                        onChange={(e) => setCornersInput(e.target.value)}
                        placeholder={'corners: [\n  [-51.3, 2.2, -28.8],\n  ...\n]'}
                        className="font-mono text-[10px] h-32 resize-none bg-muted/50"
                    />
                </div>

                <Button onClick={handleExtract} className="w-full">
                    <Map className="mr-2 h-4 w-4" />
                    Extract Meshes
                </Button>

                <div className="relative">
                    <Textarea
                        readOnly
                        value={results.length > 0 ? JSON.stringify(results, null, 2) : "No meshes extracted yet."}
                        className="font-mono text-[10px] h-48 resize-none bg-muted"
                    />
                    {results.length > 0 && (
                        <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7" onClick={handleCopy}>
                            <Copy className="h-4 w-4" />
                        </Button>
                    )}
                </div>
                <p className="text-[10px] text-muted-foreground text-center">Found {results.length} unique meshes matching criteria.</p>
            </div>
        </DraggablePanel>
    );
}
