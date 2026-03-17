"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Database, Loader2, Filter, Globe, AlertCircle, CheckCircle2, Network, ShieldAlert } from 'lucide-react';
import DraggablePanel from './draggable-panel';
import { discoverOrdsServer, testNiagaraConnection } from '@/app/actions/niagara';
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
    const [startPath, setStartPath] = useState('Config');
    const [mapping, setMapping] = useState<PointMappingOutput | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [diagnosticInfo, setDiagnosticInfo] = useState<string | null>(null);
    const [connectedStation, setConnectedStation] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        setStationUrl(localStorage.getItem('niagara-url') || '');
        setUsername(localStorage.getItem('niagara-user') || '');
    }, []);

    const saveCredentials = () => {
        localStorage.setItem('niagara-url', stationUrl);
        localStorage.setItem('niagara-user', username);
    };

    const handleTestConnection = async () => {
        if (!stationUrl || !username || !password) {
            toast({ title: "Missing Credentials", description: "Please enter Station URL, Username, and Password.", variant: "destructive" });
            return;
        }

        setIsTesting(true);
        setFetchError(null);
        setDiagnosticInfo(null);
        setConnectedStation(null);
        saveCredentials();

        try {
            const result = await testNiagaraConnection({
                url: stationUrl,
                user: username,
                pass: password
            });

            if (result.success && result.data) {
                setConnectedStation(result.data.stationName);
                toast({ 
                    title: "Connection Success!", 
                    description: `Successfully reached station: ${result.data.stationName}`,
                });
            } else {
                setFetchError(result.error || "Connection failed.");
                setDiagnosticInfo(result.diagnostic || null);
            }
        } catch (error: any) {
            setFetchError("Unexpected error occurred.");
            setDiagnosticInfo("The client failed to execute the server action.");
        } finally {
            setIsTesting(false);
        }
    };

    const handleAutoDiscover = async () => {
        if (!stationUrl || !username || !password) {
            toast({ title: "Missing Credentials", description: "Please enter Station URL, Username, and Password.", variant: "destructive" });
            return;
        }

        setIsFetching(true);
        setFetchError(null);
        setDiagnosticInfo(null);
        setRawOrds('');
        setMapping(null);
        saveCredentials();

        try {
            const result = await discoverOrdsServer(startPath, {
                url: stationUrl,
                user: username,
                pass: password
            });

            if (result.success && result.data) {
                if (result.data.length === 0) {
                    setFetchError("Discovery finished but no points were found.");
                    setDiagnosticInfo("The path was reached, but no children were found. Check the 'Root Path'.");
                } else {
                    setRawOrds(result.data.join('\n'));
                    toast({ title: "Discovery Complete", description: `Found ${result.data.length} ORDs.` });
                }
            } else {
                setFetchError(result.error || "Discovery failed.");
                setDiagnosticInfo(result.diagnostic || null);
            }
        } catch (error: any) {
            setFetchError("Unexpected discovery failure.");
        } finally {
            setIsFetching(false);
        }
    };
    
    const handleProcess = () => {
        const ordArray = rawOrds.split('\n').map(s => s.trim()).filter(Boolean);
        if (ordArray.length === 0) {
            toast({ title: "No ORDs", description: "Paste ORDs or use the Discovery tool.", variant: "destructive" });
            return;
        }

        setIsLoading(true);
        
        setTimeout(() => {
            const roomsMap: Record<string, Point[]> = {};

            ordArray.forEach(ord => {
                const parts = ord.split('/');
                const pointName = parts[parts.length - 1] || 'Unknown';
                let roomName = 'Global/Unassigned';
                
                if (parts.length > 2) {
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
                <Alert className="bg-blue-500/5 border-blue-500/20 py-2 px-3">
                    <Network className="h-4 w-4 text-blue-500" />
                    <AlertTitle className="text-xs font-bold text-blue-600 uppercase">Networking Note</AlertTitle>
                    <AlertDescription className="text-[10px] text-blue-700 leading-tight">
                        Cloud apps cannot see local IPs (192.x). Use a public URL or run the app locally.
                    </AlertDescription>
                </Alert>

                {connectedStation && (
                    <Alert className="bg-green-500/10 border-green-500/20 py-2 px-3">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AlertTitle className="text-xs font-bold text-green-600">Connected</AlertTitle>
                        <AlertDescription className="text-[10px] text-green-700">
                            Verified connection to: <strong>{connectedStation}</strong>
                        </AlertDescription>
                    </Alert>
                )}

                {fetchError && (
                    <Alert variant="destructive" className="py-2 px-3">
                        <ShieldAlert className="h-4 w-4" />
                        <AlertTitle className="text-xs font-bold uppercase">{fetchError}</AlertTitle>
                        <AlertDescription className="text-[10px] leading-tight mt-1">
                            {diagnosticInfo || "No additional diagnostic info available."}
                        </AlertDescription>
                    </Alert>
                )}

                <div className="space-y-3 pt-2">
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
                        <Label htmlFor="niagara-url">Station URL (HTTPS)</Label>
                        <div className="flex gap-2">
                            <Input id="niagara-url" value={stationUrl} onChange={(e) => setStationUrl(e.target.value)} placeholder="https://192.168.1.225" onBlur={saveCredentials} />
                            <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={isTesting}>
                                {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="start-path">Root Path</Label>
                        <div className="flex gap-2">
                            <Input id="start-path" value={startPath} onChange={(e) => setStartPath(e.target.value)} className="font-mono text-xs" placeholder="Config" />
                            <Button variant="secondary" onClick={handleAutoDiscover} disabled={isFetching}>
                                {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </div>

                <Button onClick={handleProcess} disabled={isLoading || !rawOrds} className="w-full shadow-lg">
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />}
                    Map & Group Points
                </Button>

                {mapping && (
                    <div className="mt-4 space-y-4 max-h-80 overflow-auto pr-2">
                        {mapping.rooms.map((room, idx) => (
                            <div key={idx} className="border rounded-md p-3 bg-muted/30">
                                <h4 className="font-bold text-sm text-primary mb-2">{room.roomName}</h4>
                                <ul className="space-y-1">
                                    {room.points.map((p, pIdx) => (
                                        <li key={pIdx} className="text-[11px] flex justify-between">
                                            <span>{p.label}</span>
                                            <span className="text-[8px] uppercase px-1 rounded bg-primary/10 text-primary">{p.category}</span>
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
