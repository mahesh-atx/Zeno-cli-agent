import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/** Rosé Pine — the soothing, sophisticated dark rose-pine palette. */
const colors: ColorsTheme = {
  type: 'dark',
  Background: '#191724',
  Foreground: '#e0def4',
  LightBlue: '#9ccfd8',
  AccentBlue: '#31748f',
  AccentPurple: '#c4a7e7',
  AccentCyan: '#9ccfd8',
  AccentGreen: '#3e8fb0',
  AccentYellow: '#f6c177',
  AccentRed: '#eb6f92',
  DiffAdded: '#2a2d34',
  DiffRemoved: '#3a2a30',
  Comment: '#6e6a86',
  Gray: '#908caa',
  DarkGray: '#26233a',
  InputBackground: '#1f1d2e',
  GradientColors: ['#eb6f92', '#c4a7e7', '#9ccfd8'],
};

export const RosePine = defineTheme('Rose Pine', 'dark', colors);
