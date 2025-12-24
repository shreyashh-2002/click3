'use server';

/**
 * @fileOverview Provides suggested actions based on the clicked coordinates.
 *
 * - getSuggestedActions - A function that returns suggested actions based on the input coordinates.
 * - SuggestedActionsInput - The input type for the getSuggestedActions function.
 * - SuggestedActionsOutput - The return type for the getSuggestedActions function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestedActionsInputSchema = z.object({
  x: z.number().describe('The x-coordinate of the click location.'),
  y: z.number().describe('The y-coordinate of the click location.'),
  z: z.number().describe('The z-coordinate of the click location.'),
});
export type SuggestedActionsInput = z.infer<typeof SuggestedActionsInputSchema>;

const SuggestedActionsOutputSchema = z.object({
  actions: z.array(
    z.string().describe('A list of suggested actions based on the coordinates.')
  ).describe('The list of suggested actions.')
});
export type SuggestedActionsOutput = z.infer<typeof SuggestedActionsOutputSchema>;

export async function getSuggestedActions(input: SuggestedActionsInput): Promise<SuggestedActionsOutput> {
  return suggestedActionsFlow(input);
}

const suggestedActionsPrompt = ai.definePrompt({
  name: 'suggestedActionsPrompt',
  input: {schema: SuggestedActionsInputSchema},
  output: {schema: SuggestedActionsOutputSchema},
  prompt: `You are an AI assistant that provides a list of suggested actions based on the provided 3D coordinates. 

  The coordinates are:
  X: {{x}}
  Y: {{y}}
  Z: {{z}}

  Return a list of possible actions that the user may want to take with these coordinates. The actions should be short and concise.
  Possible actions are:
  - Measure distance to another point
  - Export data
  - Create a new object at these coordinates
  - Set as origin
  - Transform object

  Return the output as a JSON object with a single key called "actions" which is an array of strings.
  `,
});

const suggestedActionsFlow = ai.defineFlow(
  {
    name: 'suggestedActionsFlow',
    inputSchema: SuggestedActionsInputSchema,
    outputSchema: SuggestedActionsOutputSchema,
  },
  async input => {
    const {output} = await suggestedActionsPrompt(input);
    return output!;
  }
);
