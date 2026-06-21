import React from "react";
import { Text, type TextProps } from "ink";
import gradientString from "gradient-string";

export const ThemedGradient: React.FC<TextProps> = ({ children, ...props }) => {
  const gradientColors = ['#4796E4', '#847ACE', '#C3677F'];

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

  const colored = gradientString(gradientColors).multiline(text);
  return <Text {...props}>{colored}</Text>;
};
