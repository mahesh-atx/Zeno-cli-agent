import type { ColorsTheme } from './types';
import { themeManager } from './theme-manager';

/**
 * The two consumption surfaces of the theme system.
 *
 * Both are getter-based proxies: every property access delegates to
 * `themeManager.getActiveTheme()` *at access time*. This means:
 *
 *   - Components just `import { Colors } from "../themes/colors"` and read
 *     `Colors.AccentBlue` inline — no props, no React context.
 *   - Live preview "just works": the theme menu calls
 *     `themeManager.preview(name)` on each arrow press, and every component
 *     re-reads the (now previewed) theme on its next render.
 *
 * The flat `Colors` proxy is the primary surface (used by ~all components).
 * The grouped `theme` proxy is a convenience for a few higher-level
 * consumers (e.g. the gradient banner) that benefit from the grouping.
 */
export const Colors: ColorsTheme = {
  get type() {
    return themeManager.getActiveTheme().colors.type;
  },
  get Background() {
    return themeManager.getActiveTheme().colors.Background;
  },
  get Foreground() {
    return themeManager.getActiveTheme().colors.Foreground;
  },
  get LightBlue() {
    return themeManager.getActiveTheme().colors.LightBlue;
  },
  get AccentBlue() {
    return themeManager.getActiveTheme().colors.AccentBlue;
  },
  get AccentPurple() {
    return themeManager.getActiveTheme().colors.AccentPurple;
  },
  get AccentCyan() {
    return themeManager.getActiveTheme().colors.AccentCyan;
  },
  get AccentGreen() {
    return themeManager.getActiveTheme().colors.AccentGreen;
  },
  get AccentYellow() {
    return themeManager.getActiveTheme().colors.AccentYellow;
  },
  get AccentRed() {
    return themeManager.getActiveTheme().colors.AccentRed;
  },
  get DiffAdded() {
    return themeManager.getActiveTheme().colors.DiffAdded;
  },
  get DiffRemoved() {
    return themeManager.getActiveTheme().colors.DiffRemoved;
  },
  get Comment() {
    return themeManager.getActiveTheme().colors.Comment;
  },
  get Gray() {
    return themeManager.getActiveTheme().colors.Gray;
  },
  get DarkGray() {
    return themeManager.getActiveTheme().colors.DarkGray;
  },
  get InputBackground() {
    return themeManager.getActiveTheme().colors.InputBackground;
  },
  get MessageBackground() {
    return themeManager.getActiveTheme().colors.MessageBackground;
  },
  get FocusBackground() {
    return themeManager.getActiveTheme().colors.FocusBackground;
  },
  get FocusColor() {
    return themeManager.getActiveTheme().colors.FocusColor;
  },
  get GradientColors() {
    return themeManager.getActiveTheme().colors.GradientColors;
  },
};

export const theme = {
  get text() {
    return themeManager.getSemanticColors().text;
  },
  get background() {
    return themeManager.getSemanticColors().background;
  },
  get border() {
    return themeManager.getSemanticColors().border;
  },
  get ui() {
    return themeManager.getSemanticColors().ui;
  },
  get status() {
    return themeManager.getSemanticColors().status;
  },
};
