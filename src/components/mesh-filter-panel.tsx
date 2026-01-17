
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Filter } from 'lucide-react';
import DraggablePanel from './draggable-panel';

type MeshFilterPanelProps = {
    onFilter: (y: number) => void;
    results: string[];
    initialPosition: { x: number; y: number };
};

export default function MeshFilterPanel({ onFilter, results, initialPosition }: MeshFilterPanelProps) {
    const [yValue, setYValue] = useState('3');
    const [generatedCode, setGeneratedCode] = useState('');
    const { toast } = useToast();

    const handleFilter = () => {
        const y = parseFloat(yValue);
        if (!isNaN(y)) {
            onFilter(y);
        } else {
            toast({
                variant: 'destructive',
                title: "Invalid Input",
                description: "Please enter a valid number for the Y-axis.",
            });
        }
    };
    
    useEffect(() => {
        if (results.length > 0) {
             setGeneratedCode(JSON.stringify(results.filter(name => name), null, 2));
        } else {
            setGeneratedCode('');
        }
    }, [results]);


    const handleCopy = () => {
        if (generatedCode) {
            navigator.clipboard.writeText(generatedCode);
            toast({
                title: "Code Copied!",
                description: "The array of mesh names has been copied.",
            });
        }
    };

    return (
        <DraggablePanel
            id="mesh-filter-panel"
            title="Mesh Filter by Y-axis"
            icon={<Filter className="h-5 w-5 text-primary" />}
            description="Find meshes above a specified Y-coordinate."
            initialPosition={initialPosition}
            className="w-96"
        >
            <div className="space-y-4">
                <div className="flex gap-2">
                    <Input
                        type="number"
                        value={yValue}
                        onChange={(e) => setYValue(e.target.value)}
                        placeholder="e.g., 3"
                        onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
                    />
                    <Button onClick={handleFilter}><Filter className="h-4 w-4" /></Button>
                </div>

                <div>
                    <div className="relative">
                        <Textarea
                            readOnly
                            value={generatedCode || `Found ${results.length} meshes. Enter a Y-axis value to filter.`}
                            className="font-mono text-xs h-64 resize-none bg-muted"
                            placeholder="Generated mesh names will appear here..."
                        />
                        {generatedCode && (
                            <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7" onClick={handleCopy}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </DraggablePanel>
    );
}
