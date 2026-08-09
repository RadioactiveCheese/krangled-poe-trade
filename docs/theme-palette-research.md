# Path of Exile theme palette research

This note translates official Grinding Gear Games artwork into practical UI
palettes. The hexadecimal values below are **visual samples/approximations**, not
officially published brand colors. They are deliberately adjusted where needed
to keep text, controls, table stripes, and focus states legible.

The five requested themes after clarification are Abyss, Harbinger, Delirium,
Eater of Worlds, and Searing Exarch. Maven and Perandus/Cadiro are retained at
the end as researched alternatives.

## Recommended themes

### Abyss

Official reference: [The Abyss Challenge League](https://www.pathofexile.com/forum/view-thread/2032331).
GGG's announcement describes the "deepest, blackest reaches" and "inky depths";
the accompanying key art and encounter images establish black, decayed green,
and a sharp luminous yellow-green as the recognizable visual language.

| Role | Approximate color | Use |
| --- | --- | --- |
| Background | `#050806` | Window and deepest panels |
| Surface | `#0B120D` | Cards and controls |
| Elevated surface | `#101A13` | Menus and headers |
| Alternating row | `#16251A` | Table stripe |
| Border | `#355B28` | Quiet green edge |
| Primary | `#79C83B` | Selected and active states |
| Bright accent | `#B9F45B` | Focus, links, small highlights |
| Text | `#D8E8CB` | Main copy |
| Muted text | `#91A486` | Secondary copy |

Keep most of the interface nearly black. The bright green should read like an
Abyss crack or jewel glow, not like a uniformly green application.

### Harbinger

Official reference: [The Harbinger Challenge League](https://www.pathofexile.com/forum/view-thread/1927546).
The official Harbinger, currency-shard, glyph, and challenge-reward images use
deep blue space, electric cyan-blue energy, and violet-magenta undertones.

| Role | Approximate color | Use |
| --- | --- | --- |
| Background | `#050A15` | Window |
| Surface | `#0A1730` | Cards and controls |
| Elevated surface | `#102344` | Menus and headers |
| Alternating row | `#172D53` | Table stripe |
| Border | `#245D91` | Structural edge |
| Primary | `#2C9BEF` | Active states |
| Secondary | `#7755C7` | Secondary accent and gradient partner |
| Bright glyph | `#82DFFF` | Focus rings and highlights |
| Text | `#D1E8FF` | Main copy |
| Muted text | `#829DB7` | Secondary copy |

Use violet sparingly around the dominant blue/cyan palette. Thin cyan strokes
and glows best recall the Harbinger glyphs.

### Delirium

Official references: [Path of Exile: Delirium](https://www.pathofexile.com/delirium)
and [Delirium launch announcement](https://www.pathofexile.com/forum/view-thread/2785110).
The official presentation is misty and intentionally desaturated: charcoal,
silver-grey, bone-white, and very restrained spectral violet.

| Role | Approximate color | Use |
| --- | --- | --- |
| Background | `#0B0B0D` | Window |
| Surface | `#17181B` | Cards and controls |
| Elevated surface | `#222327` | Menus and headers |
| Alternating row | `#303136` | Table stripe |
| Border | `#484A4F` | Structural edge |
| Primary | `#B5B8BD` | Active states |
| Bright accent | `#E3E5E7` | Focus and small highlights |
| Spectral accent | `#8D879A` | Optional, very sparing violet-grey |
| Text | `#D7D8DA` | Main copy |
| Muted text | `#85888E` | Secondary copy |

This should remain a grey-on-grey theme. Separation should come from value and
texture-like gradients rather than a colorful accent.

### Eater of Worlds

Official reference: [Path of Exile: Siege of the Atlas](https://www.pathofexile.com/siege),
especially the official "Two Eldritch Horrors" and Eldritch Implicit imagery.
The Eater side is cold and aquatic/cosmic: black-blue depths, saturated cyan,
teal bioluminescence, and a smaller deep-blue accent.

| Role | Approximate color | Use |
| --- | --- | --- |
| Background | `#02090E` | Window |
| Surface | `#06171D` | Cards and controls |
| Elevated surface | `#0A222A` | Menus and headers |
| Alternating row | `#10323B` | Table stripe |
| Border | `#176579` | Structural edge |
| Primary | `#22B8C5` | Active states |
| Bright accent | `#74EFE4` | Focus and eldritch glow |
| Deep-blue accent | `#216897` | Secondary accent |
| Text | `#C8F3EF` | Main copy |
| Muted text | `#78A7A5` | Secondary copy |

Favor irregular cyan/teal glows over clean neon blue. That keeps it distinct
from Harbinger's crystalline, glyph-like blue.

### Searing Exarch

Official reference: [Path of Exile: Siege of the Atlas](https://www.pathofexile.com/siege),
especially the official "Two Eldritch Horrors" and Eldritch Implicit imagery.
The Exarch side is incandescent: charred black-brown, volcanic red-orange,
bright flame orange, and a hot pale-gold core.

| Role | Approximate color | Use |
| --- | --- | --- |
| Background | `#100503` | Window |
| Surface | `#21100A` | Cards and controls |
| Elevated surface | `#32170D` | Menus and headers |
| Alternating row | `#451E0F` | Table stripe |
| Border | `#8C3018` | Structural edge |
| Primary | `#EE5728` | Active states |
| Secondary | `#FF9636` | Flame accent |
| Bright core | `#FFD06B` | Focus and small highlights |
| Text | `#F8D9BA` | Main copy |
| Muted text | `#B98A70` | Secondary copy |

Use the pale gold only at the hottest points. Large areas should stay charred
and red-brown so the theme does not collapse into generic gold.

## Researched alternatives

These were candidates for the two additional themes before Eater and Exarch
were specified.

### Maven

Official reference: [Path of Exile: Echoes of the Atlas](https://www.pathofexile.com/echoes)
and its Maven imagery. Approximate palette: background `#050611`, surface
`#10122B`, elevated `#191945`, alternating row `#232050`, border `#554B91`,
primary `#8D7CE8`, pink-violet accent `#D96FB5`, bright celestial accent
`#BEEBFF`, text `#E1DDF8`, muted text `#948DAC`.

### Perandus / Cadiro

Official reference: [The Perandus Challenge Leagues](https://www.pathofexile.com/forum/view-thread/1595088).
The official treasure, coin, Cadiro, and Eternal Empire imagery supports an
opulent but aged gold palette. Approximate colors: background `#100D08`, surface
`#20190D`, elevated `#30240F`, alternating row `#3D2E13`, border `#806322`,
primary `#C99A2E`, bright gold `#F0D36C`, burgundy accent `#6A2420`, text
`#F3E4B3`, muted text `#AC9562`.

## Applied design pass (August 2026)

The shipped theme CSS deviates from the raw palettes above where legibility or
game semantics required it. Rules that future themes should follow:

- **Match the default gray ladder.** The app uses `text-gray-400/500/600` as
  its muted-text tiers and `gray-600` doubles as a border tone. Against that
  theme's `gray-800` surface, target roughly **8:1 for gray-400, 5.3:1 for
  gray-500, and 3.2:1 for gray-600** — the same contrast steps as the default
  theme. The original palette drafts used the "border" swatch for `gray-600`,
  which dropped heavily-used muted text to 1.5–2.9:1.
- **Rarity hues are game vocabulary, not theme decoration.** Rare stays in the
  yellow family, magic in blue, unique in orange-brown — recolor within the
  hue, and keep each at ≥ 4.5:1 on `gray-800`. (Harbinger's violet rare and
  Eater's green rare were reverted to harmonized pale golds for this reason.)
- **Yellow and green must stay distinguishable** even in monochrome-leaning
  themes; they carry warning/success meaning. Abyss originally aliased
  `yellow-500` to `green-500`.
- **No body-wide filters.** Delirium's `filter: saturate(0.42)` washed out item
  art and semantic colors, forced whole-window compositing in the overlay, and
  made `position: fixed` widgets resolve against `body`. Desaturation is baked
  into the palette variables instead.
- **Shadows separate, glows reward.** `--theme-shadow-color` is applied under
  every elevated surface, so keep it at ~0.35–0.45 alpha (was 0.5–0.72); save
  bright saturated glow for `:hover`/`:focus` styles.

## Implementation guidance

- Preserve semantic colors such as errors, warnings, and Path of Exile item
  rarities unless the application theme system explicitly exposes safe variants.
- Use the theme primary color for selection and active states, but the brighter
  accent only for small focus rings, links, or glows.
- Keep alternating table rows one clear luminance step above the base surface;
  this is particularly important for Delirium's monochrome palette.
- Check normal text and interactive controls against WCAG contrast targets after
  mapping these suggestions to the application's actual CSS variables. These
  palettes are visual direction, not a claim of measured contrast compliance.
