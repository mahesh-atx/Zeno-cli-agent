import type { ColorsTheme } from '../types';
import { defineTheme } from '../define-theme';

/**
 * ANSI — uses raw terminal ANSI color names instead of hex. The lowest
 * common denominator: works on any terminal even without truecolor support.
 * Foreground is left empty so the terminal's default text color is used.
 */
const colors: ColorsTheme = {
  type: 'ansi',
  Background: 'black',
  Foreground: '',
  LightBlue: 'bluebright',
  AccentBlue: 'blue',
  AccentPurple: 'magenta',
  AccentCyan: 'cyan',
  AccentGreen: 'green',
  AccentYellow: 'yellow',
  AccentRed: 'red',
  DiffAdded: '#003300',
  DiffRemoved: '#4D0000',
  Comment: 'gray',
  Gray: 'gray',
  DarkGray: 'gray',
  FocusBackground: 'black',
  GradientColors: ['cyan', 'green'],
};

export const AnsiDark = defineTheme('ANSI', 'dark', colors);
