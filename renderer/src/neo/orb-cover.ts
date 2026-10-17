// IS THE ORB SITTING ON TOP OF THIS PART OF THE APP?
//
// The summary's Status and Owner block steps back while the orb covers it and
// comes forward when the orb is dragged off (w-5520063011). The orb is round,
// so a box test would call a corner covered that the orb does not reach, and
// the block would stay faded with nothing over it.
//
// tests/the-block-behind-the-orb-waits-until-the-orb-moves-off-it.test.mjs
export type Orb = { x: number; y: number; r: number };
export type Box = { left: number; top: number; right: number; bottom: number };

export function orbCovers(orb: Orb | null, box: Box | null): boolean {
  if (!orb || !box) return false;
  const near = { x: Math.min(Math.max(orb.x, box.left), box.right), y: Math.min(Math.max(orb.y, box.top), box.bottom) };
  return (orb.x - near.x) ** 2 + (orb.y - near.y) ** 2 < orb.r ** 2;
}
