# <img src="./docs/public/favicon.png" width="48" alt=""> Krangled PoE Trade

An experimental Path of Exile price-checking overlay built on
[Awakened PoE Trade](https://github.com/SnosMe/awakened-poe-trade), with support
for krangled league mechanics and fork-specific features.

> **This is a vibeslop fork.** Features and experiments are developed primarily
> through AI-assisted coding, enthusiastic iteration, and questionable amounts
> of confidence. Expect rough edges, review changes carefully, and report
> anything that gets krangled in the process.

This project would not exist without Alexander Drozdov
([SnosMe](https://github.com/SnosMe)), who created Awakened PoE Trade and
continues to maintain the foundation this fork builds upon. Thank you to
Alexander and every upstream contributor for their sustained work.

➡ [Downloads](https://radioactivecheese.github.io/krangled-poe-trade/download) ⬅

[Report a bug](https://github.com/RadioactiveCheese/krangled-poe-trade/issues)
(responses not guaranteed—or just fork it and have an AI fix it for you)
· [Releases](https://github.com/RadioactiveCheese/krangled-poe-trade/releases)

## Tool showcase

| Gem | Rare | Unique | Currency |
|-----|------|--------|----------|
| ![](https://i.imgur.com/LTsH2DZ.png) | ![](https://i.imgur.com/2XL5Wl8.png) | ![](https://i.imgur.com/UTV6prE.png) | ![](https://i.imgur.com/dQ9Sns6.png) |

### Development

See [DEVELOPING.md](./DEVELOPING.md)

### Custom themes

Choose a theme under **Settings → General → Theme**. Besides Default, every
theme is just a `.css` file: the app ships with Path of Exile-inspired presets,
High Contrast, and OLED Black. Every `.css` file in the themes folder appears
in the selector, and Settings can open that folder, import a file, or duplicate
the selected theme. Changes are detected while Settings is open. A user file
with the same name as a shipped theme replaces it, so included themes can be
customized without modifying the installation. See the
[theme authoring guide](./docs/theme-authoring.md) for metadata, validation,
semantic variables, palette variables, and accessibility guidance.

### Acknowledgments

- Alexander Drozdov ([SnosMe](https://github.com/SnosMe)), creator and
  maintainer of [Awakened PoE Trade](https://github.com/SnosMe/awakened-poe-trade)
- Every Awakened PoE Trade contributor whose work remains part of this fork
- [libuiohook](https://github.com/kwhat/libuiohook)
- [RePoE](https://github.com/brather1ng/RePoE)
- [poeprices.info](https://www.poeprices.info/)
- [poe.ninja](https://poe.ninja/)

![](https://i.imgur.com/MATqhv7.png)

### License

Krangled PoE Trade remains available under the [MIT License](./LICENSE). The
original copyright and permission notice are preserved as required by that
license.
