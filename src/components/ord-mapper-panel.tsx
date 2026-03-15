"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Database, Loader2, Copy, Filter, Globe, Zap, ShieldCheck, AlertCircle, Info } from 'lucide-react';
import DraggablePanel from './draggable-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { discoverOrdsServer } from '@/app/actions/niagara';
import { Switch } from "@/components/ui/switch";
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
    const [stationUrl, setStationUrl] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [startPath, setStartPath] = useState('Config/Drivers');
    const [mapping, setMapping] = useState<PointMappingOutput | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [isDirectMode, setIsDirectMode] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        setStationUrl(localStorage.getItem('niagara-url') || '');
        setUsername(localStorage.getItem('niagara-user') || '');
        const savedMode = localStorage.getItem('niagara-direct-mode');
        if (savedMode) setIsDirectMode(savedMode === 'true');
    }, []);

    const saveCredentials = () => {
        localStorage.setItem('niagara-url', stationUrl);
        localStorage.setItem('niagara-user', username);
        localStorage.setItem('niagara-direct-mode', isDirectMode.toString());
    };

    const handleAutoDiscover = async () => {
        if (!stationUrl || !username || !password) {
            toast({ title: "Missing Credentials", description: "Please enter Station URL, Username, and Password.", variant: "destructive" });
            return;
        }

        setIsFetching(true);
        setFetchError(null);
        setRawOrds('');
        setMapping(null);
        saveCredentials();

        try {
            let ords: string[] = [];

            if (isDirectMode) {
                const auth = btoa(`${username}:${password}`);
                const baseUrl = stationUrl.endsWith('/') ? stationUrl.slice(0, -1) : stationUrl;
                const url = `${baseUrl}/api/v1/read?ord=${encodeURIComponent(startPath)}`;
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Accept': 'application/json',
                    },
                });

                if (!response.ok) throw new Error(`Browser direct fetch failed: HTTP ${response.status}`);
                const data = await response.json();
                
                if (data && Array.isArray(data.children)) {
                    ords = data.children
                        .filter((c: any) => (c.type || '').toLowerCase().includes('point'))
                        .map((c: any) => c.ord);
                }
            } else {
                ords = await discoverOrdsServer(startPath, {
                    url: stationUrl,
                    user: username,
                    pass: password
                });
            }

            if (ords.length === 0) {
                toast({ title: "No Points Found", description: "Discovery finished, but no points were found at this path.", variant: "default" });
            } else {
                setRawOrds(ords.join('\n'));
                toast({ title: "Discovery Complete", description: `Found ${ords.length} ORDs.` });
            }
        } catch (error: any) {
            console.error("Discovery Error:", error);
            const msg = error.message === '503' ? "Station is busy. Try a deeper starting path to reduce load." : error.message;
            setFetchError(msg || "Connection failed.");
            
            toast({ 
                title: "Discovery Error", 
                description: msg || "Check connectivity.",
                variant: "destructive" 
            });
        } finally {
            setIsFetching(false);
        }
    };
    
    const handleProcess = () => {
        const ordArray = rawOrds.split('\n').map(s => s.trim()).filter(Boolean);
        if (ordArray.length === 0) {
            toast({ title: "No ORDs provided", description: "Paste ORDs or use the Discovery tool.", variant: "destructive" });
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

                const categorizePoint = (name: string): Point['category'] => {
                    const n = name.toLowerCase();
                    if (n.includes('temp')) return 'Temperature';
                    if (n.includes('set') || n.includes('sp')) return 'Setpoint';
                    if (n.includes('hum')) return 'Humidity';
                    if (n.includes('occ')) return 'Occupancy';
                    if (n.includes('stat')) return 'Status';
                    if (n.includes('cmd')) return 'Command';
                    return 'Other';
                };

                const label = pointName.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
                const point: Point = { ord, category: categorizePoint(pointName), label };

                if (!roomsMap[roomName]) roomsMap[roomName] = [];
                roomsMap[roomName].push(point);
            });

            const rooms: RoomMapping[] = Object.entries(roomsMap).map(([roomName, points]) => ({ roomName, points }));
            const scriptPreview = `/**\n * Auto-generated Niagara Script\n */\n${rooms.map(r => `// ${r.roomName}\n` + r.points.map(p => `BStatusNumeric ${p.label.replace(/\s+/g, '')} = (BStatusNumeric) BOrd.make("${p.ord}").get();`).join('\n')).join('\n\n')}`;
            setMapping({ rooms, generatedScriptPreview: scriptPreview });
            setIsLoading(false);
        }, 300);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: "Copied!", description: "Content copied to clipboard." });
    };

    return (
        <DraggablePanel
            id="ord-mapper-panel"
            title="ORD Mapper"
            icon={<Database className="h-5 w-5 text-primary" />}
            description="Bridge Niagara station data into your 3D view."
            initialPosition={initialPosition}
            className="w-[450px]"
        >
            <div className="space-y-4">
                <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg border border-border/50">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                            {isDirectMode ? <Zap className="size-3 text-yellow-500" /> : <ShieldCheck className="size-3 text-blue-500" />}
                            Connection Mode
                        </span>
                        <span className="text-xs font-medium">
                            {isDirectMode ? "Direct (Browser)" : "Server Proxy (Local Node)"}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Label htmlFor="mode-toggle" className="sr-only">Toggle Mode</Label>
                        <Switch 
                            id="mode-toggle" 
                            checked={isDirectMode} 
                            onCheckedChange={(checked) => {
                                setIsDirectMode(checked);
                                localStorage.setItem('niagara-direct-mode', checked.toString());
                                setFetchError(null);
                            }}
                        />
                    </div>
                </div>

                {fetchError && (
                    <Alert variant="destructive" className="py-2 px-3 animate-in fade-in slide-in-from-top-1">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="text-xs">Connection Warning</AlertTitle>
                        <AlertDescription className="text-[10px] leading-tight">
                            {fetchError}
                        </AlertDescription>
                    </Alert>
                )}

                {!isDirectMode && (
                    <Alert className="py-2 px-3 bg-primary/5 border-primary/20">
                        <Info className="h-4 w-4 text-primary" />
                        <AlertDescription className="text-[10px] text-muted-foreground">
                            Using 500ms request delays to protect the station. Discovery will be slower but safer.
                        </AlertDescription>
                    </Alert>
                )}

                <Tabs defaultValue="discovery" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="discovery">Discovery</TabsTrigger>
                        <TabsTrigger value="manual">Manual</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="discovery" className="space-y-3 pt-2">
                         <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="niagara-user">Username</Label>
                                <Input id="niagara-user" value={username} onChange={(e) => setUsername(e.target.value)} onBlur={saveCredentials} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="niagara-pass">Password</Label>
                                <Input id="niagara-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="niagara-url">Station URL</Label>
                            <Input id="niagara-url" value={stationUrl} onChange={(e) => setStationUrl(e.target.value)} placeholder="http://192.168.1.225" onBlur={saveCredentials} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="start-path">Discovery Root Path</Label>
                            <div className="flex gap-2">
                                <Input id="start-path" value={startPath} onChange={(e) => setStartPath(e.target.value)} className="font-mono text-xs" />
                                <Button variant="secondary" onClick={handleAutoDiscover} disabled={isFetching}>
                                    {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                                </Button>
                            </div>
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
                        <TabsContent value="mapped" className="mt-4 space-y-4 max-h-80 overflow-auto pr-2">
                            {mapping.rooms.map((room, idx) => (
                                <div key={idx} className="border rounded-md p-3 bg-muted/30">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="font-bold text-sm text-primary">{room.roomName}</h4>
                                        <span className="text-[9px] font-normal text-muted-foreground bg-background px-1.5 py-0.5 rounded-full border border-border/50">{room.points.length} pts</span>
                                    </div>
                                    <ul className="space-y-1">
                                        {room.points.map((p, pIdx) => (
                                            <li key={pIdx} className="text-[11px] flex justify-between items-center border-b border-border/50 pb-1 last:border-0 last:pb-0">
                                                <span className="font-medium truncate mr-2" title={p.ord}>{p.label}</span>
                                                <span className="text-[8px] uppercase px-1 rounded bg-primary/10 text-primary shrink-0">{p.category}</span>
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
                                <pre className="bg-muted p-4 rounded-md text-[10px] font-mono whitespace-pre-wrap overflow-x-auto max-h-80">
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
