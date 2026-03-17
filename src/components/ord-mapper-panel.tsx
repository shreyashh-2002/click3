"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Database, Loader2, Filter, Globe, ShieldAlert, CheckCircle2, ShieldCheck, HelpCircle } from 'lucide-react';
import DraggablePanel from './draggable-panel';
import { discoverOrdsServer, testNiagaraConnection } from '@/app/actions/niagara';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

interface OrdMapperPanelProps {
    initialPosition: { x: number; y: number };
}

export default function OrdMapperPanel({ initialPosition }: OrdMapperPanelProps) {
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
            toast({ title: "Missing Credentials", description: "Enter all fields.", variant: "destructive" });
            return;
        }
        setIsTesting(true);
        setFetchError(null);
        setDiagnosticInfo(null);
        setConnectedStation(null);
        saveCredentials();

        try {
            const result = await testNiagaraConnection({ url: stationUrl, user: username, pass: password });
            if (result.success && result.data) {
                setConnectedStation(result.data.stationName);
                toast({ title: "Connected!", description: `Reached: ${result.data.stationName}` });
            } else {
                setFetchError(result.error || "Connection Failed");
                setDiagnosticInfo(result.diagnostic || null);
            }
        } catch (e) {
            setFetchError("ACTION_CRASH");
            setDiagnosticInfo("The server action encountered an unexpected error.");
        }
        setIsTesting(false);
    };

    const handleAutoDiscover = async () => {
        if (!stationUrl || !username || !password) return;
        setIsFetching(true);
        setFetchError(null);
        setDiagnosticInfo(null);
        const result = await discoverOrdsServer(startPath, { url: stationUrl, user: username, pass: password });
        if (result.success && result.data) {
            const roomsMap: Record<string, Point[]> = {};
            result.data.forEach(ord => {
                const parts = ord.split('/');
                const pointName = parts[parts.length - 1] || 'Point';
                let roomName = parts.length > 2 ? parts[parts.length - 2] : 'Global';
                const categorize = (n: string): Point['category'] => {
                    const l = n.toLowerCase();
                    if (l.includes('temp')) return 'Temperature';
                    if (l.includes('set')) return 'Setpoint';
                    if (l.includes('hum')) return 'Humidity';
                    return 'Other';
                };
                const point: Point = { ord, category: categorize(pointName), label: pointName.replace(/_/g, ' ') };
                if (!roomsMap[roomName]) roomsMap[roomName] = [];
                roomsMap[roomName].push(point);
            });
            setMapping({ rooms: Object.entries(roomsMap).map(([roomName, points]) => ({ roomName, points })), generatedScriptPreview: '' });
            toast({ title: "Discovery Complete", description: `Found ${result.data.length} points.` });
        } else {
            setFetchError(result.error || "Discovery Failed");
            setDiagnosticInfo(result.diagnostic || null);
        }
        setIsFetching(false);
    };

    return (
        <DraggablePanel
            id="ord-mapper-panel"
            title="Niagara Connectivity"
            icon={<Database className="h-5 w-5 text-primary" />}
            description="Manage your Niagara 4 data bridge."
            initialPosition={initialPosition}
            className="w-[450px]"
        >
            <div className="space-y-4">
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="security-checklist" className="border-none">
                        <AccordionTrigger className="py-2 hover:no-underline">
                            <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
                                <ShieldCheck className="h-4 w-4" />
                                NIAGARA SECURITY CHECKLIST
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="bg-amber-500/5 rounded-md p-3 space-y-2 border border-amber-500/20">
                            <ul className="text-[10px] space-y-1 text-amber-700 list-disc pl-4">
                                <li><strong>Empty Header Fix:</strong> If Workbench logs silence, go to <code>WebService</code> and ensure <strong>Basic</strong> or <strong>Digest</strong> is checked in <code>Authentication Schemes</code>.</li>
                                <li><strong>User Lockout:</strong> Check <code>UserService</code> to see if the user is currently locked.</li>
                                <li><strong>CORS:</strong> Add <code>http://localhost:9002</code> to 'Allowed Origins' in WebService.</li>
                                <li><strong>Logs:</strong> Check <strong>Application Director</strong> in Workbench.</li>
                            </ul>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {connectedStation && (
                    <Alert className="bg-green-500/10 border-green-500/20 py-2 px-3">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AlertTitle className="text-xs font-bold text-green-600">CONNECTED</AlertTitle>
                        <AlertDescription className="text-[10px] text-green-700">Reached: <strong>{connectedStation}</strong></AlertDescription>
                    </Alert>
                )}

                {fetchError && (
                    <Alert variant="destructive" className="py-2 px-3">
                        <ShieldAlert className="h-4 w-4" />
                        <AlertTitle className="text-xs font-bold uppercase">{fetchError}</AlertTitle>
                        <AlertDescription className="text-[10px] mt-1">{diagnosticInfo}</AlertDescription>
                    </Alert>
                )}

                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">User</Label>
                        <Input value={username} onChange={(e) => setUsername(e.target.value)} onBlur={saveCredentials} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">Pass</Label>
                        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-8 text-xs" />
                    </div>
                </div>

                <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Station URL (HTTPS)</Label>
                    <div className="flex gap-2">
                        <Input value={stationUrl} onChange={(e) => setStationUrl(e.target.value)} placeholder="https://127.0.0.1" className="h-8 text-xs flex-1" />
                        <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={isTesting} className="h-8">
                            {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
                        </Button>
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="flex items-center gap-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">Discovery Path</Label>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent><p className="text-[10px]">Start crawling from here (e.g. Config)</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <div className="flex gap-2">
                        <Input value={startPath} onChange={(e) => setStartPath(e.target.value)} className="h-8 text-xs font-mono flex-1" />
                        <Button variant="secondary" size="sm" onClick={handleAutoDiscover} disabled={isFetching} className="h-8">
                            {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3 mr-1" />}
                            Discover
                        </Button>
                    </div>
                </div>

                {mapping && (
                    <div className="mt-2 max-h-48 overflow-auto space-y-2 pr-1 border-t pt-2">
                        {mapping.rooms.map((room, idx) => (
                            <div key={idx} className="bg-muted/40 p-2 rounded border border-border/50">
                                <p className="text-[10px] font-bold text-primary mb-1 uppercase tracking-tighter">{room.roomName}</p>
                                <div className="space-y-0.5">
                                    {room.points.map((p, pIdx) => (
                                        <div key={pIdx} className="flex justify-between items-center text-[9px] hover:bg-primary/5 p-0.5 rounded transition-colors">
                                            <span className="truncate max-w-[150px]">{p.label}</span>
                                            <span className="bg-primary/10 text-primary px-1 rounded-sm uppercase font-bold text-[7px]">{p.category}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </DraggablePanel>
    );
}
