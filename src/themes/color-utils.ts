import tinygradient from 'tinygradient';
import tinycolor from 'tinycolor2';

/**
 * Color math helpers used by theme definitions.
 *
 * `interpolateColor` mixes two colors (used by e.g. Dracula to derive a
 * mid-tone DarkGray). `resolveColor` normalizes hex/named colors to a
 * canonical `#rrggbb` form, useful when parsing user-supplied JSON themes.
 * `contrastText` picks a readable foreground (black or white) for a given
 * background — used so selected menu rows stay legible on light themes.
 */

export function interpolateColor(
  color1: string,
  color2: string,
  factor: number,
): string {
  if (factor <= 0 && color1) return color1;
  if (factor >= 1 && color2) return color2;
  if (!color1 || !color2) return '';
  try {
    const gradient = tinygradient(color1, color2);
    const color = gradient.rgbAt(factor);
    return color.toHexString();
  } catch {
    return color1;
  }
}

export function resolveColor(colorValue: string): string | undefined {
  if (!colorValue) return undefined;
  const lower = colorValue.toLowerCase();

  if (lower.startsWith('#')) {
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(lower)) {
      return lower;
    }
    return undefined;
  }

  if (/^[0-9a-f]{3}([0-9a-f]{3})?$/.test(lower)) {
    return `#${lower}`;
  }

  try {
    const colorObj = tinycolor(lower);
    if (colorObj.isValid()) {
      return colorObj.toHexString();
    }
  } catch {
    /* fall through */
  }

  return undefined;
}

/**
 * Pick a readable foreground color for a given background. Returns a hex
 * string (`#000000` or `#ffffff`) using WCAG relative luminance.
 */
export function contrastText(background: string): string {
  try {
    const c = tinycolor(background);
    if (!c.isValid()) return '#ffffff';
    return c.isLight() ? '#000000' : '#ffffff';
  } catch {
    return '#ffffff';
  }
}
