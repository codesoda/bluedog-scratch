/** Shared scene palette builder: every scene uses the same outline ink. */
const INK = '#1f2a4d';

/**
 * Build a scene palette from grouped colour pairs.
 * @param {{sky:[string,string], ground:[string,string], accents:[string,string,string], wall:string, wood:string}} colours
 */
export function scenePalette({ sky, ground, accents, wall, wood }) {
  const [skyTop, skyLow] = sky;
  const [groundTop, groundDark] = ground;
  const [accent, accent2, accent3] = accents;
  return { sky: skyTop, skyLow, ground: groundTop, groundDark, wall, accent, accent2, accent3, wood, ink: INK };
}
