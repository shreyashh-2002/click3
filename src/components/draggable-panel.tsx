
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

type DraggablePanelProps = {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  children: React.ReactNode;
  initialPosition: { x: number; y: number };
  className?: string;
};

export default function DraggablePanel({ id, title, icon, description, children, initialPosition, className }: DraggablePanelProps) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const [windowSize, setWindowSize] = useState({width: 0, height: 0});

  useEffect(() => {
    const handleResize = () => {
        setWindowSize({width: window.innerWidth, height: window.innerHeight});
    }
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!panelRef.current) return;
    
    const target = e.target as HTMLElement;
    // Allow dragging only from the header, identified by the cursor-grab class
    if (!target.closest('.cursor-grab')) {
      return;
    }
    
    const rect = panelRef.current.getBoundingClientRect();
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    // Prevent text selection while dragging
    e.preventDefault();
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !panelRef.current) return;
    
    const parent = panelRef.current.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const panelRect = panelRef.current.getBoundingClientRect();

    let newX = e.clientX - dragOffset.current.x;
    let newY = e.clientY - dragOffset.current.y;
    
    // Constrain movement within the parent element
    newX = Math.max(0, Math.min(newX, parentRect.width - panelRect.width));
    newY = Math.max(0, Math.min(newY, parentRect.height - panelRect.height));

    setPosition({ x: newX, y: newY });
  }, [isDragging]);

  const onMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);
  
  // Update position if initialPosition changes (e.g., on window resize)
  useEffect(() => {
    setPosition(initialPosition);
  }, [initialPosition]);

  return (
    <div
      ref={panelRef}
      id={id}
      style={{ 
        top: `${position.y}px`, 
        left: `${position.x}px`,
        position: 'absolute'
      }}
      className={cn('z-20', className)}
    >
      <Card className="bg-background/80 backdrop-blur-sm border-border/50 shadow-2xl">
        <CardHeader className="cursor-grab active:cursor-grabbing p-4" onMouseDown={onMouseDown}>
          <div className="flex items-center gap-2">
            {icon}
            <div className="flex-1">
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <GripVertical className="w-5 h-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">{children}</CardContent>
      </Card>
    </div>
  );
};
