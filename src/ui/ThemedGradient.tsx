import React from "react";
import { Text, type TextProps } from "ink";
import gradientString from "gradient-string";
import { theme } from "../themes/colors";
import { themeManager } from "../themes/theme-manager";

/**
 * Render children as a multi-line gradient using the active theme's
 * `GradientColors`. Falls back to a single accent color, then to the
 * theme's accent text color when no gradient is defined.
 */
export const ThemedGradient: React.FC<TextProps> = ({ children, ...props }) => {
  const gradientColors = themeManager.getActiveTheme().colors.GradientColors;

  const childArray = React.Children.toArray(children);
  const text = childArray
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      if (React.isValidElement(child)) {
        const c = (child as React.ReactElement<{ children?: React.ReactNode }>).props.children;
        if (typeof c === "string" || typeof c === "number") return String(c);
        if (Array.isArray(c)) return c.map((x) => (typeof x === "string" ? x : "")).join("");
      }
      return "";
    })
    .join("");

  if (gradientColors && gradientColors.length >= 2) {
    const colored = gradientString(gradientColors).multiline(text);
    return <Text {...props}>{colored}</Text>;
  }

  if (gradientColors && gradientColors.length === 1) {
    return (
      <Text color={gradientColors[0]} {...props}>
        {children}
      </Text>
    );
  }

  // No gradient defined — fall back to the theme's accent color.
  return (
    <Text color={theme.text.accent} {...props}>
      {children}
    </Text>
  );
};
