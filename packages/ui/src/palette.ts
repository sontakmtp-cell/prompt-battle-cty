import type { Team, TriType } from "@prompt-chien/contracts";

// Scissor on team A is darker than #E67E22 so the fill stays at least 3:1 against white.
export const TEAM_FILL: Record<Team, Record<TriType, string>> = {
  A: { hammer: "#C0392B", scissor: "#D26E14", paper: "#A0821A", motor: "#E8EBEF" },
  B: { hammer: "#1D4ED8", scissor: "#0E9488", paper: "#4D7C3A", motor: "#E8EBEF" },
};
export const TEAM_INK: Record<Team, string> = { A: "#8E2A22", B: "#1E3A8A" };

const HEAT: readonly [number, string][] = [[0.25, "#FAC775"], [0.5, "#EF9F27"], [0.75, "#D85A30"], [1, "#A32D2D"]];

export function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r ?? 0) + 0.7152 * channel(g ?? 0) + 0.0722 * channel(b ?? 0);
}

export function contrast(hex: string, background = "#FFFFFF"): number {
  const left = relativeLuminance(hex), right = relativeLuminance(background);
  const [hi, lo] = left > right ? [left, right] : [right, left];
  return (hi + 0.05) / (lo + 0.05);
}

export function mixHex(from: string, to: string, amount: number): string {
  const u = Math.max(0, Math.min(1, amount));
  const a = rgb(from), b = rgb(to);
  const mixed = a.map((part, index) => Math.round(part + ((b[index] ?? part) - part) * u));
  return `#${mixed.map(part => part.toString(16).padStart(2, "0")).join("")}`;
}

export function heatFill(base: string, heat: number): string {
  if (heat <= 0) return base;
  let previous = 0, previousColor = base;
  for (const [stop, color] of HEAT) {
    if (heat <= stop) return mixHex(previousColor, color, (heat - previous) / (stop - previous));
    previous = stop; previousColor = color;
  }
  return HEAT[HEAT.length - 1]?.[1] ?? base;
}

/** Team A is one closed ring. Team B is the same ring with four gaps, so grayscale still separates them. */
export function badgeArcs(team: Team): ReadonlyArray<readonly [number, number]> {
  if (team === "A") return [[0, Math.PI * 2]];
  const gap = 0.22;
  const sweep = Math.PI / 2 - gap;
  return [0, 1, 2, 3].map(index => {
    const start = -Math.PI / 2 + index * (Math.PI / 2) + gap / 2;
    return [start, start + sweep] as const;
  });
}
