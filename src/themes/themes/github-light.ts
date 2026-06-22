import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/** GitHub Light — the GitHub light default theme. */
const colors: ColorsTheme = {
  type: 'light',
  Background: '#ffffff',
  Foreground: '#24292f',
  LightBlue: '#0969da',
  AccentBlue: '#0969da',
  AccentPurple: '#8250df',
  AccentCyan: '#1b7c83',
  AccentGreen: '#1a7f37',
  AccentYellow: '#9a6700',
  AccentRed: '#cf222e',
  DiffAdded: '#dafbe1',
  DiffRemoved: '#ffebe9',
  Comment: '#6e7781',
  Gray: '#57606a',
  DarkGray: '#eaeef2',
  InputBackground: '#f6f8fa',
  MessageBackground: '#f6f8fa',
  FocusColor: '#24292f',
  GradientColors: ['#0969da', '#8250df', '#1a7f37'],
};

export const GithubLight = defineTheme('GitHub Light', 'light', colors);
