import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/** Nord — the arctic, north-bluish color palette. */
const colors: ColorsTheme = {
  type: 'dark',
  Background: '#2e3440',
  Foreground: '#d8dee9',
  LightBlue: '#88c0d0',
  AccentBlue: '#81a1c1',
  AccentPurple: '#b48ead',
  AccentCyan: '#8fbcbb',
  AccentGreen: '#a3be8c',
  AccentYellow: '#ebcb8b',
  AccentRed: '#bf616a',
  DiffAdded: '#2e4a36',
  DiffRemoved: '#4a2e33',
  Comment: '#616e88',
  Gray: '#81a1c1',
  DarkGray: '#3b4252',
  InputBackground: '#3b4252',
  GradientColors: ['#88c0d0', '#81a1c1', '#b48ead'],
};

export const Nord = defineTheme('Nord', 'dark', colors);
