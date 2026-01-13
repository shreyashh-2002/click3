
"use client";

import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Search } from 'lucide-react';
import DraggablePanel from './draggable-panel';

export type MeshInfo = {
    name: string;
    center: THREE.Vector3;
};

type MeshSearchPanelProps = {
    onSearch: (searchTerm: string) => void;
    results: MeshInfo[];
    initialPosition: { x: number; y: number };
};

export default function MeshSearchPanel({ onSearch, results, initialPosition }: MeshSearchPanelProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [generatedCode, setGeneratedCode] = useState('');
    const { toast } = useToast();

    const handleSearch = () => {
        onSearch(searchTerm);
    };

    useEffect(() => {
        if (results.length === 0) {
            setGeneratedCode('');
            return;
        }

        const snippets = results.map((result, index) => {
            const { name, center } = result;
            return `{
  id: "mrm${index + 1}",
  label: "${name}",
  Mesh: "${name}",
  anchor: new THREE.Vector3(${center.x.toFixed(4)}, 2.0, ${center.z.toFixed(4)}),
  lineType: "triple",
  height: 8,
  horizontalLength: 8,
  dir: "W",
  height2: 4,
  dir3: "S"
}`;
        });

        setGeneratedCode(snippets.join(',\n'));
    }, [results]);

    const handleCopy = () => {
        if (generatedCode) {
            navigator.clipboard.writeText(generatedCode);
            toast({
                title: "Code Copied!",
                description: "The generated code for all found meshes has been copied.",
            });
        }
    };

    return (
        <DraggablePanel
            id="mesh-search-panel"
            title="Mesh Code Generator"
            icon={<Search className="h-5 w-5 text-primary" />}
            description="Search for meshes by name and generate code."
            initialPosition={initialPosition}
            className="w-96"
        >
            <div className="space-y-4">
                <div className="flex gap-2">
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="e.g., Duct"
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <Button onClick={handleSearch}><Search className="h-4 w-4" /></Button>
                </div>

                <div>
                    <div className="relative">
                        <Textarea
                            readOnly
                            value={generatedCode || `Found ${results.length} meshes. Enter a search term and press Enter or click the search button.`}
                            className="font-mono text-xs h-64 resize-none bg-muted"
                            placeholder="Generated code will appear here..."
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
