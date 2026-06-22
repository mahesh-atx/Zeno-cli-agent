import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';
import { interpolateColor } from '../color-utils';

/** Dracula — the canonical Dracula palette. DarkGray is interpolated. */
const colors: ColorsTheme = {
  type: 'dark',
  Background: '#282a36',
  Foreground: '#a3afb7',
  LightBlue: '#8be9fd',
  AccentBlue: '#8be9fd',
  AccentPurple: '#ff79c6',
  AccentCyan: '#8be9fd',
  AccentGreen: '#50fa7b',
  AccentYellow: '#fff783',
  AccentRed: '#ff5555',
  DiffAdded: '#11431d',
  DiffRemoved: '#6e1818',
  Comment: '#6272a4',
  Gray: '#6272a4',
  DarkGray: interpolateColor('#6272a4', '#282a36', 0.5),
  GradientColors: ['#ff79c6', '#8be9fd'],
};

export const DraculaDark = defineTheme('Dracula', 'dark', colors);
