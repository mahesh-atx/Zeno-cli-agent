export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isEven(n: number): boolean {
  return n % 2 === 0;
}