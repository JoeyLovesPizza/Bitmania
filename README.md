# Bitmania — Halftone Playground

A real-time WebGL2 halftone renderer that runs entirely in the browser. Drop any image or video onto the canvas and tweak it into oblivion.

**[Try it live →](https://joeylovespizza.github.io/Bitmania/)**

---

## Features

- **6 pattern types** — Dots, Lines, Rings, CMYK, ASCII, Mix
- **CMYK mode** — four independent rotated screens with per-channel angle and strength controls
- **ASCII mode** — 64-character density-mapped font atlas rendered via WebGL
- **Layer B** — overlay a second independent pattern with blend modes (Normal, Multiply, Screen, Darken, Lighten, Add)
- **Mouse trail** — displace dots with cursor movement, with tunable strength, radius, and fade
- **Tween** — keyframe two settings states (A/B) and animate between them
- **Gooey merge** — smooth-union SDF metaball blending between dots
- **Color gradients** — solid, linear, or radial gradients for both foreground and background
- **Image color sampling** — dots can inherit color directly from the source image
- **Canvas resize** — custom dimensions with preset sizes (HD, 4K, square, portrait, A4, Letter)
- **Source crop** — zoom and pan within the source image independently of the canvas
- **Presets** — save and restore named settings via localStorage
- **PNG export** — export the current canvas at full resolution
- **Video support** — load a video file and process it frame-by-frame in real time
- **Animation** — continuous angle/grid drift mode

## Usage

1. Open the app and drag & drop an image or video onto the canvas, or click **Open File**
2. Adjust settings in the right panel — changes render in real time
3. Hit **↓ PNG** to export

### Keyboard / mouse shortcuts

| Action | Shortcut |
|---|---|
| Zoom in / out | `⌘+` / `⌘−` |
| Fit to screen | `⌘0` or double-click canvas |
| Pan canvas | Drag |
| Source crop zoom | `⌥` + scroll |
| Source crop pan | `⌥` + drag |
| Play / pause video | `Space` |

## Tech

Single-file vanilla HTML/CSS/JS — no build step, no dependencies. The renderer is a WebGL2 fragment shader running a 3×3 neighbourhood kernel per cell. Requires a browser with WebGL2 support (Chrome, Firefox, Safari 15+, Edge).
