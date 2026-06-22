import React from "react";
import { Box, Text } from "ink";
import { Colors } from "../themes/colors";
import { themeManager } from "../themes/theme-manager";

interface ThemeMenuProps {
  selectedIndex: number;
}

/**
 * Theme picker. Reads the available themes directly from the singleton
 * `themeManager` (no prop-drilling) — every arrow-press in the input bar
 * calls `themeManager.preview(name)`, so the whole app re-themes live.
 *
 * Enhancements over the reference:
 *   - A mini color swatch next to each entry (a row of `█` glyphs in the
 *     theme's key accents) so users can preview a palette before selecting.
 *   - `FocusColor` support so light themes render readable selected rows.
 */
export function ThemeMenu({ selectedIndex }: ThemeMenuProps) {
  const themes = themeManager.getAvailableThemes();
  const currentName = themeManager.getActiveTheme().name;

  const maxItems = 8;
  const startIndex = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(maxItems / 2),
      Math.max(0, themes.length - maxItems),
    ),
  );
  const visibleThemes = themes.slice(startIndex, startIndex + maxItems);

  // Width of the left column so the type/swatch columns line up.
  const leftColWidth = Math.max(
    30,
    ...visibleThemes.map(
      (t, i) => t.name.length + String(startIndex + i + 1).length + 8,
    ),
  );

  // Selected row uses FocusBackground (defaults to AccentYellow); text on
  // top of it uses FocusColor when set (light themes), else Background.
  const selectedBg = Colors.FocusBackground ?? Colors.AccentYellow;
  const selectedFg = Colors.FocusColor ?? Colors.Background;

  return (
    <Box flexDirection="column" width="100%">
      <Box paddingX={1} flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentBlue} bold>
          Select theme
        </Text>
        <Text dimColor>
          Switch between visual themes. Live preview on every arrow press.
        </Text>
      </Box>

      {visibleThemes.map((t, localIdx) => {
        const idx = startIndex + localIdx;
        const isSelected = idx === selectedIndex;
        const isCurrent = t.name === currentName;

        // Pull the full theme to render its swatch colors.
        const full = themeManager.findThemeByName(t.name);
        const swatch = full
          ? [
              full.colors.AccentBlue,
              full.colors.AccentPurple,
              full.colors.AccentGreen,
              full.colors.AccentYellow,
              full.colors.AccentRed,
            ].filter(Boolean)
          : [];

        return (
          <Box
            key={t.name}
            width="100%"
            paddingX={1}
            flexDirection="row"
            backgroundColor={isSelected ? selectedBg : undefined}
          >
            <Box width={leftColWidth}>
              <Text
                color={isSelected ? selectedFg : Colors.Foreground}
                bold={isSelected}
              >
                {isSelected ? "❯ " : "  "}
                {idx + 1}. {t.name}
                {isCurrent ? " ✔" : ""}
              </Text>
            </Box>
            <Box marginRight={2}>
              <Text color={isSelected ? selectedFg : Colors.Comment} dimColor={!isSelected}>
                Type: {t.type}
              </Text>
            </Box>
            <Box>
              {swatch.map((c, i) => (
                <Text key={i} color={isSelected ? selectedFg : c}>
                  █
                </Text>
              ))}
            </Box>
          </Box>
        );
      })}

      <Box paddingX={1} marginTop={1}>
        <Text dimColor>↑/↓ preview · Enter to confirm · Esc to exit</Text>
      </Box>
    </Box>
  );
}
