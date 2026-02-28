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
        const threshold = parseFloat(yValue);
        
        if (isNaN(threshold)) {
            toast({
                variant: 'destructive',
                title: "Invalid Y Threshold",
                description: "Please enter a valid number for the Y-axis.",
            });
            return;
        }

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
            
            // Remove 'corners:' label or 'const corners =' if present
            cleaned = cleaned.replace(/^(const|let|var)\s+\w+\s*=\s*/, '');
            cleaned = cleaned.replace(/^corners:\s*/, '');
            
            // Clean up trailing commas and potential comments
            cleaned = cleaned.replace(/\/\/.*/g, ''); // Remove line comments
            cleaned = cleaned.replace(/,\s*\]/g, ']'); // Remove trailing commas in arrays
            
            // Basic check if it's bracketed
            if (!cleaned.startsWith('[')) {
                throw new Error("Invalid format");
            }

            // Using JSON.parse for standard JSON, but we might need a safer eval-like approach for JS objects
            // For safety in this context, we try JSON.parse after replacing single quotes
            const normalized = cleaned.replace(/'/g, '"');
            corners = JSON.parse(normalized);

            if (!Array.isArray(corners) || corners.length < 3) {
                throw new Error("Invalid array structure. Need at least 3 points.");
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
            yThreshold: threshold,
            corners
        });
        
        toast({
            title: "Extraction Started",
            description: `Searching for meshes strictly above Y=${threshold}...`,
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
            description="Extract meshes within a boundary and strictly above a Y threshold."
            initialPosition={initialPosition}
            className="w-96"
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Y-Axis Threshold (Meshes {`>`} Y)</Label>
                    <Input
                        type="number"
                        step="0.1"
                        value={yValue}
                        onChange={(e) => setYValue(e.target.value)}
                        placeholder="e.g., 2.0"
                    />
                </div>
                
                <div className="space-y-2">
                    <Label>Boundary Corners Array (XZ Plane)</Label>
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
                    <div className="flex justify-between items-center mb-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">Results</Label>
                    </div>
                    <Textarea
                        readOnly
                        value={results.length > 0 ? JSON.stringify(results, null, 2) : "No meshes extracted yet."}
                        className="font-mono text-[10px] h-48 resize-none bg-muted"
                    />
                    {results.length > 0 && (
                        <Button size="icon" variant="ghost" className="absolute top-8 right-2 h-7 w-7" onClick={handleCopy}>
                            <Copy className="h-4 w-4" />
                        </Button>
                    )}
                </div>
                <p className="text-[10px] text-muted-foreground text-center">Found {results.length} unique meshes matching criteria.</p>
            </div>
        </DraggablePanel>
    );
}