# Theme authoring

Krangled PoE Trade themes are ordinary CSS files. Open **Settings → General →
Theme → Open themes folder**, place a `.css` file there, and use **Refresh** or
wait briefly for Settings to detect it. **Import** copies a CSS file into that
folder; **Duplicate** makes an editable copy of the selected theme.

User themes take precedence over included themes with the same filename. Theme
files are limited to 512 KB, must use a safe `.css` filename, have balanced
braces, and must either import the default theme or define a `:root` block.
Validation warnings are shown under the selected theme in Settings.

## Starter

Importing the default theme is recommended because new variables added in a
future release will receive safe defaults:

```css
/*
 * @name My Theme
 * @author Your name
 * @description A short description shown in Settings.
 * @version 1
 */
@import url('/themes/default.css');

:root {
  --theme-gray-900: #080b10;
  --theme-gray-800: #121822;
  --theme-gray-700: #202a38;
  --theme-accent: #64d8ff;
  --theme-focus-ring: #ffe66d;
}
```

Metadata is optional. `@name` controls the selector label; without it, the app
formats the filename. `@author`, `@description`, and `@version` document the
theme and the description and author appear in Settings.

## Semantic variables

Prefer semantic variables for targeted rules and accessibility adjustments:

| Variable | Purpose |
| --- | --- |
| `--theme-surface-primary` | Main window and panel background |
| `--theme-surface-raised` | Controls, cards, and raised panels |
| `--theme-border-subtle` | Dividers and quiet borders |
| `--theme-text-primary` | Primary readable text |
| `--theme-text-muted` | Secondary text |
| `--theme-accent` | Selected and emphasized controls |
| `--theme-focus-ring` | Keyboard focus indicator |
| `--theme-selection` | Selected-row or text-selection background |
| `--theme-danger` | Errors and destructive actions |

Their defaults refer to the palette variables, so existing palette-based themes
remain coherent. Tailwind utilities can use `surface`, `surface-raised`,
`border-subtle`, `text-primary`, `text-muted`, `accent`, `focus`, `selection`,
and `danger` inside the application source.

## Palette and shape variables

- Neutral surfaces and text: `--theme-gray-100` through `--theme-gray-900`
- Alternate table rows: `--theme-table-row-alt`
- Status palettes: `--theme-red-*`, `--theme-orange-*`, `--theme-yellow-*`,
  `--theme-green-*`, `--theme-blue-*`, `--theme-purple-*`, `--theme-pink-700`
- Item rarities: `--theme-item-normal`, `--theme-item-magic`,
  `--theme-item-rare`, `--theme-item-unique`
- Fonts: `--theme-font-ui`, `--theme-font-item`,
  `--theme-font-item-small-caps`
- Shape and depth: `--theme-radius`, `--theme-shadow-color`

Keep item rarity colors recognizable: they communicate game meaning rather
than decoration. Likewise, reserve danger red, success green, and focus colors
for their UI roles. Aim for at least 4.5:1 text contrast for normal text and
3:1 for large text and visible control boundaries. Test price results, item
tooltips, Settings, disabled controls, error messages, and keyboard focus.

Ordinary CSS is allowed after the variables for tightly scoped adjustments.
Avoid broad selectors such as `*` that can accidentally restyle third-party
charts or tooltips.
