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
        if (cornersInput.trim()) {
            try {
                // Parse the custom format provided by user
                const cleaned = cornersInput
                    .replace(/corners:\s*\[/, '[')
                    .replace(/\]\s*$/, ']')
                    .replace(/,\s*\]/, ']');
                corners = JSON.parse(cleaned);
            } catch (e) {
                toast({
                    variant: 'destructive',
                    title: "Invalid Format",
                    description: "Please check your corners array format.",
                });
                return;
            }
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
            description="Extract meshes within a spatial boundary."
            initialPosition={initialPosition}
            className="w-96"
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Y-Axis Threshold</Label>
                    <Input
                        type="number"
                        step="0.1"
                        value={yValue}
                        onChange={(e) => setYValue(e.target.value)}
                        placeholder="e.g., 2.2"
                    />
                </div>
                
                <div className="space-y-2">
                    <Label>Boundary Corners (Array)</Label>
                    <Textarea
                        value={cornersInput}
                        onChange={(e) => setCornersInput(e.target.value)}
                        placeholder={'[ [-51.3, 2.2, -28.8], ... ]'}
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
                <p className="text-[10px] text-muted-foreground text-center">Found {results.length} unique meshes.</p>
            </div>
        </DraggablePanel>
    );
}
