---
title: Common issues
---

1. Read the [requirements](/download) again.

    Please do it. Did you know that updating Geforce Experience can reset game
    video settings to "optimized profile" and silently enable Fullscreen mode?

2. [Check the logs](/faq).

3. Are you playing with Vulkan renderer? Update GPU drivers.

    If Krangled PoE Trade works for you with the DirectX11/12 renderer,
    then problem is old Vulkan drivers for sure.

4. Delete `%appdata%\krangled-poe-trade`

    If needed, backup `apt-data` folder with your configuration inside.

5. **Close all applications** that you can in tray and task manager.

    Launch them later one at a time to identify **conflict**.

6. Restart Krangled PoE Trade.

    *(don't forget to quit first, otherwise launching second instance will do nothing).*

7. As a last resort,
   [open an issue](https://github.com/RadioactiveCheese/krangled-poe-trade/issues)
   with the app version, logs, and clear reproduction steps. There is very
   little guarantee anyone will respond, though. You can always fork it and
   have an AI fix it for you.

---

- 🔥[There are no stats to select from when price checking](/no-item-mods)
- [Failed to load leagues](/failed-load-leagues)
- [How to remove the stopwatch in center of screen?](https://github.com/SnosMe/awakened-poe-trade/issues/219)
- [Sends a whisper when doing price-check](https://github.com/SnosMe/awakened-poe-trade/issues/178)

## Windows

- 🔥[Nothing happens when I try to price check](/nothing-happens)
- [Can't open settings via tray icon when game is active](https://github.com/SnosMe/awakened-poe-trade/issues/265)

## Linux

- [Tray icon is not shown](https://github.com/SnosMe/awakened-poe-trade/issues/106)
- 🔥[Screen is black](https://github.com/SnosMe/awakened-poe-trade/issues/185)
