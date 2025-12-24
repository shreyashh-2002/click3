
"use client";

import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Code, Copy, Save } from 'lucide-react';
import DraggablePanel from './draggable-panel';


type CodeGeneratorPanelProps = {
    anchor: THREE.Vector3 | null;
    initialPosition: { x: number; y: number };
};

export default function CodeGeneratorPanel({ anchor, initialPosition }: CodeGeneratorPanelProps) {
    const [id, setId] = useState('');
    const [label, setLabel] = useState('');
    const [capacity, setCapacity] = useState('');
    const [height, setHeight] = useState('12');
    const [currentSnippet, setCurrentSnippet] = useState('');
    const [allGeneratedCode, setAllGeneratedCode] = useState('');
    const { toast } = useToast();

    useEffect(() => {
        if (!anchor) {
            setCurrentSnippet('');
            return;
        }

        const x = anchor.x.toFixed(4);
        const y = anchor.y.toFixed(4);
        const z = anchor.z.toFixed(4);

        const code = `{
  id: "${id}",
  label: "${label}",
  capacity: "${capacity}",
  anchor: new THREE.Vector3(${x}, ${y}, ${z}),
  height: ${height},
}`;
        setCurrentSnippet(code);

    }, [id, label, capacity, height, anchor]);

    const handleSave = () => {
        if (currentSnippet) {
            setAllGeneratedCode(prev => prev ? `${prev},\n${currentSnippet}` : `[\n${currentSnippet}\n]`);
            toast({
                title: "Snippet Saved!",
                description: "The snippet has been added to the collection.",
            });
        }
    };

    const handleCopyAll = () => {
        if (allGeneratedCode) {
            navigator.clipboard.writeText(allGeneratedCode);
            toast({
                title: "All Code Copied!",
                description: "The collected snippets have been copied to your clipboard.",
            });
        }
    };

    return (
        <DraggablePanel
            id="code-generator-panel"
            title="Code Generator"
            icon={<Code className="h-5 w-5 text-primary" />}
            description="Create and save code snippets from selected points."
            initialPosition={initialPosition}
            className="w-96"
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="gen-id">ID</Label>
                    <Input id="gen-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g., mrm2" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="gen-label">Label</Label>
                    <Input id="gen-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g., Meeting Room 2" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="gen-capacity">Capacity</Label>
                    <Input id="gen-capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g., 8 Pax" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="gen-height">Height</Label>
                    <Input id="gen-height" type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
                </div>

                <Button onClick={handleSave} disabled={!currentSnippet} className="w-full">
                    <Save className="mr-2 h-4 w-4" />
                    Save Snippet
                </Button>
                
                <div className='space-y-2'>
                    <Label>Saved Snippets</Label>
                    <div className="relative">
                        <Textarea
                            readOnly
                            value={anchor ? allGeneratedCode : "Click on the model to select an anchor point and save snippets."}
                            className="font-mono text-xs h-40 resize-none bg-muted"
                            placeholder="Saved code snippets will appear here..."
                        />
                        {allGeneratedCode && (
                            <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7" onClick={handleCopyAll}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </DraggablePanel>
    );
}
