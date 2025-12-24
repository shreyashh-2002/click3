"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Grab } from 'lucide-react';
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

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!panelRef.current) return;
    // Prevent dragging when interacting with form elements
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLButtonElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target.closest('textarea')
    ) {
      return;
    }
    const rect = panelRef.current.getBoundingClientRect();
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    e.preventDefault();
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    });
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
  
  // Ensure the panel repositions if the initial position changes (e.g. on window resize)
  useEffect(() => {
    setPosition(initialPosition);
  }, [initialPosition]);

  return (
    <div
      ref={panelRef}
      id={id}
      style={{ top: `${position.y}px`, left: `${position.x}px` }}
      className={cn('absolute z-20 w-96', className)}
    >
      <Card className="bg-background/80 backdrop-blur-sm border-border/50 shadow-2xl">
        <CardHeader onMouseDown={onMouseDown} className="cursor-grab active:cursor-grabbing">
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
            <Grab className="w-4 h-4 ml-auto text-muted-foreground" />
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
};
