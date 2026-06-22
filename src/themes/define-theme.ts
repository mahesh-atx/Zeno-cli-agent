import type { ColorsTheme, SemanticColors, Theme, ThemeType } from './types';

/**
 * Derive the full `SemanticColors` consumption layer from a raw
 * `ColorsTheme` palette, using the same fallbacks every theme wants.
 * Centralizing this here keeps theme-definition files tiny (just the
 * palette) and guarantees the semantic layer is consistent across themes.
 */
export function buildSemanticColors(c: ColorsTheme): SemanticColors {
  return {
    text: {
      primary: c.Foreground,
      secondary: c.Gray,
      link: c.AccentBlue,
      accent: c.AccentPurple,
      response: c.Foreground,
    },
    background: {
      primary: c.Background,
      message: c.MessageBackground ?? c.Background,
      input: c.InputBackground ?? c.Background,
      focus: c.FocusBackground ?? c.AccentYellow,
      diff: { added: c.DiffAdded, removed: c.DiffRemoved },
    },
    border: { default: c.DarkGray },
    ui: {
      comment: c.Comment,
      symbol: c.AccentCyan,
      active: c.AccentBlue,
      dark: c.DarkGray,
      focus: c.AccentGreen,
      gradient: c.GradientColors,
    },
    status: {
      error: c.AccentRed,
      success: c.AccentGreen,
      warning: c.AccentYellow,
    },
  };
}

/**
 * Define a theme from just its name, type, and palette. The semantic layer
 * is built automatically. Use this for every built-in theme so each file is
 * just the color palette — the interesting part.
 */
export function defineTheme(
  name: string,
  type: ThemeType,
  colors: ColorsTheme,
): Theme {
  return {
    name,
    type,
    colors,
    semanticColors: buildSemanticColors(colors),
  };
}
