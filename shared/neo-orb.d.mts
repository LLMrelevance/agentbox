// Types for ./neo-orb.mjs, for the renderer's TypeScript.
export const NEO: {
  width: number; height: number; orb: number; cx: number; cy: number;
  cardWidth: number; cardGap: number; controls: number; cardLeft: number; cardRight: number;
};
export const SPEEDS: readonly number[];
export function okSpeed(value: unknown): number;
export function defaultOrbPoint(workArea: { x: number; y: number; width: number; height: number }): { x: number; y: number };
export function placeOrb(o: { workArea: { x: number; y: number; width: number; height: number }; point: { x: number; y: number } }):
  { bounds: { x: number; y: number; width: number; height: number }; cardSide: 'left' | 'right'; point: { x: number; y: number } };
