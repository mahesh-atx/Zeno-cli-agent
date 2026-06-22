import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/** Catppuccin Mocha — the flagship Catppuccin dark flavor. */
const colors: ColorsTheme = {
  type: 'dark',
  Background: '#1e1e2e',
  Foreground: '#cdd6f4',
  LightBlue: '#89dceb',
  AccentBlue: '#89b4fa',
  AccentPurple: '#cba6f7',
  AccentCyan: '#89dceb',
  AccentGreen: '#a6e3a1',
  AccentYellow: '#f9e2af',
  AccentRed: '#f38ba8',
  DiffAdded: '#1e3a2e',
  DiffRemoved: '#3a1e26',
  Comment: '#7f849c',
  Gray: '#9399b2',
  DarkGray: '#313244',
  InputBackground: '#313244',
  MessageBackground: '#181825',
  GradientColors: ['#cba6f7', '#89b4fa', '#f38ba8'],
};

export const CatppuccinMocha = defineTheme('Catppuccin Mocha', 'dark', colors);
