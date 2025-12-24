// coordinate-explanation.ts
'use server';

/**
 * @fileOverview Explains the x, y, and z coordinates in the context of the 3D model.
 *
 * - explainCoordinates - A function that explains the coordinates.
 * - CoordinateExplanationInput - The input type for the explainCoordinates function.
 * - CoordinateExplanationOutput - The return type for the explainCoordinates function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CoordinateExplanationInputSchema = z.object({
  x: z.number().describe('The x coordinate.'),
  y: z.number().describe('The y coordinate.'),
  z: z.number().describe('The z coordinate.'),
  modelDescription: z.string().describe('A description of the 3D model.'),
});
export type CoordinateExplanationInput = z.infer<typeof CoordinateExplanationInputSchema>;

const CoordinateExplanationOutputSchema = z.object({
  explanation: z.string().describe('An explanation of the x, y, and z coordinates in the context of the 3D model.'),
});
export type CoordinateExplanationOutput = z.infer<typeof CoordinateExplanationOutputSchema>;

export async function explainCoordinates(input: CoordinateExplanationInput): Promise<CoordinateExplanationOutput> {
  return coordinateExplanationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'coordinateExplanationPrompt',
  input: {schema: CoordinateExplanationInputSchema},
  output: {schema: CoordinateExplanationOutputSchema},
  prompt: `You are an expert in 3D modeling and coordinate systems. A user has clicked on a 3D model at the following coordinates:

X: {{{x}}}
Y: {{{y}}}
Z: {{{z}}}

Model Description: {{{modelDescription}}}

Explain what these coordinates mean in the context of the 3D model. Be concise and use plain language.`,
});

const coordinateExplanationFlow = ai.defineFlow(
  {
    name: 'coordinateExplanationFlow',
    inputSchema: CoordinateExplanationInputSchema,
    outputSchema: CoordinateExplanationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
