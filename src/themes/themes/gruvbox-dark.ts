import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/** Gruvbox — a retro groove color scheme, dark variant. */
const colors: ColorsTheme = {
  type: 'dark',
  Background: '#282828',
  Foreground: '#ebdbb2',
  LightBlue: '#83a598',
  AccentBlue: '#458588',
  AccentPurple: '#d3869b',
  AccentCyan: '#8ec07c',
  AccentGreen: '#b8bb26',
  AccentYellow: '#fabd2f',
  AccentRed: '#fb4934',
  DiffAdded: '#3c4426',
  DiffRemoved: '#4a2c2c',
  Comment: '#928374',
  Gray: '#a89984',
  DarkGray: '#3c3836',
  InputBackground: '#3c3836',
  GradientColors: ['#fabd2f', '#d3869b', '#8ec07c'],
};

export const GruvboxDark = defineTheme('Gruvbox', 'dark', colors);
