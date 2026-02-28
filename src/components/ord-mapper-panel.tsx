"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Database, Zap, Loader2, Code, Copy, Check } from 'lucide-react';
import DraggablePanel from './draggable-panel';
import { mapNiagaraPoints, type PointMappingOutput } from '@/ai/flows/niagara-point-mapper';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type OrdMapperPanelProps = {
    initialPosition: { x: number; y: number };
};

export default function OrdMapperPanel({ initialPosition }: OrdMapperPanelProps) {
    const [rawOrds, setRawOrds] = useState('');
    const [mapping, setMapping] = useState<PointMappingOutput | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleProcess = async () => {
        const ordArray = rawOrds.split('\n').map(s => s.trim()).filter(Boolean);
        if (ordArray.length === 0) {
            toast({
                title: "No ORDs found",
                description: "Please enter some Niagara ORDs to process.",
                variant: "destructive"
            });
            return;
        }

        setIsLoading(true);
        try {
            const result = await mapNiagaraPoints({ rawOrds: ordArray });
            setMapping(result);
            toast({
                title: "Mapping Complete",
                description: "AI has successfully categorized your points and generated a script preview.",
            });
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "Failed to process ORDs with AI.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({
            title: "Copied!",
            description: "Copied to clipboard.",
        });
    };

    return (
        <DraggablePanel
            id="ord-mapper-panel"
            title="ORD Mapper"
            icon={<Database className="h-5 w-5 text-primary" />}
            description="Intelligent Niagara point discovery & mapping."
            initialPosition={initialPosition}
            className="w-[450px]"
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <Textarea
                        value={rawOrds}
                        onChange={(e) => setRawOrds(e.target.value)}
                        placeholder="Paste raw Niagara ORDs here (one per line)..."
                        className="h-24 font-mono text-xs resize-none bg-muted/50"
                    />
                    <Button onClick={handleProcess} disabled={isLoading} className="w-full">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                        Process with AI Agent
                    </Button>
                </div>

                {mapping && (
                    <Tabs defaultValue="mapped" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="mapped">Mapped Points</TabsTrigger>
                            <TabsTrigger value="script">Script Preview</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="mapped" className="mt-4 space-y-4 max-h-80 overflow-auto pr-2 scrollbar-thin scrollbar-thumb-primary">
                            {mapping.rooms.map((room, idx) => (
                                <div key={idx} className="border rounded-md p-3 bg-muted/30 border-primary/20">
                                    <h4 className="font-bold text-sm text-primary mb-2 flex items-center justify-between">
                                        {room.roomName}
                                        <span className="text-[10px] font-normal text-muted-foreground bg-secondary px-1.5 rounded">{room.points.length} points</span>
                                    </h4>
                                    <ul className="space-y-1.5">
                                        {room.points.map((p, pIdx) => (
                                            <li key={pIdx} className="text-xs flex flex-col gap-0.5 border-b border-border/50 pb-1.5 last:border-0 last:pb-0">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-medium text-foreground">{p.label}</span>
                                                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                                        {p.category}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-muted-foreground truncate font-mono" title={p.ord}>{p.ord}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </TabsContent>

                        <TabsContent value="script" className="mt-4">
                            <div className="relative group">
                                <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => copyToClipboard(mapping.generatedScriptPreview)}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                                <pre className="bg-muted p-4 rounded-md text-[11px] font-mono whitespace-pre-wrap overflow-x-auto border border-border/50 max-h-80">
                                    <code>{mapping.generatedScriptPreview}</code>
                                </pre>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2 italic text-center">
                                Generated by Niagara Engineering Agent
                            </p>
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </DraggablePanel>
    );
}
