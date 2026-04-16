import type { MouseEvent } from "react";

/** Pick the series index whose x is closest to the pointer (same for hover line + click). */
export function nearestIndexFromSvgX(
  x: number,
  n: number,
  xAt: (i: number) => number,
): number {
  if (n <= 0) {
    return 0;
  }
  if (n === 1) {
    return 0;
  }
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(xAt(i) - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Index of the session slot whose `xAt(i)` is closest to the pointer (only considers `hasData` rows).
 * Use for hover/click so highlight and tooltip stay aligned with a real point when the axis is dense.
 */
export function nearestSessionIndexFromSvgX(
  x: number,
  n: number,
  xAt: (i: number) => number,
  hasData: (i: number) => boolean,
): number | null {
  if (n <= 0) {
    return null;
  }
  let best: number | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    if (!hasData(i)) {
      continue;
    }
    const d = Math.abs(xAt(i) - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function svgLocalXFromMouse(
  e: MouseEvent,
  svg: SVGSVGElement | null,
): number | null {
  if (!svg) {
    return null;
  }
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    return null;
  }
  return pt.matrixTransform(ctm.inverse()).x;
}
