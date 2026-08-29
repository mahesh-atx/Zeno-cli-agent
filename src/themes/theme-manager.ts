import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Theme, ThemeDisplay, ColorsTheme, SemanticColors } from './types';
import { resolveColor } from './color-utils';
import { buildSemanticColors } from './define-theme';

// Built-in themes (registered below). One import per theme file keeps each
// definition self-contained and easy to extend.
import { DefaultDark } from './themes/default-dark';
import { DraculaDark } from './themes/dracula-dark';
import { AtomOneDark } from './themes/atom-one-dark';
import { AyuDark } from './themes/ayu-dark';
import { AnsiDark } from './themes/ansi-dark';
import { CatppuccinMocha } from './themes/catppuccin-mocha';
import { CatppuccinLatte } from './themes/catppuccin-latte';
import { Nord } from './themes/nord';
import { TokyoNight } from './themes/tokyo-night';
import { GruvboxDark } from './themes/gruvbox-dark';
import { SolarizedDark } from './themes/solarized-dark';
import { SolarizedLight } from './themes/solarized-light';
import { GithubDark } from './themes/github-dark';
import { GithubLight } from './themes/github-light';
import { RosePine } from './themes/rose-pine';
import { Kanagawa } from './themes/kanagawa';

/** All themes shipped with the binary. */
const BUILT_IN_THEMES: Theme[] = [
  DefaultDark,
  DraculaDark,
  AtomOneDark,
  AyuDark,
  AnsiDark,
  CatppuccinMocha,
  CatppuccinLatte,
  Nord,
  TokyoNight,
  GruvboxDark,
  SolarizedDark,
  SolarizedLight,
  GithubDark,
  GithubLight,
  RosePine,
  Kanagawa,
];

const DEFAULT_THEME: Theme = DefaultDark;

/** Plain-text dotfile in the user's home dir holding the active theme name (legacy). */
const THEME_STORAGE_PATH = '.cli-agent-theme';
/** XDG compliant path: $XDG_CONFIG_HOME/cli-agent/theme or ~/.config/cli-agent/theme */
const XDG_THEME_DIR = 'cli-agent';
const XDG_THEME_FILE = 'theme';
/** Directory (user home) holding `*.json` custom theme definitions. */
const USER_THEMES_DIR = '.cli-agent/themes';
/** Directory (project-local) holding `*.json` custom theme definitions. */
const PROJECT_THEMES_DIR = '.cli-agent/themes';
/** XDG custom themes dir: $XDG_CONFIG_HOME/cli-agent/themes */
const XDG_THEMES_SUBDIR = 'themes';

// ─── Persistence — XDG aware ──────────────────────────────────────────────────

function getXdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

function getXdgThemePath(): string {
  return path.join(getXdgConfigHome(), XDG_THEME_DIR, XDG_THEME_FILE);
}

function getLegacyThemePath(): string {
  return path.join(os.homedir(), THEME_STORAGE_PATH);
}

function loadPersistedThemeName(): string | undefined {
  // Try XDG first (new), then legacy dotfile
  const candidates = [getXdgThemePath(), getLegacyThemePath()];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        if (content) return content;
      }
    } catch {
      // ignore and try next
    }
  }
  return undefined;
}

function persistThemeName(name: string): void {
  // Persist to XDG path (preferred), fallback to legacy if XDG fails
  try {
    const xdgPath = getXdgThemePath();
    const dir = path.dirname(xdgPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(xdgPath, name, 'utf-8');
    return;
  } catch {
    // try legacy
  }

  try {
    const legacyPath = getLegacyThemePath();
    fs.writeFileSync(legacyPath, name, 'utf-8');
  } catch {
    /* ignore — non-fatal */
  }
}

// ─── Custom JSON theme loading ───────────────────────────────────────────────

/**
 * Parse a single JSON theme file. Returns a `Theme` on success, `undefined`
 * if the file is missing required fields or is structurally invalid. All
 * color values are normalized to `#rrggbb` via `resolveColor`; values that
 * don't resolve fall back to a sensible default so a single bad hex can't
 * crash the picker.
 */
function parseCustomTheme(filePath: string): Theme | undefined {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(raw);
    } catch {
      return undefined;
    }

    const name = typeof json.name === 'string' ? json.name.trim() : '';
    if (!name) return undefined;

    const rawType = typeof json.type === 'string' ? json.type : 'custom';
    const type = (['light', 'dark', 'ansi', 'custom'].includes(rawType)
      ? rawType
      : 'custom') as Theme['type'];

    const c = json.colors as Partial<ColorsTheme> | undefined;
    if (!c) return undefined;

    // Required palette fields — without these the theme is unusable.
    const required: (keyof ColorsTheme)[] = [
      'Background',
      'Foreground',
      'AccentBlue',
      'AccentPurple',
      'AccentGreen',
      'AccentYellow',
      'AccentRed',
    ];
    for (const key of required) {
      if (typeof c[key] !== 'string') return undefined;
    }

    // Normalize every color string through resolveColor. Anything that
    // doesn't parse keeps its original value (named ANSI colors like
    // 'bluebright' are intentionally left as-is).
    const norm = (v: unknown): string | undefined =>
      typeof v === 'string' ? (resolveColor(v) ?? v) : undefined;

    const colors: ColorsTheme = {
      type,
      Background: norm(c.Background) ?? '#000000',
      Foreground: norm(c.Foreground) ?? '#ffffff',
      LightBlue: norm(c.LightBlue) ?? c.AccentBlue ?? '#5fafff',
      AccentBlue: norm(c.AccentBlue) ?? '#5fafff',
      AccentPurple: norm(c.AccentPurple) ?? '#d7afff',
      AccentCyan: norm(c.AccentCyan) ?? c.AccentBlue ?? '#87d7d7',
      AccentGreen: norm(c.AccentGreen) ?? '#5faf5f',
      AccentYellow: norm(c.AccentYellow) ?? '#ffffaf',
      AccentRed: norm(c.AccentRed) ?? '#ff5f5f',
      DiffAdded: norm(c.DiffAdded) ?? '#005f00',
      DiffRemoved: norm(c.DiffRemoved) ?? '#5f0000',
      Comment: norm(c.Comment) ?? c.Gray ?? '#878787',
      Gray: norm(c.Gray) ?? '#878787',
      DarkGray: norm(c.DarkGray) ?? '#585858',
      InputBackground: norm(c.InputBackground ?? ''),
      MessageBackground: norm(c.MessageBackground ?? ''),
      FocusBackground: norm(c.FocusBackground ?? ''),
      FocusColor: norm(c.FocusColor ?? ''),
      GradientColors:
        Array.isArray(c.GradientColors) && c.GradientColors.length >= 1
          ? c.GradientColors.filter((g) => typeof g === 'string')
          : undefined,
    };

    return {
      name,
      type,
      colors,
      semanticColors: buildSemanticColors(colors),
    };
  } catch {
    return undefined;
  }
}

/** Scan a directory for `*.json` theme files and return parsed themes. */
function loadCustomThemesFromDir(dir: string): Theme[] {
  const themes: Theme[] = [];
  try {
    if (!fs.existsSync(dir)) return themes;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
      const full = path.join(dir, entry.name);
      const theme = parseCustomTheme(full);
      if (theme) themes.push(theme);
    }
  } catch {
    /* ignore unreadable directory */
  }
  return themes;
}

/**
 * Load custom themes from user-home, XDG, and project-local directories.
 * Precedence: XDG < user-home < project-local (project wins on clash).
 */
function loadAllCustomThemes(): Theme[] {
  const userDir = path.join(os.homedir(), USER_THEMES_DIR);
  const xdgDir = path.join(getXdgConfigHome(), XDG_THEME_DIR, XDG_THEMES_SUBDIR);
  const projectDir = path.join(process.cwd(), PROJECT_THEMES_DIR);

  const xdgThemes = loadCustomThemesFromDir(xdgDir);
  const userThemes = loadCustomThemesFromDir(userDir);
  const projectThemes = loadCustomThemesFromDir(projectDir);

  const merged: Theme[] = [];
  const seen = new Set<string>();
  const push = (t: Theme) => {
    const key = t.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(t);
    }
  };

  // Order matters for precedence: lowest first
  xdgThemes.forEach(push);
  userThemes.forEach(push);
  // Project-local overrides: drop duplicates first
  for (const pt of projectThemes) {
    const key = pt.name.toLowerCase();
    const dupIdx = merged.findIndex((m) => m.name.toLowerCase() === key);
    if (dupIdx >= 0) merged.splice(dupIdx, 1);
    push(pt);
  }
  return merged;
}

// ─── ThemeManager singleton ──────────────────────────────────────────────────

class ThemeManager {
  private builtInThemes: Theme[] = BUILT_IN_THEMES;
  private customThemes: Theme[] = [];
  private activeTheme: Theme;
  private previewTheme: Theme | undefined;
  private isPreviewing: boolean = false;

  constructor() {
    this.customThemes = loadAllCustomThemes();
    const persisted = loadPersistedThemeName();
    if (persisted) {
      const found = this.findThemeByName(persisted);
      this.activeTheme = found ?? DEFAULT_THEME;
    } else {
      this.activeTheme = DEFAULT_THEME;
    }
  }

  /** The combined built-in + custom theme list (custom last, deduped). */
  get availableThemes(): Theme[] {
    const merged: Theme[] = [...this.builtInThemes];
    const seen = new Set(
      this.builtInThemes.map((t) => t.name.toLowerCase()),
    );
    for (const t of this.customThemes) {
      const key = t.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(t);
      }
    }
    return merged;
  }

  /**
   * Returns the preview theme when previewing, otherwise the active theme.
   * This is the single chokepoint every color read goes through, which is
   * what makes live preview work app-wide without React context.
   */
  getActiveTheme(): Theme {
    return this.previewTheme ?? this.activeTheme;
  }

  getColors(): ColorsTheme {
    return this.getActiveTheme().colors;
  }

  getSemanticColors(): SemanticColors {
    return this.getActiveTheme().semanticColors;
  }

  getAvailableThemes(): ThemeDisplay[] {
    return this.availableThemes.map((t) => ({ name: t.name, type: t.type }));
  }

  /** Full theme objects (built-ins + custom). */
  getAllThemes(): Theme[] {
    return this.availableThemes;
  }

  findThemeByName(name: string | undefined): Theme | undefined {
    if (!name) return undefined;
    const lower = name.toLowerCase();
    return this.availableThemes.find((t) => t.name.toLowerCase() === lower);
  }

  /** Permanently switch the active theme and persist it. */
  setActiveTheme(name: string): boolean {
    const theme = this.findThemeByName(name);
    if (!theme) return false;
    this.activeTheme = theme;
    this.previewTheme = undefined;
    this.isPreviewing = false;
    persistThemeName(theme.name);
    return true;
  }

  // ── Live preview (preview-on-arrow-navigation) ──

  /** Begin a preview session anchored on the given (current) theme. */
  startPreview(_originalName: string): void {
    this.isPreviewing = true;
  }

  /** Set the previewed theme. No-op if not in a preview session. */
  preview(name: string): boolean {
    if (!this.isPreviewing) return false;
    const theme = this.findThemeByName(name);
    if (!theme) return false;
    this.previewTheme = theme;
    return true;
  }

  /** Promote the current preview to the active theme and persist it. */
  commitPreview(): void {
    if (this.isPreviewing && this.previewTheme) {
      this.activeTheme = this.previewTheme;
      persistThemeName(this.activeTheme.name);
    }
    this.previewTheme = undefined;
    this.isPreviewing = false;
  }

  /** Discard the preview and restore the previously active theme. */
  cancelPreview(): void {
    this.previewTheme = undefined;
    this.isPreviewing = false;
  }

  isInPreviewMode(): boolean {
    return this.isPreviewing;
  }

  /** Re-scan the custom-theme directories. Useful after authoring a theme. */
  reloadCustomThemes(): void {
    this.customThemes = loadAllCustomThemes();
  }
}

export const themeManager = new ThemeManager();
