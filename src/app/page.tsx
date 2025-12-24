"use client";

import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Info, HelpCircle } from 'lucide-react';
import ThreeScene from '@/components/three-scene';
import { explainCoordinates } from '@/ai/flows/coordinate-explanation';
import { getSuggestedActions } from '@/ai/flows/suggested-actions';
import { Skeleton } from '@/components/ui/skeleton';

export default function Home() {
  const [coords, setCoords] = useState<THREE.Vector3 | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [actions, setActions] = useState<string[] | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  const handleCoordChange = (newCoords: THREE.Vector3 | null) => {
    setCoords(newCoords);
  };
  
  useEffect(() => {
    if (coords) {
      const fetchAIInsights = async () => {
        setIsLoadingAI(true);
        setExplanation(null);
        setActions(null);

        try {
          const [explanationResult, actionsResult] = await Promise.all([
            explainCoordinates({ x: coords.x, y: coords.y, z: coords.z, modelDescription: "A torus knot model." }),
            getSuggestedActions({ x: coords.x, y: coords.y, z: coords.z })
          ]);
          setExplanation(explanationResult.explanation);
          setActions(actionsResult.actions);
        } catch (error) {
          console.error("Error fetching AI insights:", error);
          setExplanation("Could not get an explanation for these coordinates.");
          setActions([]);
        } finally {
          setIsLoadingAI(false);
        }
      };
      fetchAIInsights();
    } else {
      setExplanation(null);
      setActions(null);
    }
  }, [coords]);

  return (
    <main className="flex h-screen w-screen flex-col lg:flex-row bg-background text-foreground overflow-hidden">
      <div className="flex-grow h-1/2 lg:h-full lg:w-3/4 relative">
        <header className="absolute top-0 left-0 p-6 z-10">
          <h1 className="text-3xl font-bold font-headline text-primary">Click Tracer</h1>
          <p className="text-lg text-muted-foreground">Click on the model to get coordinates</p>
        </header>
        <ThreeScene onCoordChange={handleCoordChange} />
      </div>
      <aside className="h-1/2 lg:h-full lg:w-1/4 p-4 lg:p-6 border-t lg:border-t-0 lg:border-l border-border">
        <Card className="h-full w-full flex flex-col bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Coordinate Data
            </CardTitle>
            <CardDescription>
              {coords ? "Information about the selected point." : "Click on the model to see details."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 overflow-y-auto flex-grow">
            <div>
              <h3 className="font-semibold text-lg mb-2">Coordinates</h3>
              {coords ? (
                <div className="p-4 bg-muted rounded-lg font-mono text-sm space-y-1">
                  <p><span className="font-bold text-primary">X:</span> {coords.x.toFixed(4)}</p>
                  <p><span className="font-bold text-primary">Y:</span> {coords.y.toFixed(4)}</p>
                  <p><span className="font-bold text-primary">Z:</span> {coords.z.toFixed(4)}</p>
                </div>
              ) : (
                <p className="text-muted-foreground italic p-4 bg-muted rounded-lg text-center">No point selected.</p>
              )}
            </div>

            {(coords || isLoadingAI) && (
              <>
                <div>
                  <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                    <HelpCircle className="h-5 w-5 text-accent" />
                    AI Explanation
                  </h3>
                  {isLoadingAI ? (
                     <div className="space-y-2 p-4 bg-muted rounded-lg">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                     </div>
                  ) : (
                    <p className="text-sm text-muted-foreground p-4 bg-muted rounded-lg">{explanation}</p>
                  )}
                </div>
                
                <div>
                  <h3 className="font-semibold text-lg mb-2">Suggested Actions</h3>
                   {isLoadingAI ? (
                     <div className="space-y-2">
                       <Skeleton className="h-10 w-full" />
                       <Skeleton className="h-10 w-full" />
                     </div>
                   ) : (
                    <div className="flex flex-col gap-2">
                      {actions && actions.length > 0 ? actions.map((action, index) => (
                        <Button key={index} variant="outline" className="justify-start text-left h-auto py-2">
                          {action}
                        </Button>
                      )) : <p className="text-sm text-muted-foreground p-4 bg-muted rounded-lg text-center">No suggested actions.</p>}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </aside>
    </main>
  );
}
