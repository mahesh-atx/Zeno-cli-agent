# Custom Themes

CLI Agent supports custom themes authored in JSON. You can place theme files in either:
- Global user directory: `~/.cli-agent/themes/*.json`
- Project-local directory: `./.cli-agent/themes/*.json`

Themes defined in the project-local directory take precedence if there is a name collision.

## Authoring a Theme
Create a JSON file in one of the theme directories. See `example.json` in this folder for the basic structure.

### Required Fields
- `name`: (String) The display name of the theme.
- `type`: (String) Must be `"dark"`, `"light"`, `"ansi"`, or `"custom"`.
- `colors`: (Object) Defines the theme palette. The following 7 colors are strictly required:
  - `Background`
  - `Foreground`
  - `AccentBlue`
  - `AccentPurple`
  - `AccentGreen`
  - `AccentYellow`
  - `AccentRed`

### Optional Colors
You can additionally define these optional colors:
- `LightBlue`
- `AccentCyan`
- `DiffAdded`
- `DiffRemoved`
- `Comment`
- `Gray`
- `DarkGray`
- `InputBackground`
- `MessageBackground`
- `FocusBackground`
- `FocusColor`
- `GradientColors`: (Array of strings) If specified, the command output line and other themed gradients will cycle through these colors.

Colors can be specified as HEX strings (e.g., `"#ffffff"`), or standard ANSI names (e.g., `"blue"`, `"magentaBright"`).

## Live Preview
Custom themes are loaded automatically when CLI Agent starts. To preview and switch themes on the fly, simply type `/theme` into the input bar and use the arrow keys to browse!
