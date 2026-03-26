// ─── State ────────────────────────────────────────────────
const state = {
  images: [],         // Array of { name, dataUrl, color, phash }
  multiplier: 1,
  cols: 0,
  rows: 0,
  currentPool: [],
  savedLayouts: [],
  saveCounter: 0,
  activeCardId: null,
  lastCellPx: 60,
  borders: [],       // Array of { widthPx, image: {name,dataUrl}|null } — innermost first
  calc: {
    blockSizeIn:    5,    // finished block size in inches
    seamAllowance:  0.5,  // total seam allowance per side (standard ¼" = 0.5" cut-to-finished)
    fabricWidthIn:  42,   // WOF (width of fabric)
    borderInches:   [],   // one entry per borders layer (user sets actual inch width here)
    bindingStripIn: 2.5,  // strip width for binding
  },
  binding: {
    enabled: false,
    widthPx: 14,
    type: 'solid',     // 'solid' | 'gradient' | 'pattern'
    solidColor: '#7b5e3a',
    gradientColors: ['#7b5e3a', '#d4a574'],
    gradientDir: '135deg',
    image: null,
  },
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
// Border & Binding DOM refs
const addBorderBtn     = document.getElementById('add-border-btn');
const borderLayersList = document.getElementById('border-layers-list');
const bindingEnabledCk = document.getElementById('binding-enabled');
const bindingOpts      = document.getElementById('binding-opts');
const bindingWidthRng  = document.getElementById('binding-width-range');
const bindingWidthDisp = document.getElementById('binding-width-display');
const bindingColorIn   = document.getElementById('binding-solid-color');
const bindingGradDir   = document.getElementById('binding-grad-dir');
const gradStopsRow     = document.getElementById('grad-stops-row');
const addGradStopBtn   = document.getElementById('add-grad-stop');
const bindingUploadIn  = document.getElementById('binding-upload-input');
const saveBtn          = document.getElementById('save-btn');
const savedSection   = document.getElementById('saved-section');
const savedGridEl    = document.getElementById('saved-grid');
const savedCountEl   = document.getElementById('saved-count');
const clearSavedBtn  = document.getElementById('clear-saved-btn');
const generateBtn    = document.getElementById('generate-btn');
const shuffleBtn     = document.getElementById('shuffle-btn');
const optimizeBtn    = document.getElementById('optimize-btn');
const checkerBtn     = document.getElementById('checker-btn');
const quiltGrid      = document.getElementById('quilt-grid');
const gridInfo       = document.getElementById('grid-info');
const shuffleCheck   = document.getElementById('shuffle-check');
const seamsCheck     = document.getElementById('seams-check');
const squareCheck    = document.getElementById('square-check');
const multSlider     = document.getElementById('mult-slider');
const multLabel      = document.getElementById('mult-label');

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
    buildImagePickers(); // keep border/binding pickers in sync
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

// ─── Multiplier Slider ─────────────────────────────────────
multSlider.addEventListener('input', () => {
  state.multiplier = parseInt(multSlider.value, 10);
  updateMultLabel();
  rebuildDimensionOptions();
});

function updateMultLabel() {
  const base  = state.images.length;
  const total = base * state.multiplier;
  multLabel.textContent = state.multiplier === 1
    ? `1× — ${total} image${total !== 1 ? 's' : ''}`
    : `${state.multiplier}× — ${total} blocks`;
}

function updateSetCountLabel() { updateMultLabel(); }

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

// ─── Save / Load / Delete ──────────────────────────────────
saveBtn.addEventListener('click', saveCurrentLayout);
clearSavedBtn.addEventListener('click', () => {
  state.savedLayouts = [];
  state.activeCardId = null;
  renderSavedPanel();
});

/** Cell size that fits the quilt + all borders + binding within the viewport. */
function computeCellPx(cols, rows) {
  const borderPad = state.borders.reduce((s, b) => s + b.widthPx, 0) * 2;
  const bindPad   = state.binding.enabled ? state.binding.widthPx * 2 : 0;
  const totalPad  = borderPad + bindPad;
  const seamGap   = seamsCheck.checked ? 3 : 0;

  const availW = Math.max(window.innerWidth  -  64, 320) - totalPad - seamGap * (cols + 1);
  const availH = Math.max(window.innerHeight - 400, 200) - totalPad - seamGap * (rows + 1);

  return Math.max(Math.min(Math.floor(availW / cols), Math.floor(availH / rows), 100), 8);
}

function renderGrid(pool, cols, rows) {
  state.currentPool = [...pool];
  state.cols = cols;
  state.rows = rows;
  quiltGrid.innerHTML = '';

  const maxCellPx = computeCellPx(cols, rows);
  state.lastCellPx = maxCellPx;
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
  applyBorderBinding();
  renderCalculator();

  gridInfo.textContent = `${cols} columns × ${rows} rows — ${pool.length} blocks`;
  previewSection.style.display = 'block';
  previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Drag-to-Swap ──────────────────────────────────────────
function addDragSwap() {
  let dragSrcIndex = null;

  quiltGrid.querySelectorAll('.quilt-cell[data-index]').forEach(cell => {
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

// ─── Border Layers ─────────────────────────────────────────
addBorderBtn.addEventListener('click', () => {
  state.borders.push({ widthPx: 30, image: null });
  state.calc.borderInches.push(3); // default 3" for new layer
  renderBorderLayersUI();
  reRenderIfActive();
  renderCalculator();
});

function renderBorderLayersUI() {
  const emptyHint = document.getElementById('border-empty-hint');
  // Remove existing layer cards (keep the empty hint)
  borderLayersList.querySelectorAll('.border-layer-card').forEach(c => c.remove());

  if (!state.borders.length) {
    if (emptyHint) emptyHint.style.display = '';
    return;
  }
  if (emptyHint) emptyHint.style.display = 'none';

  state.borders.forEach((layer, idx) => {
    const card = document.createElement('div');
    card.className = 'border-layer-card';
    card.dataset.idx = idx;

    // Header: label + width slider + remove
    const header = document.createElement('div');
    header.className = 'border-layer-header';

    const numLabel = document.createElement('span');
    numLabel.className = 'border-layer-num';
    numLabel.textContent = `Layer ${idx + 1}`;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'border-layer-slider';
    slider.min = 4; slider.max = 200; slider.value = layer.widthPx;

    const valSpan = document.createElement('span');
    valSpan.className = 'border-layer-val';
    valSpan.textContent = `${layer.widthPx} px`;

    slider.addEventListener('input', () => {
      layer.widthPx = parseInt(slider.value, 10);
      valSpan.textContent = `${layer.widthPx} px`;
      reRenderIfActive();
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-border';
    removeBtn.textContent = '✕ Remove';
    removeBtn.addEventListener('click', () => {
      state.borders.splice(idx, 1);
      state.calc.borderInches.splice(idx, 1);
      renderBorderLayersUI();
      buildImagePickers();
      reRenderIfActive();
      renderCalculator();
    });

    header.append(numLabel, slider, valSpan, removeBtn);

    // Fabric picker row
    const pickerWrap = document.createElement('div');
    pickerWrap.className = 'bb-row bb-row-stack';

    const pickerLabel = document.createElement('span');
    pickerLabel.className = 'bb-label';
    pickerLabel.textContent = 'Fabric';

    const pickerRow = document.createElement('div');
    pickerRow.className = 'picker-row';
    pickerRow.id = `border-picker-${idx}`;
    pickerRow.innerHTML = '<em class="picker-empty">Load images first</em>';

    const uploadLabel = document.createElement('label');
    uploadLabel.className = 'btn-upload-sm';
    uploadLabel.textContent = '+ Upload New';
    const uploadId = `border-upload-${idx}`;
    uploadLabel.htmlFor = uploadId;

    const uploadInput = document.createElement('input');
    uploadInput.type = 'file';
    uploadInput.id = uploadId;
    uploadInput.accept = 'image/*';
    uploadInput.hidden = true;
    uploadInput.addEventListener('change', () => {
      const file = uploadInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        layer.image = { name: file.name, dataUrl: e.target.result };
        buildBorderPickerAt(idx);
        reRenderIfActive();
      };
      reader.readAsDataURL(file);
    });

    pickerWrap.append(pickerLabel, pickerRow, uploadLabel, uploadInput);
    card.append(header, pickerWrap);
    borderLayersList.appendChild(card);

    // Populate the picker
    buildBorderPickerAt(idx);
  });
}

function buildBorderPickerAt(idx) {
  const layer = state.borders[idx];
  if (!layer) return;
  buildImagePicker(`border-picker-${idx}`, img => {
    layer.image = img;
    reRenderIfActive();
  }, layer.image?.dataUrl);
}

bindingEnabledCk.addEventListener('change', () => {
  state.binding.enabled = bindingEnabledCk.checked;
  bindingOpts.hidden = !bindingEnabledCk.checked;
  if (state.currentPool.length) applyBorderBinding();
});
bindingWidthRng.addEventListener('input', () => {
  state.binding.widthPx = parseInt(bindingWidthRng.value, 10);
  bindingWidthDisp.textContent = `${bindingWidthRng.value} px`;
  if (state.currentPool.length) applyBorderBinding();
});
bindingColorIn.addEventListener('input', () => {
  state.binding.solidColor = bindingColorIn.value;
  if (state.currentPool.length) applyBorderBinding();
});
bindingGradDir.addEventListener('change', () => {
  state.binding.gradientDir = bindingGradDir.value;
  if (state.currentPool.length) applyBorderBinding();
});
addGradStopBtn.addEventListener('click', () => {
  if (state.binding.gradientColors.length >= 5) return;
  state.binding.gradientColors.push('#c8a96e');
  renderGradientStops();
  if (state.currentPool.length) applyBorderBinding();
});
bindingUploadIn.addEventListener('change', () => {
  const file = bindingUploadIn.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state.binding.image = { name: file.name, dataUrl: e.target.result };
    buildBindingPicker();
    if (state.currentPool.length) applyBorderBinding();
  };
  reader.readAsDataURL(file);
});

// Binding type tab switching
document.querySelectorAll('#binding-type-tabs .type-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#binding-type-tabs .type-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.binding.type = btn.dataset.type;
    document.getElementById('binding-solid-panel').hidden   = state.binding.type !== 'solid';
    document.getElementById('binding-gradient-panel').hidden = state.binding.type !== 'gradient';
    document.getElementById('binding-pattern-panel').hidden  = state.binding.type !== 'pattern';
    if (state.currentPool.length) applyBorderBinding();
  });
});

// ─── Border & Binding — dynamic nested wrappers ────────────
function applyBorderBinding() {
  const quiltGridEl = document.getElementById('quilt-grid');
  const frame       = document.getElementById('quilt-frame');

  // Detach quilt-grid, clear frame
  frame.innerHTML = '';

  // Build layers from inside → out: borders then binding
  let inner = quiltGridEl;

  // Apply border layers innermost first (index 0 = innermost)
  for (const b of state.borders) {
    const wrap = document.createElement('div');
    wrap.className = 'dyn-border-layer';
    wrap.style.padding = `${b.widthPx}px`;
    if (b.image) {
      // Tile the fabric at roughly square tiles matching the strip width
      const tile = Math.max(b.widthPx * 2, 40);
      wrap.style.backgroundImage  = `url("${b.image.dataUrl}")`;
      wrap.style.backgroundSize   = `${tile}px ${tile}px`;
      wrap.style.backgroundRepeat = 'repeat';
    } else {
      // Placeholder hatch pattern when no fabric selected yet
      wrap.style.background =
        'repeating-linear-gradient(45deg,#e8ddd0,#e8ddd0 6px,#d9cfc4 6px,#d9cfc4 12px)';
    }
    wrap.appendChild(inner);
    inner = wrap;
  }

  // Apply binding (outermost)
  if (state.binding.enabled) {
    const w = state.binding.widthPx;
    const wrap = document.createElement('div');
    wrap.className = 'dyn-binding-layer';
    wrap.style.padding = `${w}px`;
    const { type, solidColor, gradientColors, gradientDir, image } = state.binding;
    if (type === 'solid') {
      wrap.style.background = solidColor;
    } else if (type === 'gradient') {
      wrap.style.background = `linear-gradient(${gradientDir}, ${gradientColors.join(', ')})`;
    } else if (type === 'pattern' && image) {
      wrap.style.backgroundImage  = `url("${image.dataUrl}")`;
      wrap.style.backgroundSize   = `${w * 3}px ${w * 3}px`;
      wrap.style.backgroundRepeat = 'repeat';
    }
    wrap.appendChild(inner);
    inner = wrap;
  }

  frame.appendChild(inner);
}

// ─── Image Pickers ─────────────────────────────────────────
function buildImagePicker(containerId, onSelect, currentDataUrl) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (!state.images.length) {
    container.innerHTML = '<em class="picker-empty">Load images first</em>';
    return;
  }

  // Optionally include a dedicated uploaded image that isn't in state.images
  const items = [...state.images];
  if (currentDataUrl && !items.find(i => i.dataUrl === currentDataUrl)) {
    items.unshift({ name: 'uploaded', dataUrl: currentDataUrl });
  }

  items.forEach(img => {
    const thumb = document.createElement('img');
    thumb.src = img.dataUrl;
    thumb.className = 'picker-thumb' + (img.dataUrl === currentDataUrl ? ' selected' : '');
    thumb.title = img.name;
    thumb.addEventListener('click', () => {
      container.querySelectorAll('.picker-thumb').forEach(t => t.classList.remove('selected'));
      thumb.classList.add('selected');
      onSelect(img);
    });
    container.appendChild(thumb);
  });
}

function buildBindingPicker() {
  buildImagePicker('binding-picker', img => {
    state.binding.image = img;
    reRenderIfActive();
  }, state.binding.image?.dataUrl);
}

function buildImagePickers() {
  // Rebuild all dynamic border pickers
  state.borders.forEach((_, idx) => buildBorderPickerAt(idx));
  buildBindingPicker();
}

// ─── Gradient Stops ────────────────────────────────────────
function renderGradientStops() {
  // Remove all existing stop wrappers (keep the + button)
  gradStopsRow.querySelectorAll('.grad-stop-wrap').forEach(el => el.remove());

  state.binding.gradientColors.forEach((color, idx) => {
    const wrap = document.createElement('span');
    wrap.className = 'grad-stop-wrap';

    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'grad-stop';
    input.value = color;
    input.addEventListener('input', () => {
      state.binding.gradientColors[idx] = input.value;
      if (state.currentPool.length) applyBorderBinding();
    });
    wrap.appendChild(input);

    if (state.binding.gradientColors.length > 2) {
      const rm = document.createElement('button');
      rm.className = 'btn-remove-stop';
      rm.textContent = '×';
      rm.title = 'Remove stop';
      rm.addEventListener('click', () => {
        state.binding.gradientColors.splice(idx, 1);
        renderGradientStops();
        if (state.currentPool.length) applyBorderBinding();
      });
      wrap.appendChild(rm);
    }

    gradStopsRow.insertBefore(wrap, addGradStopBtn);
  });

  addGradStopBtn.style.display = state.binding.gradientColors.length >= 5 ? 'none' : '';
}

// Initialize gradient stops UI on load
renderGradientStops();

function hidePreview() {
  previewSection.style.display = 'none';
  quiltGrid.innerHTML = '';
}

// ─── Thumbnail ─────────────────────────────────────────────
async function generateThumbnail(pool, cols, rows) {
  const THUMB_W = 236;
  const gap = 1;
  const cellSize = Math.max(Math.floor((THUMB_W - gap * (cols + 1)) / cols), 4);
  const w = cellSize * cols + gap * (cols + 1);
  const h = cellSize * rows + gap * (rows + 1);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Seam background
  ctx.fillStyle = '#7b5e3a';
  ctx.fillRect(0, 0, w, h);

  // Load all images in parallel then draw
  const imgEls = await Promise.all(pool.map(item => new Promise(res => {
    const el = new Image();
    el.onload = () => res(el);
    el.onerror = () => res(null);
    el.src = item.dataUrl;
  })));

  imgEls.forEach((el, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const x = gap + c * (cellSize + gap);
    const y = gap + r * (cellSize + gap);
    if (el) {
      // Square-crop: draw the center square of the source image
      const s = Math.min(el.naturalWidth, el.naturalHeight);
      const sx = (el.naturalWidth - s) / 2;
      const sy = (el.naturalHeight - s) / 2;
      ctx.drawImage(el, sx, sy, s, s, x, y, cellSize, cellSize);
    } else {
      ctx.fillStyle = '#ccc';
      ctx.fillRect(x, y, cellSize, cellSize);
    }
  });

  return canvas.toDataURL('image/jpeg', 0.85);
}

// ─── Save Layout ───────────────────────────────────────────
async function saveCurrentLayout() {
  if (!state.currentPool.length) return;

  const { cols, rows } = state;
  const pool = [...state.currentPool]; // snapshot current order

  // Auto-label: extract mode from grid info + counter
  state.saveCounter++;
  const infoText = gridInfo.textContent;
  const modePart = infoText.includes('—')
    ? infoText.split('—').pop().trim()
    : `${cols}×${rows}`;
  const label = `${cols}×${rows} · ${modePart} #${state.saveCounter}`;

  const thumbnail = await generateThumbnail(pool, cols, rows);
  const id = Date.now();

  state.savedLayouts.push({ id, label, pool, cols, rows, thumbnail });
  state.activeCardId = id;

  renderSavedPanel();

  // Brief button flash
  saveBtn.textContent = 'Saved!';
  saveBtn.classList.add('saved-flash');
  setTimeout(() => {
    saveBtn.textContent = 'Save Layout';
    saveBtn.classList.remove('saved-flash');
  }, 1200);
}

// ─── Saved Panel ───────────────────────────────────────────
function renderSavedPanel() {
  const layouts = state.savedLayouts;
  savedSection.style.display = layouts.length ? 'block' : 'none';
  savedCountEl.textContent = layouts.length ? `(${layouts.length})` : '';
  savedGridEl.innerHTML = '';

  layouts.forEach(layout => {
    const card = document.createElement('div');
    card.className = 'saved-card' + (layout.id === state.activeCardId ? ' active-card' : '');
    card.dataset.id = layout.id;

    // Thumbnail
    const thumb = document.createElement('img');
    thumb.src = layout.thumbnail;
    thumb.alt = layout.label;
    thumb.title = 'Click to load';
    thumb.addEventListener('click', () => loadSavedLayout(layout.id));

    // Footer
    const footer = document.createElement('div');
    footer.className = 'saved-card-footer';

    // Editable label
    const labelEl = document.createElement('input');
    labelEl.type = 'text';
    labelEl.className = 'saved-label';
    labelEl.value = layout.label;
    labelEl.title = 'Click to rename';
    labelEl.addEventListener('change', () => {
      layout.label = labelEl.value;
    });

    // Actions
    const actions = document.createElement('div');
    actions.className = 'saved-card-actions';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'btn-load';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => loadSavedLayout(layout.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete-saved';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      state.savedLayouts = state.savedLayouts.filter(l => l.id !== layout.id);
      if (state.activeCardId === layout.id) state.activeCardId = null;
      renderSavedPanel();
    });

    actions.append(loadBtn, delBtn);
    footer.append(labelEl, actions);
    card.append(thumb, footer);
    savedGridEl.appendChild(card);
  });
}

// ─── Load Saved Layout ─────────────────────────────────────
function loadSavedLayout(id) {
  const layout = state.savedLayouts.find(l => l.id === id);
  if (!layout) return;
  state.activeCardId = id;
  renderGrid(layout.pool, layout.cols, layout.rows);
  gridInfo.textContent = layout.label + '  (loaded)';
  renderSavedPanel(); // refresh active-card highlight
  previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// ─── Fabric Calculator ─────────────────────────────────────

// Wire up settings inputs
document.getElementById('calc-block-size').addEventListener('input', e => {
  state.calc.blockSizeIn = parseFloat(e.target.value) || 5;
  renderCalculator();
});
document.getElementById('calc-seam').addEventListener('input', e => {
  state.calc.seamAllowance = parseFloat(e.target.value) || 0.5;
  renderCalculator();
});
document.getElementById('calc-wof').addEventListener('input', e => {
  state.calc.fabricWidthIn = parseFloat(e.target.value) || 42;
  renderCalculator();
});

/** Round up to nearest ⅛ yard and format as a fraction string. */
function formatYards(yards) {
  if (yards <= 0) return '—';
  const eighths = Math.ceil(yards * 8);
  const whole = Math.floor(eighths / 8);
  const rem   = eighths % 8;
  const fracs = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];
  if (whole === 0) return `${fracs[rem]} yd`;
  if (rem   === 0) return `${whole} yd`;
  return `${whole}${fracs[rem]} yd`;
}

/** Yardage needed to cut `count` squares of `cutSize` inches from WOF fabric. */
function blockYardsNeeded(count, cutSize, wof) {
  const perStrip = Math.max(Math.floor(wof / cutSize), 1);
  const strips   = Math.ceil(count / perStrip);
  return (strips * cutSize) / 36; // convert inches → yards
}

/** Yardage for one border strip layer.
 *  @param bIn       border width in inches (finished)
 *  @param qW, qH   quilt width/height at this layer's inner edge (inches)
 *  @param sa        seam allowance
 *  @param wof       fabric width */
function borderYardsNeeded(bIn, qW, qH, sa, wof) {
  const cutWidth = bIn + sa * 2; // cut width of the strip
  // Total linear inches needed: top+bottom strips at full outer width + left+right at quilt height
  // + 20" buffer for corners/joins
  const outerW = qW + bIn * 2;
  const linearIn = 2 * outerW + 2 * qH + 20;
  const strips = Math.ceil(linearIn / (wof - sa));
  return (strips * cutWidth) / 36;
}

/** Yardage for binding. Strips are cut at `stripIn` wide across the WOF. */
function bindingYardsNeeded(perimeterIn, stripIn, wof) {
  const strips = Math.ceil((perimeterIn + 12) / wof); // +12" for joins/corners
  return (strips * stripIn) / 36;
}

/** Make a result card DOM element. */
function makeCalcCard(title) {
  const card = document.createElement('div');
  card.className = 'calc-card';
  const titleEl = document.createElement('div');
  titleEl.className = 'calc-card-title';
  titleEl.textContent = title;
  card.appendChild(titleEl);
  return card;
}

/** Build a <table> with optional header row. Returns { table, tbody }. */
function makeCalcTable(headers) {
  const table = document.createElement('table');
  table.className = 'calc-table';
  if (headers.length) {
    const thead = table.createTHead();
    const hr = thead.insertRow();
    headers.forEach(h => { const th = document.createElement('th'); th.textContent = h; hr.appendChild(th); });
  }
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  return { table, tbody };
}

function syncCalcBorderInches() {
  const c = state.calc;
  while (c.borderInches.length < state.borders.length) c.borderInches.push(3);
  c.borderInches.length = state.borders.length;
}

function renderCalculator() {
  const section = document.getElementById('calc-section');
  if (!state.currentPool.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  syncCalcBorderInches();

  const c   = state.calc;
  const { cols, rows, borders, binding, currentPool } = state;
  const { blockSizeIn, seamAllowance: sa, fabricWidthIn: wof } = c;
  const cutBlockSize = blockSizeIn + sa * 2;

  // ── Quilt dimensions ──────────────────────────────────────
  let qW = cols * blockSizeIn;
  let qH = rows * blockSizeIn;
  const blockQW = qW, blockQH = qH;

  const borderInchesSnapshot = c.borderInches.map((v, i) => parseFloat(v) || 0);
  for (const bIn of borderInchesSnapshot) { qW += bIn * 2; qH += bIn * 2; }

  const results = document.getElementById('calc-results');
  results.innerHTML = '';

  // ── Card: Quilt Dimensions ─────────────────────────────────
  const dimCard = makeCalcCard('Quilt Dimensions (finished)');
  const { table: dimT, tbody: dimB } = makeCalcTable(['', 'Width', 'Height']);
  const addDimRow = (label, w, h, cls = '') => {
    const tr = dimB.insertRow();
    tr.className = cls;
    tr.innerHTML = `<td>${label}</td><td>${w}"</td><td>${h}"</td>`;
  };
  addDimRow('Quilt blocks only', blockQW, blockQH);
  if (borders.length) addDimRow(`With ${borders.length} border${borders.length > 1 ? 's' : ''}`, qW, qH);
  const totalRow = dimB.insertRow();
  totalRow.className = 'total-row';
  totalRow.innerHTML = `<td>Finished quilt top</td>
    <td><strong>${qW}"</strong> (${(qW/36).toFixed(2)} yd)</td>
    <td><strong>${qH}"</strong> (${(qH/36).toFixed(2)} yd)</td>`;
  const dimBody = document.createElement('div');
  dimBody.className = 'calc-card-body';
  dimBody.appendChild(dimT);
  dimCard.appendChild(dimBody);
  results.appendChild(dimCard);

  // ── Card: Block Fabric ─────────────────────────────────────
  const fabricCard = makeCalcCard('Block Fabric Needed');
  const { table: fabT, tbody: fabB } = makeCalcTable(['', 'Fabric', 'Blocks', 'Cut size', 'Yardage']);

  // Group pool by dataUrl to count occurrences of each unique fabric
  const fabricMap = new Map();
  for (const img of currentPool) {
    if (!fabricMap.has(img.dataUrl)) fabricMap.set(img.dataUrl, { img, count: 0 });
    fabricMap.get(img.dataUrl).count++;
  }

  let totalFabricYards = 0;
  for (const { img, count } of fabricMap.values()) {
    const yards = blockYardsNeeded(count, cutBlockSize, wof);
    totalFabricYards += yards;
    const tr = fabB.insertRow();
    const thumb = `<img src="${img.dataUrl}" class="calc-thumb" alt="" />`;
    tr.innerHTML = `<td>${thumb}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${img.name}">${img.name}</td>
      <td>${count}</td>
      <td>${cutBlockSize}"</td>
      <td class="yardage-cell">${formatYards(yards)}</td>`;
  }

  const totRow = fabB.insertRow();
  totRow.className = 'total-row';
  totRow.innerHTML = `<td colspan="4">Total block fabric</td><td class="yardage-cell">${formatYards(totalFabricYards)}</td>`;

  const fabBody = document.createElement('div');
  fabBody.className = 'calc-card-body';
  fabBody.appendChild(fabT);
  const fabNote = document.createElement('p');
  fabNote.className = 'calc-disclaimer';
  fabNote.textContent = `Cut size: ${cutBlockSize}" per block (${blockSizeIn}" finished + ${sa * 2}" seam allowance). Assumes straight-grain cuts from ${wof}" WOF.`;
  fabBody.appendChild(fabNote);
  fabricCard.appendChild(fabBody);
  results.appendChild(fabricCard);

  // ── Card: Border Fabric ────────────────────────────────────
  if (borders.length > 0) {
    const borderCard = makeCalcCard('Border Fabric Needed');
    const { table: brdT, tbody: brdB } = makeCalcTable(['', 'Layer', 'Fabric', 'Width (in)', 'Yardage']);

    let runW = blockQW, runH = blockQH;
    borders.forEach((border, idx) => {
      const bIn = borderInchesSnapshot[idx];
      const yards = borderYardsNeeded(bIn, runW, runH, sa, wof);

      const thumbEl = border.image
        ? `<img src="${border.image.dataUrl}" class="calc-thumb" alt="" />`
        : `<div class="no-fabric-thumb">?</div>`;

      const tr = brdB.insertRow();
      const inchInputId = `calc-border-in-${idx}`;
      tr.innerHTML = `
        <td>${thumbEl}</td>
        <td>Layer ${idx + 1}</td>
        <td style="font-size:0.8rem;color:var(--text-muted)">${border.image ? border.image.name : 'No fabric selected'}</td>
        <td><input type="number" id="${inchInputId}" class="calc-inch-input"
             value="${bIn}" min="0.5" max="36" step="0.5" /></td>
        <td class="yardage-cell">${formatYards(yards)}</td>`;

      // Live update when inch value changes
      setTimeout(() => {
        document.getElementById(inchInputId)?.addEventListener('input', e => {
          state.calc.borderInches[idx] = parseFloat(e.target.value) || 0;
          renderCalculator();
        });
      }, 0);

      runW += bIn * 2;
      runH += bIn * 2;
    });

    const brdBody = document.createElement('div');
    brdBody.className = 'calc-card-body';
    brdBody.appendChild(brdT);
    const brdNote = document.createElement('p');
    brdNote.className = 'calc-disclaimer';
    brdNote.textContent = 'Enter each border width in inches as it will be cut. Yardage includes extra for seams and corners.';
    brdBody.appendChild(brdNote);
    borderCard.appendChild(brdBody);
    results.appendChild(borderCard);
  }

  // ── Card: Binding ──────────────────────────────────────────
  {
    const bindCard = makeCalcCard('Binding Needed');
    const perimeterIn = 2 * (qW + qH);
    const yards = bindingYardsNeeded(perimeterIn, c.bindingStripIn, wof);
    const thumbEl = (binding.type === 'pattern' && binding.image)
      ? `<img src="${binding.image.dataUrl}" class="calc-thumb" alt="" />`
      : `<div class="no-fabric-thumb" style="display:inline-flex">∿</div>`;

    const bindBody = document.createElement('div');
    bindBody.className = 'calc-card-body';

    const { table: bindT, tbody: bindB } = makeCalcTable(['', 'Strip width', 'Perimeter', 'Yardage']);
    const bindRow = bindB.insertRow();
    const stripInputId = 'calc-binding-strip-in';
    bindRow.innerHTML = `
      <td>${thumbEl}</td>
      <td><input type="number" id="${stripInputId}" class="calc-inch-input"
           value="${c.bindingStripIn}" min="1" max="6" step="0.25" /> in</td>
      <td>${perimeterIn.toFixed(0)}"</td>
      <td class="yardage-cell">${formatYards(yards)}</td>`;

    setTimeout(() => {
      document.getElementById(stripInputId)?.addEventListener('input', e => {
        state.calc.bindingStripIn = parseFloat(e.target.value) || 2.5;
        renderCalculator();
      });
    }, 0);

    bindBody.appendChild(bindT);
    const bindNote = document.createElement('p');
    bindNote.className = 'calc-disclaimer';
    bindNote.textContent = `Strips cut at ${c.bindingStripIn}" wide across ${wof}" WOF. Standard double-fold binding uses 2½" strips.`;
    bindBody.appendChild(bindNote);
    bindCard.appendChild(bindBody);
    results.appendChild(bindCard);
  }

  // ── Card: Backing & Batting ────────────────────────────────
  {
    const backCard = makeCalcCard('Backing & Batting / Interfacing');
    const backW = qW + 8; // 4" per side
    const backH = qH + 8;

    let backYards, backNote;
    if (backW <= wof) {
      backYards = backH / 36;
      backNote  = '1 panel (fits within WOF)';
    } else if (backW <= wof * 2 - 1) {
      backYards = (backH * 2) / 36;
      backNote  = '2 panels seamed side by side';
    } else {
      backYards = (backH * 3) / 36;
      backNote  = '3 panels seamed side by side';
    }

    const backBody = document.createElement('div');
    backBody.className = 'calc-card-body';
    const { table: backT, tbody: backB } = makeCalcTable(['', 'Dimensions', 'Yardage', 'Notes']);

    const backRow = backB.insertRow();
    backRow.innerHTML = `<td>Backing fabric</td>
      <td>${backW.toFixed(1)}" × ${backH.toFixed(1)}"</td>
      <td class="yardage-cell">${formatYards(backYards)}</td>
      <td class="calc-note-cell">${backNote}</td>`;

    const battRow = backB.insertRow();
    battRow.innerHTML = `<td>Batting / interfacing</td>
      <td>${backW.toFixed(1)}" × ${backH.toFixed(1)}"</td>
      <td class="yardage-cell calc-note-cell" colspan="2">Match backing dimensions — check batting width before buying</td>`;

    const totalBackRow = backB.insertRow();
    totalBackRow.className = 'total-row';
    totalBackRow.innerHTML = `<td colspan="4">Finished quilt top: <strong>${qW}" × ${qH}"</strong> &nbsp;|&nbsp; With backing allowance: <strong>${backW}" × ${backH}"</strong></td>`;

    backBody.appendChild(backT);
    const backNote2 = document.createElement('p');
    backNote2.className = 'calc-disclaimer';
    backNote2.textContent = 'Backing includes 4" extra on each side for quilting/trimming. Yardage rounded up to nearest ⅛ yd throughout.';
    backBody.appendChild(backNote2);
    backCard.appendChild(backBody);
    results.appendChild(backCard);
  }
}

// ─── Utility ───────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Re-render on option toggle — preserve current pool/arrangement
function reRenderIfActive() {
  if (state.currentPool.length) renderGrid(state.currentPool, state.cols, state.rows);
}
seamsCheck.addEventListener('change', reRenderIfActive);
squareCheck.addEventListener('change', reRenderIfActive);

// Refit to window on resize
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(reRenderIfActive, 250);
});
