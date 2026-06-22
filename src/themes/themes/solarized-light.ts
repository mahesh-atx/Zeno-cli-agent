import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/** Solarized Light — the light variant of the Solarized palette. */
const colors: ColorsTheme = {
  type: 'light',
  Background: '#fdf6e3',
  Foreground: '#586e75',
  LightBlue: '#93a1a1',
  AccentBlue: '#268bd2',
  AccentPurple: '#6c71c4',
  AccentCyan: '#2aa198',
  AccentGreen: '#859900',
  AccentYellow: '#b58900',
  AccentRed: '#dc322f',
  DiffAdded: '#d6e8d6',
  DiffRemoved: '#e8d6d6',
  Comment: '#93a1a1',
  Gray: '#839496',
  DarkGray: '#eee8d5',
  InputBackground: '#eee8d5',
  MessageBackground: '#eee8d5',
  FocusColor: '#586e75',
  GradientColors: ['#268bd2', '#2aa198', '#b58900'],
};

export const SolarizedLight = defineTheme('Solarized Light', 'light', colors);
