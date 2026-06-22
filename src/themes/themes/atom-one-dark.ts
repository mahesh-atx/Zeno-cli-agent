import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';
import { interpolateColor } from '../color-utils';

/** Atom One Dark — canonical Atom One Dark palette. */
const colors: ColorsTheme = {
  type: 'dark',
  Background: '#282c34',
  Foreground: '#abb2bf',
  LightBlue: '#61aeee',
  AccentBlue: '#61aeee',
  AccentPurple: '#c678dd',
  AccentCyan: '#56b6c2',
  AccentGreen: '#98c379',
  AccentYellow: '#e6c07b',
  AccentRed: '#e06c75',
  DiffAdded: '#39544E',
  DiffRemoved: '#562B2F',
  Comment: '#5c6370',
  Gray: '#5c6370',
  DarkGray: interpolateColor('#5c6370', '#282c34', 0.5),
  GradientColors: ['#61aeee', '#98c379'],
};

export const AtomOneDark = defineTheme('Atom One', 'dark', colors);
