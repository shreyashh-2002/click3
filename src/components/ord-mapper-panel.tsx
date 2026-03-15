"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Database, Loader2, Copy, Filter, Globe, AlertCircle } from 'lucide-react';
import DraggablePanel from './draggable-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


type Point = {
    ord: string;
    category: 'Temperature' | 'Setpoint' | 'Humidity' | 'Occupancy' | 'Status' | 'Command' | 'Other';
    label: string;
};

type RoomMapping = {
    roomName: string;
    points: Point[];
};

type PointMappingOutput = {
    rooms: RoomMapping[];
    generatedScriptPreview: string;
};

type OrdMapperPanelProps = {
    initialPosition: { x: number; y: number };
};

export default function OrdMapperPanel({ initialPosition }: OrdMapperPanelProps) {
    const [rawOrds, setRawOrds] = useState('');
    const [niagaraUrl, setNiagaraUrl] = useState('https://192.168.1.225');
    const [niagaraUser, setNiagaraUser] = useState('');
    const [niagaraPass, setNiagaraPass] = useState('');
    const [startPath, setStartPath] = useState('config/Drivers');
    const [mapping, setMapping] = useState<PointMappingOutput | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const { toast } = useToast();

    const categorizePoint = (name: string): Point['category'] => {
        const n = name.toLowerCase();
        if (n.includes('temp') || n.includes('temperature')) return 'Temperature';
        if (n.includes('set') || n.includes('sp') || n.includes('stp')) return 'Setpoint';
        if (n.includes('hum') || n.includes('humidity')) return 'Humidity';
        if (n.includes('occ') || n.includes('occupancy')) return 'Occupancy';
        if (n.includes('stat') || n.includes('alarm') || n.includes('fbk')) return 'Status';
        if (n.includes('cmd') || n.includes('out') || n.includes('start')) return 'Command';
        return 'Other';
    };

    async function clientFetchNiagaraChildren(parentPath: string, url: string, user: string, pass: string) {
        if (!url || !user || !pass) {
            throw new Error("Niagara URL, Username, and Password are required for local connection.");
        }

        const auth = btoa(`${user}:${pass}`);
        const fetchUrl = `${url}/api/v1/read?ord=${encodeURIComponent(parentPath)}`;

        const response = await fetch(fetchUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            if (response.status === 401) throw new Error("Authentication failed. Check credentials.");
            if (response.status === 404) throw new Error(`ORD not found: ${parentPath}`);
            throw new Error(`Station responded with ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }

    async function clientDiscoverAllOrds(startPath: string, url: string, user: string, pass: string): Promise<string[]> {
        const foundOrds: Set<string> = new Set();
        const visitedPaths: Set<string> = new Set();

        async function crawl(path: string, depth: number = 0) {
            if (depth > 20 || visitedPaths.has(path)) return;
            visitedPaths.add(path);

            try {
                const data = await clientFetchNiagaraChildren(path, url, user, pass);
                if (data && Array.isArray(data.children)) {
                    for (const child of data.children) {
                        const type = child.type.toLowerCase();
                        const isPoint = type.includes('point');

                        // Heuristic: Exclude known primitive-like types that are not containers.
                        const isPrimitiveOrNonContainer = type.includes('string') || 
                                                          type.includes('double') || 
                                                          type.includes('float') || 
                                                          type.includes('integer') || 
                                                          type.includes('bool') ||
                                                          type.includes('enum');
                        
                        if (isPoint) {
                            foundOrds.add(child.ord);
                        } else if (!isPrimitiveOrNonContainer) {
                            // Aggressively assume anything that is not a point or a primitive might be a container.
                            // The try/catch wrapping the crawl call will handle errors for components that have no children.
                            await crawl(child.ord, depth + 1);
                        }
                    }
                }
            } catch (e) {
                console.warn(`Skipping path ${path}:`, e);
            }
        }

        await crawl(startPath);
        return Array.from(foundOrds);
    }

    const handleAutoDiscover = async () => {
        setIsFetching(true);
        try {
            const discovered = await clientDiscoverAllOrds(startPath, niagaraUrl, niagaraUser, niagaraPass);
            if (discovered.length === 0) {
                toast({
                    title: "No points found",
                    description: "Connected but found no points. Check the start path and credentials.",
                    variant: "default"
                });
            } else {
                setRawOrds(discovered.join('\n'));
                toast({
                    title: "Discovery Complete",
                    description: `Successfully extracted ${discovered.length} ORDs.`,
                });
            }
        } catch (error: any) {
            console.error("Discovery Error:", error);
            toast({
                title: "Connection Failed",
                description: "This is likely a CORS issue. Your Niagara station must be configured to allow requests from this website. Check the browser console (F12) for details.",
                variant: "destructive",
                duration: 9000,
            });
        } finally {
            setIsFetching(false);
        }
    };

    const handleProcess = () => {
        const ordArray = rawOrds.split('\n').map(s => s.trim()).filter(Boolean);
        if (ordArray.length === 0) {
            toast({
                title: "No ORDs provided",
                description: "Paste ORDs or use the Discovery tool to fetch them.",
                variant: "destructive"
            });
            return;
        }

        setIsLoading(true);
        
        setTimeout(() => {
            const roomsMap: Record<string, Point[]> = {};

            ordArray.forEach(ord => {
                const parts = ord.split('/');
                const pointName = parts[parts.length - 1] || 'Unknown';
                let roomName = 'Global/Unassigned';
                
                if (parts.length > 1) {
                    roomName = parts[parts.length - 2];
                }

                const category = categorizePoint(pointName);
                const label = pointName
                    .replace(/_/g, ' ')
                    .replace(/([A-Z])/g, ' $1')
                    .trim();

                const point: Point = { ord, category, label };

                if (!roomsMap[roomName]) roomsMap[roomName] = [];
                roomsMap[roomName].push(point);
            });

            const rooms: RoomMapping[] = Object.entries(roomsMap).map(([roomName, points]) => ({
                roomName,
                points
            }));

            const scriptPreview = `/**\n * Auto-generated Niagara Script\n * Room: {{RoomName}}\n */\n\npublic void onExecute() {\n${
                rooms.map(r => 
                    `  // Points for ${r.roomName}\n` + 
                    r.points.map(p => `  BStatusNumeric ${p.label.replace(/\s+/g, '')} = (BStatusNumeric) get("${p.ord}");`).join('\n')
                ).join('\n\n')
            }\n}`;

            setMapping({ rooms, generatedScriptPreview: scriptPreview });
            setIsLoading(false);
            
            toast({
                title: "Mapping Successful",
                description: `Grouped points into ${rooms.length} zones.`,
            });
        }, 300);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({
            title: "Copied!",
            description: "Content copied to clipboard.",
        });
    };

    return (
        <DraggablePanel
            id="ord-mapper-panel"
            title="ORD Mapper"
            icon={<Database className="h-5 w-5 text-primary" />}
            description="Deep discovery and automatic point mapping tool."
            initialPosition={initialPosition}
            className="w-[450px]"
        >
            <div className="space-y-4">
                <Tabs defaultValue="discovery" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="discovery">Discovery</TabsTrigger>
                        <TabsTrigger value="manual">Manual</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="discovery" className="space-y-3 pt-2">
                        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Local Connection Method</AlertTitle>
                            <AlertDescription className="text-xs">
                                This requires your Niagara station to have CORS enabled for this website's domain. Credentials are handled locally in your browser.
                            </AlertDescription>
                        </Alert>
                        <div className="space-y-1.5">
                            <Label htmlFor="niagara-url">Station URL (Local)</Label>
                            <Input 
                                id="niagara-url"
                                value={niagaraUrl} 
                                onChange={(e) => setNiagaraUrl(e.target.value)}
                                placeholder="https://192.168.1.225"
                                className="font-mono text-xs"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="niagara-user">Username</Label>
                                <Input 
                                    id="niagara-user"
                                    value={niagaraUser} 
                                    onChange={(e) => setNiagaraUser(e.target.value)}
                                    placeholder="API username"
                                    className="font-mono text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="niagara-pass">Password</Label>
                                <Input 
                                    id="niagara-pass"
                                    type="password"
                                    value={niagaraPass} 
                                    onChange={(e) => setNiagaraPass(e.target.value)}
                                    placeholder="Password"
                                    className="font-mono text-xs"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="start-path">Discovery Root Path</Label>
                            <div className="flex gap-2">
                                <Input 
                                    id="start-path"
                                    value={startPath} 
                                    onChange={(e) => setStartPath(e.target.value)}
                                    placeholder="e.g. config/Drivers"
                                    className="font-mono text-xs"
                                />
                                <Button 
                                    variant="secondary" 
                                    onClick={handleAutoDiscover} 
                                    disabled={isFetching}
                                    title="Start recursive extraction"
                                >
                                    {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                                </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground italic">Connects directly from your browser. CORS must be enabled on station.</p>
                        </div>
                    </TabsContent>

                    <TabsContent value="manual" className="pt-2">
                        <Textarea
                            value={rawOrds}
                            onChange={(e) => setRawOrds(e.target.value)}
                            placeholder="Paste raw ORDs (one per line)..."
                            className="h-24 font-mono text-xs resize-none bg-muted/50"
                        />
                    </TabsContent>
                </Tabs>

                <Button onClick={handleProcess} disabled={isLoading || !rawOrds} className="w-full shadow-lg">
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />}
                    Map & Group Points
                </Button>

                {mapping && (
                    <Tabs defaultValue="mapped" className="w-full mt-4">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="mapped">Mapped Zones</TabsTrigger>
                            <TabsTrigger value="script">Script</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="mapped" className="mt-4 space-y-4 max-h-80 overflow-auto pr-2 scrollbar-thin scrollbar-thumb-primary">
                            {mapping.rooms.map((room, idx) => (
                                <div key={idx} className="border rounded-md p-3 bg-muted/30 border-primary/20">
                                    <h4 className="font-bold text-sm text-primary mb-2 flex items-center justify-between">
                                        {room.roomName}
                                        <span className="text-[10px] font-normal text-muted-foreground bg-secondary px-1.5 rounded">{room.points.length} pts</span>
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
                                <Button size="icon" variant="secondary" className="absolute right-2 top-2 h-8 w-8 z-10" onClick={() => copyToClipboard(mapping.generatedScriptPreview)}>
                                    <Copy className="h-4 w-4" />
                                </Button>
                                <pre className="bg-muted p-4 rounded-md text-[11px] font-mono whitespace-pre-wrap overflow-x-auto border border-border/50 max-h-80">
                                    <code>{mapping.generatedScriptPreview}</code>
                                </pre>
                            </div>
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </DraggablePanel>
    );
}
