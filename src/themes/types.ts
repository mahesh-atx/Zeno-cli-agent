/**
 * Theme system type definitions.
 *
 * A theme has three parts:
 *   1. `name`     — display name ("Dracula")
 *   2. `type`     — 'light' | 'dark' | 'ansi' | 'custom'
 *   3. `colors`   — the flat raw palette (`ColorsTheme`)
 *   4. `semanticColors` — the consumption layer derived from the palette
 *
 * The `ColorsTheme` palette is what theme authors fill in. The
 * `SemanticColors` object is derived from those palette values and is what
 * higher-level subsystems (like the gradient banner) read.
 *
 * In practice most UI components consume the flat `Colors.*` proxy directly
 * rather than `theme.*`, but the semantic layer is kept for completeness and
 * for components (e.g. `ThemedGradient`) that benefit from the grouping.
 */
export type ThemeType = 'light' | 'dark' | 'ansi' | 'custom';

export interface ColorsTheme {
  type: ThemeType;
  Background: string;
  Foreground: string;
  LightBlue: string;
  AccentBlue: string;
  AccentPurple: string;
  AccentCyan: string;
  AccentGreen: string;
  AccentYellow: string;
  AccentRed: string;
  DiffAdded: string;
  DiffRemoved: string;
  Comment: string;
  Gray: string;
  DarkGray: string;
  /** Background of the input bar. Falls back to DarkGray when unset. */
  InputBackground?: string;
  /** Background of message bubbles. Falls back to Background when unset. */
  MessageBackground?: string;
  /** Background of a focused/selected row. Falls back to AccentYellow. */
  FocusBackground?: string;
  /** Foreground text color on top of a focused/selected row.
   *  Light themes should set this so selected menu rows stay readable;
   *  dark themes leave it unset and Background is used instead. */
  FocusColor?: string;
  /** Two-or-more hex strings used to render the gradient banner. */
  GradientColors?: string[];
}

export interface SemanticColors {
  text: {
    primary: string;
    secondary: string;
    link: string;
    accent: string;
    response: string;
  };
  background: {
    primary: string;
    message: string;
    input: string;
    focus: string;
    diff: {
      added: string;
      removed: string;
    };
  };
  border: {
    default: string;
  };
  ui: {
    comment: string;
    symbol: string;
    active: string;
    dark: string;
    focus: string;
    gradient: string[] | undefined;
  };
  status: {
    error: string;
    success: string;
    warning: string;
  };
}

export interface Theme {
  name: string;
  type: ThemeType;
  colors: ColorsTheme;
  semanticColors: SemanticColors;
}

/** Lightweight view of a theme for menus/lists. */
export interface ThemeDisplay {
  name: string;
  type: ThemeType;
}
