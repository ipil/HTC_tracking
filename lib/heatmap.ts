function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function rgb(r: number, g: number, b: number): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function twoStopGradient(value: number, min: number, max: number, from: [number, number, number], to: [number, number, number]): string {
  if (max <= min) {
    return rgb(...from);
  }
  const t = clamp((value - min) / (max - min));
  return rgb(lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t));
}

export function threeStopGradient(
  value: number,
  min: number,
  mid: number,
  max: number,
  start: [number, number, number],
  middle: [number, number, number],
  end: [number, number, number]
): string {
  if (value <= mid) {
    return twoStopGradient(value, min, mid, start, middle);
  }
  return twoStopGradient(value, mid, max, middle, end);
}
