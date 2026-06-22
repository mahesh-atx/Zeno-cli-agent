import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/** Solarized Dark — Ethan Schoonover's precision palette, dark variant. */
const colors: ColorsTheme = {
  type: 'dark',
  Background: '#002b36',
  Foreground: '#93a1a1',
  LightBlue: '#839496',
  AccentBlue: '#268bd2',
  AccentPurple: '#6c71c4',
  AccentCyan: '#2aa198',
  AccentGreen: '#859900',
  AccentYellow: '#b58900',
  AccentRed: '#dc322f',
  DiffAdded: '#1c3a1c',
  DiffRemoved: '#3a1c1c',
  Comment: '#586e75',
  Gray: '#657b83',
  DarkGray: '#073642',
  InputBackground: '#073642',
  GradientColors: ['#268bd2', '#2aa198', '#b58900'],
};

export const SolarizedDark = defineTheme('Solarized Dark', 'dark', colors);
