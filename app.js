// ─── State ────────────────────────────────────────────────
const state = {
  images: [],       // Array of { name, dataUrl }
  multiplier: 1,
  cols: 0,
  rows: 0,
};

// ─── DOM References ────────────────────────────────────────
const dropZone       = document.getElementById('drop-zone');
const fileInput      = document.getElementById('file-input');
const imageCount     = document.getElementById('image-count');
const clearBtn       = document.getElementById('clear-btn');
const controls       = document.getElementById('controls');
const previewSection = document.getElementById('preview-section');
const dimensionSelect= document.getElementById('dimension-select');
const dimLabel       = document.getElementById('dim-label');
const setCountLabel  = document.getElementById('set-count-label');
const generateBtn    = document.getElementById('generate-btn');
const shuffleBtn     = document.getElementById('shuffle-btn');
const optimizeBtn    = document.getElementById('optimize-btn');
const checkerBtn     = document.getElementById('checker-btn');
const quiltGrid      = document.getElementById('quilt-grid');
const gridInfo       = document.getElementById('grid-info');
const shuffleCheck   = document.getElementById('shuffle-check');
const seamsCheck     = document.getElementById('seams-check');
const squareCheck    = document.getElementById('square-check');
const multiBtns      = document.querySelectorAll('.multiplier-btn');

// ─── Upload Handling ───────────────────────────────────────
// Only trigger fileInput.click() when clicking the zone itself, not the label
// (the label's `for` attribute already opens the dialog — double-triggering opens it twice)
dropZone.addEventListener('click', e => {
  if (e.target.closest('label') || e.target === fileInput) return;
  fileInput.click();
});
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => handleFiles(fileInput.files));
clearBtn.addEventListener('click', clearImages);

function handleFiles(fileList) {
  const files = [...fileList].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;

  const readers = files.map(file => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve({ name: file.name, dataUrl: e.target.result });
    reader.readAsDataURL(file);
  }));

  Promise.all(readers).then(async newImages => {
    imageCount.textContent = `Analyzing ${newImages.length} image${newImages.length !== 1 ? 's' : ''}…`;
    for (const img of newImages) {
      img.color = await extractAvgColor(img.dataUrl);
      img.phash = await computePHash(img.dataUrl);
    }
    state.images.push(...newImages);
    onImagesUpdated();
  });
}

function clearImages() {
  state.images = [];
  fileInput.value = '';
  onImagesUpdated();
  hidePreview();
}

function onImagesUpdated() {
  const count = state.images.length;
  imageCount.textContent = `${count} image${count !== 1 ? 's' : ''} loaded`;
  clearBtn.style.display = count > 0 ? 'inline-block' : 'none';

  if (count > 0) {
    controls.style.display = 'flex';
    rebuildDimensionOptions();
    updateSetCountLabel();
  } else {
    controls.style.display = 'none';
  }
}

// ─── Dimension Logic ───────────────────────────────────────
/** Return all factor pairs [cols, rows] for a given total, landscape-first. */
function getFactorPairs(total) {
  const pairs = [];
  for (let cols = 1; cols <= total; cols++) {
    if (total % cols === 0) {
      const rows = total / cols;
      pairs.push([cols, rows]);
    }
  }
  // Sort: fewest cols first (tallest → widest)
  return pairs;
}

function rebuildDimensionOptions() {
  const total = state.images.length * state.multiplier;
  const pairs = getFactorPairs(total);

  dimensionSelect.innerHTML = '';
  pairs.forEach(([cols, rows]) => {
    const opt = document.createElement('option');
    opt.value = `${cols}x${rows}`;
    opt.textContent = `${cols} × ${rows}  (${cols} cols, ${rows} rows)`;
    // Default to a roughly square or wide layout
    dimensionSelect.appendChild(opt);
  });

  // Default to something roughly square / landscape
  const best = chooseBestDefault(pairs);
  dimensionSelect.value = `${best[0]}x${best[1]}`;
  updateDimState();
}

function chooseBestDefault(pairs) {
  // Prefer a layout where cols >= rows and ratio is between 1 and 2.5
  const wide = pairs.filter(([c, r]) => c >= r && c / r <= 2.5);
  if (wide.length) return wide[Math.floor(wide.length / 2)];
  return pairs[Math.floor(pairs.length / 2)];
}

dimensionSelect.addEventListener('change', updateDimState);

function updateDimState() {
  const [cols, rows] = dimensionSelect.value.split('x').map(Number);
  state.cols = cols;
  state.rows = rows;
  const total = cols * rows;
  dimLabel.textContent = `= ${total} blocks total`;
}

// ─── Multiplier / Set Logic ────────────────────────────────
multiBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    multiBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.multiplier = parseInt(btn.dataset.mult, 10);
    rebuildDimensionOptions();
    updateSetCountLabel();
  });
});

function updateSetCountLabel() {
  const base = state.images.length;
  const total = base * state.multiplier;
  const label = state.multiplier === 1
    ? `Using ${total} images (1×)`
    : `${base} images × ${state.multiplier} = ${total} blocks`;
  setCountLabel.textContent = label;
}

// ─── Generate ──────────────────────────────────────────────
generateBtn.addEventListener('click', generateLayout);
shuffleBtn.addEventListener('click', () => {
  shuffleCheck.checked = true;
  generateLayout();
});
optimizeBtn.addEventListener('click', optimizeLayout);
checkerBtn.addEventListener('click', checkerLayout);
const hueDiagBtn = document.getElementById('hue-diag-btn');
hueDiagBtn.addEventListener('click', hueDiagonalLayout);

function generateLayout() {
  if (!state.images.length) return;

  updateDimState();
  const { cols, rows, images, multiplier } = state;
  const total = cols * rows;

  // Build the working image array (repeated as needed)
  let pool = [];
  for (let i = 0; i < multiplier; i++) pool.push(...images);

  // If pool is smaller than total, cycle through it
  while (pool.length < total) pool.push(...images);
  pool = pool.slice(0, total);

  if (shuffleCheck.checked) {
    pool = shuffle([...pool]);
  }

  renderGrid(pool, cols, rows);
}

// Track the live pool so drag-swaps can mutate it
state.currentPool = [];

function renderGrid(pool, cols, rows) {
  state.currentPool = [...pool];
  quiltGrid.innerHTML = '';

  // Fixed pixel columns — predictable size, no stretching
  const seamGap = seamsCheck.checked ? 3 : 0;
  const maxCellPx = Math.min(Math.floor((window.innerWidth - 80) / cols) - seamGap, 120);
  quiltGrid.style.gridTemplateColumns = `repeat(${cols}, ${maxCellPx}px)`;
  quiltGrid.style.width = 'fit-content';
  quiltGrid.style.maxWidth = '';

  quiltGrid.className = 'quilt-grid ' + (seamsCheck.checked ? 'show-seams' : 'no-seams');

  const cropClass = squareCheck.checked ? 'square-crop' : 'fit-crop';

  pool.forEach((img, i) => {
    const cell = document.createElement('div');
    cell.className = `quilt-cell ${cropClass}`;
    cell.dataset.index = i;
    cell.draggable = true;

    const imgEl = document.createElement('img');
    imgEl.src = img.dataUrl;
    imgEl.alt = img.name;
    imgEl.title = img.name;
    imgEl.draggable = false; // drag the cell, not the image

    cell.appendChild(imgEl);
    quiltGrid.appendChild(cell);
  });

  addDragSwap();

  gridInfo.textContent = `${cols} columns × ${rows} rows — ${pool.length} blocks`;
  previewSection.style.display = 'block';
  previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Drag-to-Swap ──────────────────────────────────────────
function addDragSwap() {
  let dragSrcIndex = null;

  quiltGrid.querySelectorAll('.quilt-cell').forEach(cell => {
    cell.addEventListener('dragstart', e => {
      dragSrcIndex = parseInt(cell.dataset.index, 10);
      cell.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    cell.addEventListener('dragend', () => {
      cell.classList.remove('dragging');
      quiltGrid.querySelectorAll('.quilt-cell').forEach(c => c.classList.remove('drag-over'));
    });

    cell.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      quiltGrid.querySelectorAll('.quilt-cell').forEach(c => c.classList.remove('drag-over'));
      if (parseInt(cell.dataset.index, 10) !== dragSrcIndex) {
        cell.classList.add('drag-over');
      }
    });

    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));

    cell.addEventListener('drop', e => {
      e.preventDefault();
      cell.classList.remove('drag-over');
      const dropIndex = parseInt(cell.dataset.index, 10);
      if (dragSrcIndex === null || dropIndex === dragSrcIndex) return;

      // Swap in the live pool
      const pool = state.currentPool;
      [pool[dragSrcIndex], pool[dropIndex]] = [pool[dropIndex], pool[dragSrcIndex]];

      // Swap img src/title in the DOM (no full re-render needed)
      const cells = quiltGrid.querySelectorAll('.quilt-cell');
      const srcImg  = cells[dragSrcIndex].querySelector('img');
      const destImg = cells[dropIndex].querySelector('img');
      [srcImg.src, destImg.src]     = [destImg.src, srcImg.src];
      [srcImg.alt, destImg.alt]     = [destImg.alt, srcImg.alt];
      [srcImg.title, destImg.title] = [destImg.title, srcImg.title];

      dragSrcIndex = null;
    });
  });
}

function hidePreview() {
  previewSection.style.display = 'none';
  quiltGrid.innerHTML = '';
}

// ─── Color Extraction ──────────────────────────────────────
/** Sample an image at 20×20 and return its average [r, g, b]. */
function extractAvgColor(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 20; canvas.height = 20;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 20, 20);
      const d = ctx.getImageData(0, 0, 20, 20).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; }
      resolve([r / 400, g / 400, b / 400]);
    };
    img.onerror = () => resolve([128, 128, 128]);
    img.src = dataUrl;
  });
}

/** Euclidean distance between two [r,g,b] colors. */
function colorDist(a, b) {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

// ─── Perceptual Hash (pHash) ───────────────────────────────
/** 1D Discrete Cosine Transform. */
function dct1d(input) {
  const N = input.length;
  const out = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += input[n] * Math.cos(Math.PI * k * (2 * n + 1) / (2 * N));
    }
    out[k] = sum;
  }
  return out;
}

/**
 * Compute a 63-bit perceptual hash for an image.
 * Same pattern, different colors → very small Hamming distance.
 * Different patterns → large Hamming distance.
 */
function computePHash(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const SIZE = 32;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

      // Grayscale 2D array
      const gray = Array.from({ length: SIZE }, (_, y) =>
        Array.from({ length: SIZE }, (_, x) => {
          const i = (y * SIZE + x) * 4;
          return 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        })
      );

      // 2D DCT: apply 1D DCT to rows, then to columns
      const rowDCT = gray.map(row => dct1d(row));
      const dct2 = Array.from({ length: SIZE }, () => new Float64Array(SIZE));
      for (let x = 0; x < SIZE; x++) {
        const col = rowDCT.map(row => row[x]);
        const colDCT = dct1d(col);
        for (let y = 0; y < SIZE; y++) dct2[y][x] = colDCT[y];
      }

      // Top-left 8×8, skip DC component [0][0] (just average brightness — not structural)
      const vals = [];
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++)
          if (!(y === 0 && x === 0)) vals.push(dct2[y][x]);

      // Hash: each bit = 1 if value > mean of the 63 frequency components
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      resolve(vals.map(v => v > mean ? 1 : 0)); // 63-bit hash
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Number of differing bits between two pHashes (0 = identical pattern). */
function hammingDist(h1, h2) {
  if (!h1 || !h2) return 0;
  let d = 0;
  for (let i = 0; i < h1.length; i++) if (h1[i] !== h2[i]) d++;
  return d;
}

// ─── Optimize Layout (color + pattern) ────────────────────
function optimizeLayout() {
  if (!state.images.length) return;

  updateDimState();
  const { cols, rows, images, multiplier } = state;
  const total = cols * rows;

  let pool = [];
  for (let i = 0; i < multiplier; i++) pool.push(...images);
  while (pool.length < total) pool.push(...images);
  pool = shuffle(pool.slice(0, total));

  const result = new Array(total).fill(null);
  const remaining = [...pool];

  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    const neighbors = [];
    if (col > 0 && result[i - 1])    neighbors.push(result[i - 1]);
    if (row > 0 && result[i - cols]) neighbors.push(result[i - cols]);

    if (!neighbors.length) {
      result[i] = remaining.splice(0, 1)[0];
      continue;
    }

    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let j = 0; j < remaining.length; j++) {
      const img = remaining[j];
      const c = img.color || [128, 128, 128];

      // Color distance normalized to 0–1 (max Euclidean RGB distance ≈ 441)
      const colorScore = neighbors.reduce(
        (sum, n) => sum + colorDist(c, n.color || [128, 128, 128]), 0) / 441;

      // Pattern distance normalized to 0–1 (max Hamming distance = 63 bits)
      const patternScore = neighbors.reduce(
        (sum, n) => sum + hammingDist(img.phash, n.phash), 0) / 63;

      // Equal weight: maximize difference in both color AND pattern
      const score = colorScore + patternScore;
      if (score > bestScore) { bestScore = score; bestIdx = j; }
    }

    result[i] = remaining.splice(bestIdx, 1)[0];
  }

  renderGrid(result, cols, rows);
  gridInfo.textContent += '  —  color + pattern optimized';
}

// ─── Hue Diagonal Layout ───────────────────────────────────
/** Convert avg [r,g,b] to hue in degrees (0–360). */
function hueOf(color) {
  if (!color) return 0;
  const r = color[0] / 255, g = color[1] / 255, b = color[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0; // achromatic — no hue
  const d = max - min;
  let h;
  if (max === r)      h = ((g - b) / d + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else                h = (r - g) / d + 4;
  return h * 60;
}

function hueDiagonalLayout() {
  if (!state.images.length) return;

  updateDimState();
  const { cols, rows, images, multiplier } = state;
  const total = cols * rows;

  let pool = [];
  for (let i = 0; i < multiplier; i++) pool.push(...images);
  while (pool.length < total) pool.push(...images);
  pool = pool.slice(0, total);

  // Sort entire pool by hue: red → orange → yellow → green → blue → purple
  pool.sort((a, b) => hueOf(a.color) - hueOf(b.color));

  // Group grid cells by diagonal index d = row + col (0 … rows+cols-2)
  // Each diagonal d gets the next chunk of hue-sorted images
  const numDiags = rows + cols - 1;
  const diagCells = Array.from({ length: numDiags }, () => []);
  for (let i = 0; i < total; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    diagCells[r + c].push(i);
  }

  const result = new Array(total);
  let poolIdx = 0;

  for (let d = 0; d < numDiags; d++) {
    const cells = diagCells[d];
    // Slice the next chunk of hue-ordered images for this diagonal
    const chunk = pool.slice(poolIdx, poolIdx + cells.length);
    poolIdx += cells.length;
    // Shuffle within the diagonal so the same-hue images aren't locked to the same row
    shuffle(chunk);
    cells.forEach((cellIdx, i) => { result[cellIdx] = chunk[i]; });
  }

  renderGrid(result, cols, rows);
  gridInfo.textContent += '  —  hue diagonal (red → purple)';
}

// ─── Checkerboard Layout ───────────────────────────────────
/** Perceptual brightness 0–255 from an [r,g,b] color. */
function brightness(color) {
  if (!color) return 128;
  return 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2];
}

function checkerLayout() {
  if (!state.images.length) return;

  updateDimState();
  const { cols, rows, images, multiplier } = state;
  const total = cols * rows;

  // Build and shuffle pool
  let pool = [];
  for (let i = 0; i < multiplier; i++) pool.push(...images);
  while (pool.length < total) pool.push(...images);
  pool = shuffle(pool.slice(0, total));

  // Count how many grid positions need "light" vs "dark"
  let lightPositions = 0;
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    if ((row + col) % 2 === 0) lightPositions++;
  }
  const darkPositions = total - lightPositions;

  // Sort pool by perceptual brightness
  const sorted = [...pool].sort((a, b) => brightness(a.color) - brightness(b.color));

  // Split: darkest half → dark bucket, lightest half → light bucket
  // Use adaptive median so it works even if all fabrics are similarly toned
  const darkBucket  = shuffle(sorted.slice(0, darkPositions));
  const lightBucket = shuffle(sorted.slice(darkPositions));

  // Fill grid: even (row+col) positions get light fabrics, odd get dark
  const result = [];
  let li = 0, di = 0;
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    if ((row + col) % 2 === 0) {
      result.push(lightBucket[li++ % lightBucket.length]);
    } else {
      result.push(darkBucket[di++ % darkBucket.length]);
    }
  }

  renderGrid(result, cols, rows);
  gridInfo.textContent += '  —  checkerboard (light/dark)';
}

// ─── Utility ───────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Re-render on option toggle (no full reload needed)
seamsCheck.addEventListener('change', () => { if (quiltGrid.children.length) generateLayout(); });
squareCheck.addEventListener('change', () => { if (quiltGrid.children.length) generateLayout(); });
