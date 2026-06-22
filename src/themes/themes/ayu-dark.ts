import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/** Ayu — warm orange/red accent palette. */
const colors: ColorsTheme = {
  type: 'dark',
  Background: '#0D0B0A',
  Foreground: '#F3E8DF',
  LightBlue: '#FFD1A1',
  AccentBlue: '#FFB454',
  AccentPurple: '#FFAA8C',
  AccentCyan: '#FF9575',
  AccentGreen: '#FFC06A',
  AccentYellow: '#FFD57A',
  AccentRed: '#F26D78',
  DiffAdded: '#251C14',
  DiffRemoved: '#381416',
  Comment: '#85756E',
  Gray: '#40352F',
  DarkGray: '#201917',
  GradientColors: ['#FFB454', '#F26D78'],
};

export const AyuDark = defineTheme('Ayu', 'dark', colors);
