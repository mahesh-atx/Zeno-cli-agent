import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/**
 * Catppuccin Latte — the light Catppuccin flavor. `FocusColor` is set to a
 * dark color so selected menu rows (on the light AccentYellow highlight)
 * stay readable.
 */
const colors: ColorsTheme = {
  type: 'light',
  Background: '#eff1f5',
  Foreground: '#4c4f69',
  LightBlue: '#04a5e5',
  AccentBlue: '#1e66f5',
  AccentPurple: '#8839ef',
  AccentCyan: '#179299',
  AccentGreen: '#40a02b',
  AccentYellow: '#df8e1d',
  AccentRed: '#d20f39',
  DiffAdded: '#cce5cc',
  DiffRemoved: '#f0cccc',
  Comment: '#9ca0b0',
  Gray: '#6c6f85',
  DarkGray: '#bcc0cc',
  InputBackground: '#e6e9ef',
  MessageBackground: '#e6e9ef',
  FocusColor: '#4c4f69',
  GradientColors: ['#8839ef', '#1e66f5', '#d20f39'],
};

export const CatppuccinLatte = defineTheme('Catppuccin Latte', 'light', colors);
