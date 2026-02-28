"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Database, Zap, Loader2 } from 'lucide-react';
import DraggablePanel from './draggable-panel';
import { mapNiagaraPoints, type PointMappingOutput } from '@/ai/flows/niagara-point-mapper';

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
                description: "AI has successfully categorized your points by room and type.",
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

    return (
        <DraggablePanel
            id="ord-mapper-panel"
            title="ORD Mapper"
            icon={<Database className="h-5 w-5 text-primary" />}
            description="Paste raw Niagara ORDs to categorize them with AI."
            initialPosition={initialPosition}
            className="w-96"
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <Textarea
                        value={rawOrds}
                        onChange={(e) => setRawOrds(e.target.value)}
                        placeholder="Paste raw Niagara ORDs here (one per line)..."
                        className="h-32 font-mono text-xs resize-none bg-muted/50"
                    />
                    <Button onClick={handleProcess} disabled={isLoading} className="w-full">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                        Process with AI
                    </Button>
                </div>

                {mapping && (
                    <div className="space-y-4 max-h-64 overflow-auto pr-2 scrollbar-thin scrollbar-thumb-primary">
                        {mapping.rooms.map((room, idx) => (
                            <div key={idx} className="border rounded-md p-2 bg-muted/30 border-primary/20">
                                <h4 className="font-bold text-sm text-primary mb-2 flex items-center justify-between">
                                    {room.roomName}
                                    <span className="text-[10px] font-normal text-muted-foreground">{room.points.length} points</span>
                                </h4>
                                <ul className="space-y-1">
                                    {room.points.map((p, pIdx) => (
                                        <li key={pIdx} className="text-xs flex justify-between gap-2 border-b border-border/50 pb-1 last:border-0">
                                            <span className="truncate opacity-80" title={p.ord}>{p.label}</span>
                                            <span className="font-semibold text-[10px] uppercase px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground whitespace-nowrap">
                                                {p.category}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </DraggablePanel>
    );
}
