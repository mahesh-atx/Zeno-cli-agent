import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/**
 * Default theme — pure-black background with pastel accents. The fallback
 * theme used when no selection is persisted. Ported from the reference.
 */
const colors: ColorsTheme = {
  type: 'dark',
  Background: '#000000',
  Foreground: '#FFFFFF',
  LightBlue: '#AFD7D7',
  AccentBlue: '#87AFFF',
  AccentPurple: '#D7AFFF',
  AccentCyan: '#87D7D7',
  AccentGreen: '#D7FFD7',
  AccentYellow: '#FFFFAF',
  AccentRed: '#FF87AF',
  DiffAdded: '#005F00',
  DiffRemoved: '#5F0000',
  Comment: '#AFAFAF',
  Gray: '#AFAFAF',
  DarkGray: '#585757',
  InputBackground: '#5F5F5F',
  MessageBackground: '#5F5F5F',
  FocusBackground: '#005F00',
  GradientColors: ['#4796E4', '#847ACE', '#C3677F'],
};

export const DefaultDark = defineTheme('Default', 'dark', colors);
