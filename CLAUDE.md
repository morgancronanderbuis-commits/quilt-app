# Quilt Layout Planner — CLAUDE.md

Vanilla JS/HTML/CSS — no build step, no framework. Open `index.html` directly in a browser.

## File Structure

| File | Purpose |
|------|---------|
| `index.html` | Main app markup — two tabs: Charm Pack and Jelly Roll |
| `app.js` | All application logic (~2800 lines) |
| `style.css` | All styles |
| `guide.html` | Standalone quilting guide & pattern library |
| `patterns/` | Pattern PDFs, technique images (IMG_9530–9552.JPG), and `.md` pattern notes |

## Architecture

### Tabs
Two independent tabs share the page but have completely separate state, grids, and controls.
- Switching tabs calls `reRenderIfActive()` or `jrReRenderIfActive()` to repaint canvas cells (canvas content is lost when `hidden=true`).
- Resize handler only re-renders the active tab to avoid sizing the hidden tab to 0.

### Charm Pack (`state`)
- `state.images[]` — loaded charm square images `{name, dataUrl, color, phash}`
- `state.cpLayoutMode` — `'standard' | 'pinwheel' | 'hourglass'`
- `state.currentPool[]` — active arrangement of images (same indices as grid cells)
- `state.pinwheelPairPool[]` — secondary fabric pool for 2-fabric modes (pinwheel/hourglass)
- `renderCpLayout(pool, cols, rows)` — dispatcher; routes to correct renderer based on mode
- `reRenderIfActive()` — re-renders active CP mode without reshuffling

#### CP Layout Modes
| Mode | Renderer | Draw Fn | Notes |
|------|----------|---------|-------|
| `standard` | `renderGrid` | — | plain CSS grid of `<img>` cells |
| `pinwheel` | `renderPinwheelGrid` | `drawPinwheelCell` | QST per cell, 4 fixed triangle orientations per 2×2 repeat |
| `hourglass` | `renderHourglassGrid` | `drawHourglassCell` | 4 triangles meeting at center, top+bottom=A, left+right=B |

Color-effect buttons (Optimize, Checkerboard, Hue Diagonal) all call `renderCpLayout` so they work in any CP mode.

### Jelly Roll (`state.jellyRoll`)
- `jr.strips[]` — loaded strip images
- `jr.stripsPerBlock` — strips per block (slider, 1–8)
- `jr.currentBlocks[]` — `[{strips:[…]}, …]` — active arrangement
- `jr.layoutMode` — `'railfence' | '2ndeasiest' | 'easiestthrow' | 'stringpinwheel' | 'jellyrainbow'`
- `jrRebuildDimensionOptions()` — rebuilds dimension select based on `floor(total/stripsPerBlock)` blocks

#### JR Layout Modes
| Mode | Renderer | Visual |
|------|----------|--------|
| `railfence` | `renderJrRailFenceGrid` | Alternating H/V blocks in checkerboard |
| `2ndeasiest` | `renderJr2ndEasiestGrid` | All blocks horizontal, paired strips |
| `easiestthrow` | `renderJrStripSequence` | Single-column horizontal band list, sewing order badges |
| `stringpinwheel` | `renderJrStringPinwheelGrid` | Canvas: diagonal bands rotated ±45°, alternating |
| `jellyrainbow` | `renderJrJellyRainbowGrid` | Canvas: HST with diagonal bands at ±45°; auto-sorts by hue |

#### JR Preset System
- `JR_PRESETS` — `{'2nd-easiest': {stripsPerBlock, hint, guideAnchor}, 'easiest-throw': …}`
- `activateJrPreset(key)` — sets stripsPerBlock, rebuilds dimension select for the preset's block count, renders
- `clearJrPreset()` — clears active preset, removes sewing badges, restores normal dimension select
- `activeJrPreset` global tracks which preset button is lit

### Canvas Rendering Pattern
All canvas-based renderers follow this pattern:
1. Pre-load all unique image URLs into `imgMap: Map<url, HTMLImageElement>`
2. Clear grid, set `gridTemplateColumns`
3. Per cell: create `<canvas>`, `ctx.scale(dpr, dpr)`, call draw function
4. Call `addDragSwap()` or `addPinwheelDragSwap()` or `addJrDragSwap()`

#### String Pinwheel (`drawStringPinwheelBlock`)
- Two passes: solid-color fill first (prevents corner gaps), then fabric images on top
- Rotates context ±45°, draws n vertical strip bands covering `diag = size*√2 + 8`
- `isFlipped = (row+col)%2===1` alternates the rotation direction

#### Jelly Rainbow (`drawJellyRainbowBlock`)
- HST split (not QST): diagonal cuts TL-BR or TR-BL, alternating checkerboard
- Each triangle draws diagonal bands at ±45° using `rotate(±π/4)` + horizontal bands
- Auto-sorts by average strip hue before rendering (darks/lights/mediums cluster)
- Pairs block[i] with block[i + half] for color contrast between the two triangles

### Borders & Binding
Both tabs have independent border/binding systems using `BorderBinding` helper.
- `state.borders[]` / `state.jellyRoll.borders[]` — `{widthIn, image}` layers, innermost first
- `applyBorderBinding()` / `applyJrBorderBinding()` — wraps the grid in border divs + binding

### Fabric Calculator
- `renderCalculator()` / `renderJrCalculator()` — generates block-fabric table, summary stats, yardage
- For JR: yardage based on `stripWidthIn`, `packTotalStrips`, strip length

### Guide Page (`guide.html`)
- Standalone page with sticky sidebar nav
- Lightbox for reference photos (click thumbnail → full overlay, Esc to close)
- Pattern library cards with "View Construction Guide" links
- Image paths: `patterns/IMG_XXXX.JPG`

## Key Invariants
- `state.currentPool` and `state.jellyRoll.currentBlocks` are always index-aligned with the canvas cells
- Drag-swap updates the pool/blocks array and redraws only the two swapped cells
- The JR `2ndeasiest` preset rebuilds dimension select with `floor(total/2)` blocks; `easiest-throw` uses `total` blocks but forces 1-column layout
- `chooseBestDefault(pairs)` picks the first pair with ratio ≤ 2.0 to avoid overly wide layouts

## Pending / Known Issues
- **Disappearing 9-patch** (charm pack): Not yet implemented. Pattern: assemble 9 charm squares in 3×3, cut H+V through center, rotate quadrants 180° into opposite corners. Each block uses 9 images; needs `renderDisappearing9Patch`, `drawDisappearing9Patch`, dimension select rebuilt to `floor(n/9)` blocks.
- **"Use all strips" / leftover optimization**: JR calculator shows leftover strips. A button to increase grid size to use all strips would help (e.g., "Add more blocks" bumps rows×cols to match `floor(total/stripsPerBlock)` exactly).
- **Disappearing 9-patch rotation controls**: User may want to choose different quadrant rotation schemes.
