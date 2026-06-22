import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/** GitHub Dark — the GitHub dark default theme. */
const colors: ColorsTheme = {
  type: 'dark',
  Background: '#0d1117',
  Foreground: '#c9d1d9',
  LightBlue: '#58a6ff',
  AccentBlue: '#58a6ff',
  AccentPurple: '#bc8cff',
  AccentCyan: '#39c5cf',
  AccentGreen: '#3fb950',
  AccentYellow: '#d29922',
  AccentRed: '#f85149',
  DiffAdded: '#1c3326',
  DiffRemoved: '#3a1d1d',
  Comment: '#8b949e',
  Gray: '#8b949e',
  DarkGray: '#161b22',
  InputBackground: '#161b22',
  GradientColors: ['#58a6ff', '#bc8cff', '#3fb950'],
};

export const GithubDark = defineTheme('GitHub Dark', 'dark', colors);
