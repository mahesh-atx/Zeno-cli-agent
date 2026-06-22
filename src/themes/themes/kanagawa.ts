import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/** Kanagawa — a theme inspired by Japanese art, dark and warm. */
const colors: ColorsTheme = {
  type: 'dark',
  Background: '#1f1f28',
  Foreground: '#dcd7ba',
  LightBlue: '#7e9cd8',
  AccentBlue: '#7e9cd8',
  AccentPurple: '#957fb8',
  AccentCyan: '#6a9589',
  AccentGreen: '#98bb6c',
  AccentYellow: '#e6c384',
  AccentRed: '#c34043',
  DiffAdded: '#2d2f26',
  DiffRemoved: '#3a2a2c',
  Comment: '#727169',
  Gray: '#a3a1a8',
  DarkGray: '#2a2a37',
  InputBackground: '#2a2a37',
  GradientColors: ['#7e9cd8', '#957fb8', '#e6c384'],
};

export const Kanagawa = defineTheme('Kanagawa', 'dark', colors);
