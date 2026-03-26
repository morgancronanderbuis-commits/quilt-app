# Quilt Layout Planner

A browser-based tool for quilters to upload fabric images, preview quilt layouts, visualize borders and binding, and calculate fabric yardage — all without any server or build step.

## How It Works

The app is a single-page application built with vanilla HTML, CSS, and JavaScript (`index.html`, `style.css`, `app.js`). No frameworks or dependencies. Open `index.html` in a browser and it's ready to use.

---

## Tabs

The app has two main tabs:

- **Charm Pack** — for square fabric tiles (5" charm squares or similar)
- **Jelly Roll** — for fabric strips (2.5" × 44" rolls or similar)

---

## Charm Pack Tab

### Image Upload
- Drag-and-drop or click-to-browse for uploading fabric images (PNG, JPG, WEBP, etc.)
- Multiple images can be loaded at once
- On upload, each image is analyzed asynchronously:
  - **Average color** is extracted by downsampling to a 20×20 canvas and averaging the RGB values
  - **Perceptual hash (pHash)** is computed using a 2D Discrete Cosine Transform (DCT) on a 32×32 grayscale version of the image, producing a 63-bit fingerprint of the image's structural pattern

### Grid Controls
- **Grid Dimensions** — a dropdown lists all valid factor pairs for the total number of blocks (e.g. 20 images → 1×20, 2×10, 4×5, 5×4, etc.), defaulting to a roughly square/landscape layout
- **Image Set multiplier** — a 1–20× slider repeats the loaded image set to fill larger grids
- **Options checkboxes:**
  - *Shuffle image order* — randomizes the pool before placing blocks
  - *Show seam lines* — toggles a visible gap/line between blocks
  - *Square crop images* — crops each fabric image to a centered square

### Layout Modes

| Button | What It Does |
|---|---|
| **Generate Quilt Layout** | Places images in order (or shuffled if checked) |
| **Shuffle & Regenerate** | Forces a shuffle and regenerates |
| **Optimize Colors** | Greedy placement: picks the next block that maximizes color + pattern distance from its neighbors (uses RGB Euclidean distance + pHash Hamming distance, equal weight) |
| **Checkerboard** | Sorts fabrics by perceptual brightness, splits into a light half and dark half, and places them in an alternating checkerboard pattern |
| **Hue Diagonal** | Sorts fabrics by hue (red → orange → yellow → green → blue → purple) and arranges them in diagonal bands across the quilt |
| **Pinwheel** | Renders each block as a half-square triangle (HST) pinwheel. Each cell shows two fabric triangles from two different fabric pools, so the pinwheel uses the full fabric variety. |

### Drag-to-Swap
Individual blocks in the preview can be dragged and dropped to manually swap their positions. Works in both standard and pinwheel mode. The swap updates the internal pool state without a full re-render.

### Borders
- Add multiple stackable border layers via **+ Add Layer**
- Each layer has:
  - A width slider (0.5" – 12", in 0.25" increments)
  - A fabric picker — choose from already-loaded images or upload a new one
  - A remove button
- Borders are rendered inside → out (Layer 1 is innermost)
- If no fabric is selected, a hatch placeholder pattern is shown
- Border widths are in real-world inches and scale with the cell size

### Binding
- Toggle the **Binding** checkbox to enable a decorative outer edge strip
- Thickness is adjustable via a pixel slider (6–42 px)
- Three style options:
  - **Solid** — pick a single color
  - **Gradient** — 2–5 color stops with selectable direction (horizontal, vertical, diagonal)
  - **Pattern** — tile a fabric image (choose from loaded images or upload a new one)

### Save & Load Layouts
- **Save Layout** captures a snapshot of the current block order, grid dimensions, and layout mode, and generates a 236px-wide thumbnail
- Saved layouts appear in a grid below the preview
- Each saved card has an editable label, a **Load** button, and a **Delete** button
- Pinwheel layouts save and restore both fabric pools (primary + secondary triangles)

### Fabric Calculator
Appears automatically once a layout is generated. Recalculates whenever the layout or settings change.

**Settings:**
| Field | Default | Description |
|---|---|---|
| Finished block size | 5 in | The finished (sewn) size of each block |
| Seam allowance | 0.5 in | Added to each side of the cut block |
| Fabric width (WOF) | 42 in | Width of fabric from the bolt |

**Calculator output:**

1. **Quilt Dimensions** — finished width × height for blocks only, with each border layer added, and total quilt top size
2. **Block Fabric Needed** — groups blocks by unique fabric, shows block count, cut size, and yardage per fabric (rounded up to nearest ⅛ yd)
3. **Border Fabric Needed** — yardage per border layer, accounting for running outer dimensions and a seam/corner buffer
4. **Binding Needed** — yardage based on quilt perimeter; strip width is editable inline (default 2.5", standard double-fold)
5. **Backing & Batting** — dimensions with 4" added per side; automatically calculates whether 1, 2, or 3 WOF panels are needed

---

## Jelly Roll Tab

### Strip Upload
- Upload jelly roll strip images (same drag-and-drop / file picker as Charm Pack)
- A strip multiplier slider lets you repeat the strip set to fill larger layouts

### Layout Modes

| Button | What It Does |
|---|---|
| **Rail Fence** | Arranges strips into blocks of N parallel strips, alternating horizontal and vertical orientation block-by-block |
| **String Pinwheel** | Arranges blocks of diagonal strips at alternating 45° angles to create a pinwheel effect |
| **Optimize Colors** | Greedy placement maximizing color/pattern distance between adjacent blocks |
| **Checkerboard** | Alternates light and dark blocks in a checkerboard pattern |
| **Hue Diagonal** | Arranges blocks in diagonal color-hue bands |

### Strips Per Block
A slider controls how many strips are combined into each block (Rail Fence and String Pinwheel).

### Drag-to-Swap
Blocks can be dragged and dropped to manually reorder them.

### Borders & Binding
Identical to the Charm Pack borders and binding system. Fabric pickers use the loaded jelly roll strips as sources.

### Save & Load Layouts
Same save/load system as Charm Pack, scoped to the Jelly Roll tab.

### Fabric Calculator
Derived automatically from the pack specs — no manual block size input needed.

**Pack Specs (all editable to match your actual roll):**
| Field | Default | Description |
|---|---|---|
| Total strips in pack | 40 | Standard jelly roll |
| Unique designs | 20 | How many distinct fabrics |
| Strip width | 2.5 in | Cut width of each strip |
| Strip length | 44 in | Length of each strip (WOF) |

**Derived values:**
- Finished strip width = strip width − 0.5" (seam allowance)
- Block size = strips per block × finished strip width
- Cut block size = block size + 0.5"

**Calculator output:**

1. **Quilt Dimensions** — finished size of the quilt top
2. **Cutting Guide** — step-by-step numbered instructions: how many strips to cut per block, what length to cut them, how many sub-cuts per strip, and how many blocks you can make from the pack
3. **Backing & Batting** — yardage with 4" added per side

---

## Technical Notes

- **pHash** — implemented from scratch using a 1D DCT applied to rows then columns of a 32×32 grayscale image. The top-left 8×8 DCT coefficients (excluding DC) form a 63-bit hash. Hamming distance between two hashes measures visual similarity regardless of color.
- **Color distance** — standard Euclidean distance in RGB space, normalized by the maximum possible distance (~441).
- **Border/binding rendering** — borders and binding are rendered as nested `div` wrappers around the quilt grid using CSS `padding` and `background`. The wrappers are rebuilt from scratch on every change. One generic function (`applyBorderBindingToFrame`) is shared by both tabs.
- **Pinwheel canvas rendering** — each pinwheel cell is a `<canvas>` element. Two triangular clip regions are drawn per cell using the primary and secondary fabric pools. HiDPI (Retina) displays are handled by scaling the canvas buffer by `devicePixelRatio`.
- **String pinwheel canvas rendering** — strips are drawn as rotated slices using `ctx.rotate(±45°)`, with per-strip clip regions and cover-fit image scaling to avoid distortion or corner gaps.
- **Rail fence vertical strips** — rendered with `<img>` elements rotated 90° via CSS transform (rather than background-image), avoiding zoom/blur artifacts on narrow strip containers.
- **Responsive cell sizing** — cell pixel size is computed from available viewport space minus the total border/binding padding, capped between 8 px and 100 px.
- **Thumbnail generation** — uses an off-screen `<canvas>` with square-cropped center draws, exported as JPEG at 85% quality.

---

## File Structure

```
quilt/
├── index.html          # Markup and layout
├── style.css           # All styling
├── app.js              # All logic (state, rendering, calculators, algorithms)
└── sample files/
    ├── Tilda Sanctuary Charm Pack 5.5in/
    │   └── quilt_tile_01.png … quilt_tile_20.png
    └── CottageCore Jelly Roll/
        └── (jelly roll strip images)
```

---

## Usage

### Charm Pack
1. Open `index.html` in any modern browser
2. Upload fabric images (or use the sample files in `sample files/`)
3. Adjust grid dimensions and multiplier as needed
4. Click **Generate Quilt Layout** (or try Optimize / Checkerboard / Hue Diagonal / Pinwheel)
5. Optionally add borders and binding
6. Review the fabric calculator for yardage estimates
7. Save layouts you like and compare them in the saved panel

### Jelly Roll
1. Switch to the **Jelly Roll** tab
2. Upload strip images
3. Adjust columns, rows, multiplier, and strips per block
4. Click **Rail Fence** or **String Pinwheel**
5. Optionally add borders and binding
6. Review the cutting guide and yardage estimates in the calculator
