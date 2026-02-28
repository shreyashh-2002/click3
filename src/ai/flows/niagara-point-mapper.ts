'use server';
/**
 * @fileOverview Niagara Point Mapping AI Agent.
 *
 * - mapNiagaraPoints - Analyzes raw ORDs and categorizes them by room and type.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const PointMappingInputSchema = z.object({
  rawOrds: z.array(z.string()).describe('A list of raw Niagara ORDs extracted from the station.'),
});
export type PointMappingInput = z.infer<typeof PointMappingInputSchema>;

const PointMappingOutputSchema = z.object({
  rooms: z.array(z.object({
    roomName: z.string().describe('The name of the room or zone identified from the path.'),
    points: z.array(z.object({
      ord: z.string().describe('The original Niagara ORD.'),
      category: z.enum(['Temperature', 'Setpoint', 'Humidity', 'Occupancy', 'Status', 'Command', 'Other']),
      label: z.string().describe('A friendly human-readable label for the point.'),
    }))
  }))
});
export type PointMappingOutput = z.infer<typeof PointMappingOutputSchema>;

const mapperPrompt = ai.definePrompt({
  name: 'niagaraPointMapper',
  input: { schema: PointMappingInputSchema },
  output: { schema: PointMappingOutputSchema },
  prompt: `
    You are a Niagara 4 Systems Integrator expert. 
    You will receive a list of raw ORDs (Object Reference Detectors) from a station.
    
    Your task:
    1. Parse the paths to identify individual rooms or equipment zones.
    2. Categorize each point based on its name and path (e.g., "SpaceTemp" is Temperature, "Occ" is Occupancy).
    3. Generate a clean, friendly label for each point.
    
    Here are the ORDs:
    {{#each rawOrds}}
    - {{{this}}}
    {{/each}}
  `,
});

export async function mapNiagaraPoints(input: PointMappingInput): Promise<PointMappingOutput> {
  const { output } = await mapperPrompt(input);
  if (!output) throw new Error("AI failed to generate mapping.");
  return output;
}
