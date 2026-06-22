import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/** Tokyo Night — a clean, dark theme inspired by the city lights. */
const colors: ColorsTheme = {
  type: 'dark',
  Background: '#1a1b26',
  Foreground: '#a9b1d6',
  LightBlue: '#7dcfff',
  AccentBlue: '#7aa2f7',
  AccentPurple: '#bb9af7',
  AccentCyan: '#7dcfff',
  AccentGreen: '#9ece6a',
  AccentYellow: '#e0af68',
  AccentRed: '#f7768e',
  DiffAdded: '#1f2e26',
  DiffRemoved: '#332029',
  Comment: '#565f89',
  Gray: '#6272a4',
  DarkGray: '#24283b',
  InputBackground: '#24283b',
  GradientColors: ['#7aa2f7', '#bb9af7', '#7dcfff'],
};

export const TokyoNight = defineTheme('Tokyo Night', 'dark', colors);
