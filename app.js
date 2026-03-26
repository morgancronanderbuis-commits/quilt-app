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
  cpLayoutMode: 'standard',  // 'standard' | 'pinwheel'
  pinwheelBg: '#ffffff',
  pinwheelPairPool: [],  // secondary triangles, parallel to currentPool in pinwheel mode
  borders: [],       // Array of { widthIn, image: {name,dataUrl}|null } — innermost first
  calc: {
    blockSizeIn:    5,    // finished block size in inches
    seamAllowance:  0.5,  // total seam allowance per side (standard ¼" = 0.5" cut-to-finished)
    fabricWidthIn:  42,   // WOF (width of fabric)
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
  jellyRoll: {
    strips: [],
    multiplier: 1,
    cols: 0,
    rows: 0,
    stripsPerBlock: 3,
    currentBlocks: [],
    layoutMode: 'railfence',
    savedLayouts: [],
    saveCounter: 0,
    activeCardId: null,
    lastCellPx: 60,
    borders: [],
    binding: {
      enabled: false,
      widthPx: 14,
      type: 'solid',
      solidColor: '#7b5e3a',
      gradientColors: ['#7b5e3a', '#d4a574'],
      gradientDir: '135deg',
      image: null,
    },
    calc: {
      fabricWidthIn: 42,
      stripWidthIn: 2.5,
      packTotalStrips: 40,
      packUniqueDesigns: 20,
      packStripLengthIn: 44,
    },
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
    document.getElementById('drop-zone').style.display = 'none';
    const compact = document.getElementById('upload-compact');
    compact.style.display = 'flex';
    document.getElementById('upload-compact-count').textContent =
      `${count} fabric${count !== 1 ? 's' : ''} loaded`;
    controls.style.display = 'flex';
    rebuildDimensionOptions();
    updateSetCountLabel();
    buildImagePickers();
  } else {
    document.getElementById('drop-zone').style.display = '';
    document.getElementById('upload-compact').style.display = 'none';
    controls.style.display = 'none';
  }
}

document.getElementById('upload-replace-btn').addEventListener('click', () => {
  clearImages();
  // clearImages → onImagesUpdated(count=0) → shows drop zone automatically
});

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
generateBtn.addEventListener('click', () => { setCpModeStandard(); generateLayout(); });
shuffleBtn.addEventListener('click', () => {
  setCpModeStandard();
  shuffleCheck.checked = true;
  generateLayout();
});
optimizeBtn.addEventListener('click', () => { setCpModeStandard(); optimizeLayout(); });
checkerBtn.addEventListener('click', () => { setCpModeStandard(); checkerLayout(); });
const hueDiagBtn = document.getElementById('hue-diag-btn');
hueDiagBtn.addEventListener('click', () => { setCpModeStandard(); hueDiagonalLayout(); });

function setCpModeStandard() {
  state.cpLayoutMode = 'standard';
  document.getElementById('pinwheel-bg-row').style.display = 'none';
  document.getElementById('pinwheel-btn').classList.remove('active-mode');
}

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
  const pxPerIn   = state.lastCellPx / (state.calc.blockSizeIn || 5);
  const borderPad = state.borders.reduce((s, b) => s + (b.widthIn || 0) * pxPerIn, 0) * 2;
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
  state.borders.push({ widthIn: 3, image: null });
  renderBorderLayersUI();
  reRenderIfActive();
  renderCalculator();
});

function renderBorderLayersUIFor(borders, listId, emptyHintId, srcImages, reRenderFn) {
  const list = document.getElementById(listId);
  const emptyHint = document.getElementById(emptyHintId);
  list.querySelectorAll('.border-layer-card').forEach(c => c.remove());

  if (!borders.length) {
    if (emptyHint) emptyHint.style.display = '';
    return;
  }
  if (emptyHint) emptyHint.style.display = 'none';

  borders.forEach((layer, idx) => {
    const card = document.createElement('div');
    card.className = 'border-layer-card';
    card.dataset.idx = idx;

    const header = document.createElement('div');
    header.className = 'border-layer-header';

    const numLabel = document.createElement('span');
    numLabel.className = 'border-layer-num';
    numLabel.textContent = `Layer ${idx + 1}`;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'border-layer-slider';
    slider.min = 0.5; slider.max = 12; slider.step = 0.25; slider.value = layer.widthIn;

    const valSpan = document.createElement('span');
    valSpan.className = 'border-layer-val';
    valSpan.textContent = `${layer.widthIn}"`;

    slider.addEventListener('input', () => {
      layer.widthIn = parseFloat(slider.value);
      valSpan.textContent = `${layer.widthIn}"`;
      reRenderFn();
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-border';
    removeBtn.textContent = '✕ Remove';
    removeBtn.addEventListener('click', () => {
      borders.splice(idx, 1);
      renderBorderLayersUIFor(borders, listId, emptyHintId, srcImages, reRenderFn);
      reRenderFn();
    });

    header.append(numLabel, slider, valSpan, removeBtn);

    const pickerWrap = document.createElement('div');
    pickerWrap.className = 'bb-row bb-row-stack';

    const pickerLabel = document.createElement('span');
    pickerLabel.className = 'bb-label';
    pickerLabel.textContent = 'Fabric';

    const pickerId = `${listId}-picker-${idx}`;
    const pickerRow = document.createElement('div');
    pickerRow.className = 'picker-row';
    pickerRow.id = pickerId;
    pickerRow.innerHTML = '<em class="picker-empty">Load images first</em>';

    const uploadId = `${listId}-upload-${idx}`;
    const uploadLabel = document.createElement('label');
    uploadLabel.className = 'btn-upload-sm';
    uploadLabel.textContent = '+ Upload New';
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
        buildImagePicker(pickerId, img => { layer.image = img; reRenderFn(); }, layer.image?.dataUrl, srcImages);
        reRenderFn();
      };
      reader.readAsDataURL(file);
    });

    pickerWrap.append(pickerLabel, pickerRow, uploadLabel, uploadInput);
    card.append(header, pickerWrap);
    list.appendChild(card);

    buildImagePicker(pickerId, img => { layer.image = img; reRenderFn(); }, layer.image?.dataUrl, srcImages);
  });
}

function renderBorderLayersUI() {
  renderBorderLayersUIFor(
    state.borders,
    'border-layers-list',
    'border-empty-hint',
    state.images,
    () => { reRenderIfActive(); renderCalculator(); }
  );
}

function renderJrBorderLayersUI() {
  renderBorderLayersUIFor(
    state.jellyRoll.borders,
    'jr-border-layers-list',
    'jr-border-empty-hint',
    state.jellyRoll.strips,
    () => { jrReRenderIfActive(); renderJrCalculator(); }
  );
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

// ── JR Border & Binding Listeners ──────────────────────────
document.getElementById('jr-add-border-btn').addEventListener('click', () => {
  state.jellyRoll.borders.push({ widthIn: 3, image: null });
  renderJrBorderLayersUI();
  jrReRenderIfActive();
  renderJrCalculator();
});

document.getElementById('jr-binding-enabled').addEventListener('change', e => {
  state.jellyRoll.binding.enabled = e.target.checked;
  document.getElementById('jr-binding-opts').hidden = !e.target.checked;
  if (state.jellyRoll.currentBlocks.length) applyJrBorderBinding();
});

document.getElementById('jr-binding-width-range').addEventListener('input', e => {
  state.jellyRoll.binding.widthPx = parseInt(e.target.value, 10);
  document.getElementById('jr-binding-width-display').textContent = `${e.target.value} px`;
  if (state.jellyRoll.currentBlocks.length) applyJrBorderBinding();
});

document.getElementById('jr-binding-solid-color').addEventListener('input', e => {
  state.jellyRoll.binding.solidColor = e.target.value;
  if (state.jellyRoll.currentBlocks.length) applyJrBorderBinding();
});

document.getElementById('jr-binding-grad-dir').addEventListener('change', e => {
  state.jellyRoll.binding.gradientDir = e.target.value;
  if (state.jellyRoll.currentBlocks.length) applyJrBorderBinding();
});

document.getElementById('jr-add-grad-stop').addEventListener('click', () => {
  if (state.jellyRoll.binding.gradientColors.length >= 5) return;
  state.jellyRoll.binding.gradientColors.push('#c8a96e');
  renderJrGradientStops();
  if (state.jellyRoll.currentBlocks.length) applyJrBorderBinding();
});

document.getElementById('jr-binding-upload-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    state.jellyRoll.binding.image = { name: file.name, dataUrl: ev.target.result };
    buildJrBindingPicker();
    if (state.jellyRoll.currentBlocks.length) applyJrBorderBinding();
  };
  reader.readAsDataURL(file);
});

document.querySelectorAll('#jr-binding-type-tabs .type-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#jr-binding-type-tabs .type-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.jellyRoll.binding.type = btn.dataset.type;
    document.getElementById('jr-binding-solid-panel').hidden   = state.jellyRoll.binding.type !== 'solid';
    document.getElementById('jr-binding-gradient-panel').hidden = state.jellyRoll.binding.type !== 'gradient';
    document.getElementById('jr-binding-pattern-panel').hidden  = state.jellyRoll.binding.type !== 'pattern';
    if (state.jellyRoll.currentBlocks.length) applyJrBorderBinding();
  });
});

// ─── Border & Binding — dynamic nested wrappers ────────────
function applyBorderBindingToFrame(frameId, gridId, borders, binding, pxPerIn) {
  const quiltGridEl = document.getElementById(gridId);
  const frame       = document.getElementById(frameId);
  frame.innerHTML = '';
  let inner = quiltGridEl;

  for (const b of borders) {
    const bPx = Math.max(Math.round((b.widthIn || 0) * pxPerIn), 4);
    const wrap = document.createElement('div');
    wrap.className = 'dyn-border-layer';
    wrap.style.padding = `${bPx}px`;
    if (b.image) {
      const tile = Math.max(bPx * 2, 40);
      wrap.style.backgroundImage  = `url("${b.image.dataUrl}")`;
      wrap.style.backgroundSize   = `${tile}px ${tile}px`;
      wrap.style.backgroundRepeat = 'repeat';
    } else {
      wrap.style.background =
        'repeating-linear-gradient(45deg,#e8ddd0,#e8ddd0 6px,#d9cfc4 6px,#d9cfc4 12px)';
    }
    wrap.appendChild(inner);
    inner = wrap;
  }

  if (binding.enabled) {
    const w = binding.widthPx;
    const wrap = document.createElement('div');
    wrap.className = 'dyn-binding-layer';
    wrap.style.padding = `${w}px`;
    const { type, solidColor, gradientColors, gradientDir, image } = binding;
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

function applyBorderBinding() {
  const pxPerIn = state.lastCellPx / (state.calc.blockSizeIn || 5);
  applyBorderBindingToFrame('quilt-frame', 'quilt-grid', state.borders, state.binding, pxPerIn);
}

function applyJrBorderBinding() {
  const jr = state.jellyRoll;
  const finishedStripW = jr.calc.stripWidthIn - 0.5;
  const blockSizeIn = jr.stripsPerBlock * finishedStripW || 5;
  applyBorderBindingToFrame('jr-quilt-frame', 'jr-quilt-grid', jr.borders, jr.binding, jr.lastCellPx / blockSizeIn);
}

// ─── Image Pickers ─────────────────────────────────────────
function buildImagePicker(containerId, onSelect, currentDataUrl, sourceImages) {
  if (!sourceImages) sourceImages = state.images;
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (!sourceImages.length) {
    container.innerHTML = '<em class="picker-empty">Load images first</em>';
    return;
  }

  // Optionally include a dedicated uploaded image that isn't in sourceImages
  const items = [...sourceImages];
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
    if (state.currentPool.length) applyBorderBinding();
  }, state.binding.image?.dataUrl);
}

function buildImagePickers() {
  renderBorderLayersUI();
  buildBindingPicker();
}

function buildJrBorderPickerAt(idx) {
  const layer = state.jellyRoll.borders[idx];
  if (!layer) return;
  buildImagePicker(`jr-border-layers-list-picker-${idx}`, img => {
    layer.image = img;
    applyJrBorderBinding();
  }, layer.image?.dataUrl, state.jellyRoll.strips);
}

function buildJrBindingPicker() {
  buildImagePicker('jr-binding-picker', img => {
    state.jellyRoll.binding.image = img;
    applyJrBorderBinding();
  }, state.jellyRoll.binding.image?.dataUrl, state.jellyRoll.strips);
}

function buildJrImagePickers() {
  state.jellyRoll.borders.forEach((_, idx) => buildJrBorderPickerAt(idx));
  buildJrBindingPicker();
}

// ─── Gradient Stops ────────────────────────────────────────
function renderGradientStopsFor(binding, rowId, addBtnId, reRenderFn) {
  const row = document.getElementById(rowId);
  const addBtn = document.getElementById(addBtnId);
  row.querySelectorAll('.grad-stop-wrap').forEach(el => el.remove());

  binding.gradientColors.forEach((color, idx) => {
    const wrap = document.createElement('span');
    wrap.className = 'grad-stop-wrap';

    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'grad-stop';
    input.value = color;
    input.addEventListener('input', () => {
      binding.gradientColors[idx] = input.value;
      reRenderFn();
    });
    wrap.appendChild(input);

    if (binding.gradientColors.length > 2) {
      const rm = document.createElement('button');
      rm.className = 'btn-remove-stop';
      rm.textContent = '✕';
      rm.title = 'Remove stop';
      rm.addEventListener('click', () => {
        binding.gradientColors.splice(idx, 1);
        renderGradientStopsFor(binding, rowId, addBtnId, reRenderFn);
        reRenderFn();
      });
      wrap.appendChild(rm);
    }

    row.insertBefore(wrap, addBtn);
  });

  addBtn.style.display = binding.gradientColors.length >= 5 ? 'none' : '';
}

function renderGradientStops() {
  renderGradientStopsFor(state.binding, 'grad-stops-row', 'add-grad-stop', () => {
    if (state.currentPool.length) applyBorderBinding();
  });
}

function renderJrGradientStops() {
  renderGradientStopsFor(state.jellyRoll.binding, 'jr-grad-stops-row', 'jr-add-grad-stop', () => {
    if (state.jellyRoll.currentBlocks.length) applyJrBorderBinding();
  });
}

// Initialize gradient stops UI on load
renderGradientStops();
renderJrGradientStops();

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

  let thumbnail;
  if (state.cpLayoutMode === 'pinwheel') {
    thumbnail = await generatePinwheelThumbnail(pool, cols, rows);
  } else {
    thumbnail = await generateThumbnail(pool, cols, rows);
  }
  const id = Date.now();

  state.savedLayouts.push({
    id, label, pool, cols, rows, thumbnail, layoutMode: state.cpLayoutMode,
    pairPool: state.cpLayoutMode === 'pinwheel' ? [...state.pinwheelPairPool] : [],
  });
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
async function loadSavedLayout(id) {
  const layout = state.savedLayouts.find(l => l.id === id);
  if (!layout) return;
  state.activeCardId = id;
  if (layout.layoutMode === 'pinwheel') {
    state.cpLayoutMode = 'pinwheel';
    state.pinwheelPairPool = layout.pairPool || [];
    document.getElementById('pinwheel-bg-row').style.display = 'flex';
    document.getElementById('pinwheel-btn').classList.add('active-mode');
    await renderPinwheelGrid(layout.pool, layout.cols, layout.rows);
  } else {
    state.cpLayoutMode = 'standard';
    document.getElementById('pinwheel-bg-row').style.display = 'none';
    document.getElementById('pinwheel-btn').classList.remove('active-mode');
    renderGrid(layout.pool, layout.cols, layout.rows);
  }
  gridInfo.textContent = layout.label + '  (loaded)';
  renderSavedPanel(); // refresh active-card highlight
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

function renderCalculator() {
  const section = document.getElementById('calc-section');
  if (!state.currentPool.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  const c   = state.calc;
  const { cols, rows, borders, binding, currentPool } = state;
  const { blockSizeIn, seamAllowance: sa, fabricWidthIn: wof } = c;
  const cutBlockSize = blockSizeIn + sa * 2;

  // ── Quilt dimensions ──────────────────────────────────────
  let qW = cols * blockSizeIn;
  let qH = rows * blockSizeIn;
  const blockQW = qW, blockQH = qH;

  for (const b of borders) { qW += (b.widthIn || 0) * 2; qH += (b.widthIn || 0) * 2; }

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
    const { table: brdT, tbody: brdB } = makeCalcTable(['', 'Layer', 'Fabric', 'Width', 'Yardage']);

    let runW = blockQW, runH = blockQH;
    borders.forEach((border, idx) => {
      const bIn = border.widthIn || 0;
      const yards = borderYardsNeeded(bIn, runW, runH, sa, wof);

      const thumbEl = border.image
        ? `<img src="${border.image.dataUrl}" class="calc-thumb" alt="" />`
        : `<div class="no-fabric-thumb">?</div>`;

      const tr = brdB.insertRow();
      tr.innerHTML = `
        <td>${thumbEl}</td>
        <td>Layer ${idx + 1}</td>
        <td style="font-size:0.8rem;color:var(--text-muted)">${border.image ? border.image.name : 'No fabric selected'}</td>
        <td>${bIn}"</td>
        <td class="yardage-cell">${formatYards(yards)}</td>`;

      runW += bIn * 2;
      runH += bIn * 2;
    });

    const brdBody = document.createElement('div');
    brdBody.className = 'calc-card-body';
    brdBody.appendChild(brdT);
    const brdNote = document.createElement('p');
    brdNote.className = 'calc-disclaimer';
    brdNote.textContent = 'Border widths set via the controls above. Yardage includes extra for seams and corners.';
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
  if (!state.currentPool.length) return;
  if (state.cpLayoutMode === 'pinwheel') {
    renderPinwheelGrid(state.currentPool, state.cols, state.rows);
  } else {
    renderGrid(state.currentPool, state.cols, state.rows);
  }
}
seamsCheck.addEventListener('change', reRenderIfActive);
squareCheck.addEventListener('change', reRenderIfActive);

// Refit to window on resize (both tabs)
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    reRenderIfActive();
    jrReRenderIfActive();
  }, 250);
});

// ═══════════════════════════════════════════════════════════
// ─── TAB SWITCHING ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.hidden = true);
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab + '-tab').hidden = false;
  });
});

// ═══════════════════════════════════════════════════════════
// ─── CHARM PACK — PINWHEEL ─────────────────────────────────
// ═══════════════════════════════════════════════════════════

document.getElementById('pinwheel-btn').addEventListener('click', () => {
  state.cpLayoutMode = 'pinwheel';
  document.getElementById('pinwheel-bg-row').style.display = 'flex';
  document.getElementById('pinwheel-btn').classList.add('active-mode');
  generatePinwheelLayout();
});

document.getElementById('pinwheel-bg-color').addEventListener('input', e => {
  state.pinwheelBg = e.target.value;
  if (state.cpLayoutMode === 'pinwheel') {
    const grid = document.getElementById('quilt-grid');
    if (grid.classList.contains('show-seams')) grid.style.background = state.pinwheelBg;
  }
});

function generatePinwheelLayout() {
  if (!state.images.length) return;

  updateDimState();
  const { cols, rows, images, multiplier } = state;
  const total = cols * rows;

  let base = [];
  for (let i = 0; i < multiplier; i++) base.push(...images);
  while (base.length < total) base.push(...images);

  let pool = base.slice(0, total);
  // Secondary pool: offset by half so paired triangles use different fabrics
  const half = Math.ceil(base.length / 2);
  let pool2 = [...base.slice(half), ...base.slice(0, half)].slice(0, total);

  if (shuffleCheck.checked) {
    pool  = shuffle([...pool]);
    pool2 = shuffle([...pool2]);
  }

  state.pinwheelPairPool = pool2;
  renderPinwheelGrid(pool, cols, rows);
}

// Canvas polygon fractions [0-1] for each (row%2, col%2) quadrant
const PINWHEEL_POLYS = {
  '0,0': [[1,0],[1,1],[0,1]],   // lower-right
  '0,1': [[0,0],[0,1],[1,1]],   // lower-left
  '1,0': [[0,0],[1,0],[1,1]],   // upper-right
  '1,1': [[0,0],[1,0],[0,1]],   // upper-left
};
const PINWHEEL_COMPLEMENT_POLYS = {
  '0,0': [[0,0],[1,0],[0,1]],   // upper-left
  '0,1': [[0,0],[1,0],[1,1]],   // upper-right
  '1,0': [[0,0],[0,1],[1,1]],   // lower-left
  '1,1': [[1,0],[1,1],[0,1]],   // lower-right
};

function drawPinwheelCell(ctx, size, primEl, secEl, clipKey) {
  const tri = (el, poly) => {
    ctx.save();
    ctx.beginPath();
    poly.forEach(([px, py], i) => {
      i === 0 ? ctx.moveTo(px * size, py * size) : ctx.lineTo(px * size, py * size);
    });
    ctx.closePath();
    ctx.clip();
    if (el) {
      const s = Math.min(el.naturalWidth, el.naturalHeight);
      ctx.drawImage(el, (el.naturalWidth - s) / 2, (el.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    } else {
      ctx.fillStyle = '#bbb';
      ctx.fillRect(0, 0, size, size);
    }
    ctx.restore();
  };
  tri(secEl, PINWHEEL_COMPLEMENT_POLYS[clipKey]);
  tri(primEl, PINWHEEL_POLYS[clipKey]);
}

async function renderPinwheelGrid(pool, cols, rows) {
  state.currentPool = [...pool];
  state.cols = cols;
  state.rows = rows;
  state.cpLayoutMode = 'pinwheel';

  const cellPx = computeCellPx(cols, rows);
  state.lastCellPx = cellPx;

  const grid = document.getElementById('quilt-grid');
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = `repeat(${cols}, ${cellPx}px)`;
  grid.style.width = 'fit-content';
  grid.style.maxWidth = '';
  grid.className = 'quilt-grid ' + (seamsCheck.checked ? 'show-seams' : 'no-seams');
  // Use pinwheelBg as seam gap color in pinwheel mode
  grid.style.background = seamsCheck.checked ? state.pinwheelBg : '';

  const pairPool = state.pinwheelPairPool;

  // Pre-load all unique images
  const uniqueUrls = new Set(pool.map(i => i.dataUrl));
  pairPool.forEach(img => img && uniqueUrls.add(img.dataUrl));
  const imgMap = new Map();
  await Promise.all([...uniqueUrls].map(url => new Promise(res => {
    const el = new Image();
    el.onload = () => { imgMap.set(url, el); res(); };
    el.onerror = () => res();
    el.src = url;
  })));
  state.pinwheelImgMap = imgMap;

  pool.forEach((img, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const clipKey = `${row % 2},${col % 2}`;
    const secImg = pairPool[i] || img;

    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cellPx * dpr);
    canvas.height = Math.round(cellPx * dpr);
    canvas.style.width = cellPx + 'px';
    canvas.style.height = cellPx + 'px';
    canvas.className = 'quilt-cell pinwheel-cell';
    canvas.dataset.index = i;
    canvas.draggable = true;
    canvas.title = img.name;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    drawPinwheelCell(ctx, cellPx, imgMap.get(img.dataUrl), imgMap.get(secImg.dataUrl), clipKey);
    grid.appendChild(canvas);
  });

  addPinwheelDragSwap();
  applyBorderBinding();
  renderCalculator();

  gridInfo.textContent = `${cols} columns × ${rows} rows — ${pool.length} blocks (pinwheel)`;
  previewSection.style.display = 'block';
}

function addPinwheelDragSwap() {
  let dragSrcIndex = null;

  quiltGrid.querySelectorAll('.pinwheel-cell[data-index]').forEach(cell => {
    cell.addEventListener('dragstart', e => {
      dragSrcIndex = parseInt(cell.dataset.index, 10);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => cell.classList.add('dragging'), 0);
    });

    cell.addEventListener('dragend', () => {
      cell.classList.remove('dragging');
      quiltGrid.querySelectorAll('.pinwheel-cell').forEach(c => c.classList.remove('drag-over'));
    });

    cell.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      quiltGrid.querySelectorAll('.pinwheel-cell').forEach(c => c.classList.remove('drag-over'));
      if (parseInt(cell.dataset.index, 10) !== dragSrcIndex) cell.classList.add('drag-over');
    });

    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));

    cell.addEventListener('drop', e => {
      e.preventDefault();
      cell.classList.remove('drag-over');
      const dropIndex = parseInt(cell.dataset.index, 10);
      if (dragSrcIndex === null || dropIndex === dragSrcIndex) return;

      const srcIdx = dragSrcIndex;
      dragSrcIndex = null;

      const pool = state.currentPool;
      const pair = state.pinwheelPairPool;
      [pool[srcIdx], pool[dropIndex]] = [pool[dropIndex], pool[srcIdx]];
      [pair[srcIdx], pair[dropIndex]] = [pair[dropIndex], pair[srcIdx]];

      // Redraw only the two swapped cells
      [srcIdx, dropIndex].forEach(idx => {
        const c = quiltGrid.querySelector(`.pinwheel-cell[data-index="${idx}"]`);
        if (!c) return;
        const row = Math.floor(idx / state.cols), col = idx % state.cols;
        const clipKey = `${row % 2},${col % 2}`;
        const ctx = c.getContext('2d');
        const cssSize = parseInt(c.style.width) || c.width;
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssSize, cssSize);
        const img = pool[idx];
        const secImg = pair[idx] || img;
        drawPinwheelCell(ctx, cssSize, state.pinwheelImgMap?.get(img.dataUrl), state.pinwheelImgMap?.get(secImg.dataUrl), clipKey);
      });
    });
  });
}

async function generatePinwheelThumbnail(pool, cols, rows) {
  const THUMB_W = 236;
  const gap = 1;
  const cellSize = Math.max(Math.floor((THUMB_W - gap * (cols + 1)) / cols), 4);
  const w = cellSize * cols + gap * (cols + 1);
  const h = cellSize * rows + gap * (rows + 1);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7b5e3a';
  ctx.fillRect(0, 0, w, h);

  const pairPool = state.pinwheelPairPool;

  // Load unique images
  const uniqueUrls = new Set(pool.map(i => i.dataUrl));
  pairPool.forEach(img => img && uniqueUrls.add(img.dataUrl));
  const imgMap = new Map();
  await Promise.all([...uniqueUrls].map(url => new Promise(res => {
    const el = new Image();
    el.onload = () => { imgMap.set(url, el); res(); };
    el.onerror = () => res();
    el.src = url;
  })));

  pool.forEach((img, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const cx = gap + col * (cellSize + gap);
    const cy = gap + row * (cellSize + gap);
    const clipKey = `${row % 2},${col % 2}`;
    const secImg = pairPool[i] || img;

    // Translate context to cell origin, draw, then restore
    ctx.save();
    ctx.translate(cx, cy);
    drawPinwheelCell(ctx, cellSize, imgMap.get(img.dataUrl), imgMap.get(secImg.dataUrl), clipKey);
    ctx.restore();
  });

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font = 'bold 10px sans-serif';
  const txt = 'Pinwheel';
  const bw = ctx.measureText(txt).width + 8;
  ctx.fillRect(2, h - 16, bw, 14);
  ctx.fillStyle = 'white';
  ctx.fillText(txt, 6, h - 5);

  return canvas.toDataURL('image/jpeg', 0.85);
}

// ═══════════════════════════════════════════════════════════
// ─── JELLY ROLL TAB ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

// ── JR Upload ──
const jrDropZone   = document.getElementById('jr-drop-zone');
const jrFileInput  = document.getElementById('jr-file-input');
const jrImageCount = document.getElementById('jr-image-count');
const jrClearBtn   = document.getElementById('jr-clear-btn');
const jrControls   = document.getElementById('jr-controls');

jrDropZone.addEventListener('click', e => {
  if (e.target.closest('label') || e.target === jrFileInput) return;
  jrFileInput.click();
});
jrDropZone.addEventListener('dragover', e => { e.preventDefault(); jrDropZone.classList.add('drag-over'); });
jrDropZone.addEventListener('dragleave', () => jrDropZone.classList.remove('drag-over'));
jrDropZone.addEventListener('drop', e => {
  e.preventDefault();
  jrDropZone.classList.remove('drag-over');
  handleJrFiles(e.dataTransfer.files);
});
jrFileInput.addEventListener('change', () => handleJrFiles(jrFileInput.files));
jrClearBtn.addEventListener('click', () => {
  state.jellyRoll.strips = [];
  jrFileInput.value = '';
  jrImageCount.textContent = '0 strips loaded';
  jrClearBtn.style.display = 'none';
  jrControls.style.display = 'none';
  document.getElementById('jr-preview-section').style.display = 'none';
  document.getElementById('jr-calc-section').style.display = 'none';
  document.getElementById('jr-drop-zone').style.display = '';
  document.getElementById('jr-upload-compact').style.display = 'none';
});

document.getElementById('jr-upload-replace-btn').addEventListener('click', () => {
  jrClearBtn.click();
});

function handleJrFiles(fileList) {
  const files = [...fileList].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;

  const readers = files.map(file => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve({ name: file.name, dataUrl: e.target.result });
    reader.readAsDataURL(file);
  }));

  jrImageCount.textContent = `Analyzing ${files.length} strip${files.length !== 1 ? 's' : ''}…`;

  Promise.all(readers).then(async newStrips => {
    for (const s of newStrips) {
      s.color = await extractAvgColor(s.dataUrl);
    }
    state.jellyRoll.strips.push(...newStrips);
    const count = state.jellyRoll.strips.length;
    jrImageCount.textContent = `${count} strip${count !== 1 ? 's' : ''} loaded`;
    jrClearBtn.style.display = 'inline-block';
    document.getElementById('jr-drop-zone').style.display = 'none';
    const compact = document.getElementById('jr-upload-compact');
    compact.style.display = 'flex';
    document.getElementById('jr-upload-compact-count').textContent =
      `${count} strip${count !== 1 ? 's' : ''} loaded`;
    jrControls.style.display = 'flex';
    jrRebuildDimensionOptions();
    buildJrImagePickers();
  });
}

// ── JR Dimension Logic ──
function jrRebuildDimensionOptions() {
  const jr = state.jellyRoll;
  const total = jr.strips.length * jr.multiplier;
  const pairs = getFactorPairs(total);
  const sel = document.getElementById('jr-dimension-select');
  sel.innerHTML = '';
  pairs.forEach(([cols, rows]) => {
    const opt = document.createElement('option');
    opt.value = `${cols}x${rows}`;
    opt.textContent = `${cols} × ${rows}  (${cols} cols, ${rows} rows)`;
    sel.appendChild(opt);
  });
  const best = chooseBestDefault(pairs);
  sel.value = `${best[0]}x${best[1]}`;
  jr.cols = best[0];
  jr.rows = best[1];
  document.getElementById('jr-dim-label').textContent = `= ${total} blocks total`;
}

document.getElementById('jr-dimension-select').addEventListener('change', () => {
  const [cols, rows] = document.getElementById('jr-dimension-select').value.split('x').map(Number);
  state.jellyRoll.cols = cols;
  state.jellyRoll.rows = rows;
  document.getElementById('jr-dim-label').textContent = `= ${cols * rows} blocks total`;
});

// ── JR Multiplier ──
document.getElementById('jr-mult-slider').addEventListener('input', e => {
  state.jellyRoll.multiplier = parseInt(e.target.value, 10);
  const base = state.jellyRoll.strips.length;
  const total = base * state.jellyRoll.multiplier;
  document.getElementById('jr-mult-label').textContent = state.jellyRoll.multiplier === 1
    ? `1× — ${total} strip${total !== 1 ? 's' : ''}`
    : `${state.jellyRoll.multiplier}× — ${total} blocks`;
  jrRebuildDimensionOptions();
});

// ── JR Strips per Block ──
document.getElementById('jr-strips-slider').addEventListener('input', e => {
  state.jellyRoll.stripsPerBlock = parseInt(e.target.value, 10);
  document.getElementById('jr-strips-label').textContent = `${state.jellyRoll.stripsPerBlock} strips per block`;
});

// ── JR Layout Buttons ──
document.getElementById('jr-railfence-btn').addEventListener('click', () => generateJrLayout('railfence'));
document.getElementById('jr-optimize-btn').addEventListener('click', jrOptimizeLayout);
document.getElementById('jr-checker-btn').addEventListener('click', jrCheckerLayout);
document.getElementById('jr-hue-diag-btn').addEventListener('click', jrHueDiagonalLayout);
document.getElementById('jr-shuffle-btn').addEventListener('click', () => {
  document.getElementById('jr-shuffle-check').checked = true;
  generateJrLayout(state.jellyRoll.layoutMode);
});
document.getElementById('jr-stringpinwheel-btn').addEventListener('click', () => generateJrLayout('stringpinwheel'));

function generateJrLayout(mode) {
  const jr = state.jellyRoll;
  if (!jr.strips.length) return;

  // Read current dimension selection
  const selVal = document.getElementById('jr-dimension-select').value;
  if (selVal) {
    const [c, r] = selVal.split('x').map(Number);
    jr.cols = c;
    jr.rows = r;
  }
  const { cols, rows, strips, multiplier, stripsPerBlock } = jr;
  const totalBlocks = cols * rows;

  // Build pool of strips
  let pool = [];
  for (let i = 0; i < multiplier; i++) pool.push(...strips);
  while (pool.length < totalBlocks * stripsPerBlock) pool.push(...strips);

  if (document.getElementById('jr-shuffle-check').checked) {
    pool = shuffle([...pool]);
  }

  // Group into blocks
  const blocks = [];
  for (let b = 0; b < totalBlocks; b++) {
    const blockStrips = [];
    for (let s = 0; s < stripsPerBlock; s++) {
      blockStrips.push(pool[(b * stripsPerBlock + s) % pool.length]);
    }
    blocks.push({ strips: blockStrips });
  }

  jr.currentBlocks = blocks;
  jr.layoutMode = mode;

  if (mode === 'railfence') {
    renderJrRailFenceGrid(blocks, cols, rows);
  } else {
    renderJrStringPinwheelGrid(blocks, cols, rows);
  }
}

// ── JR Re-render ──
function jrReRenderIfActive() {
  const { currentBlocks, cols, rows, layoutMode } = state.jellyRoll;
  if (!currentBlocks.length) return;
  if (layoutMode === 'railfence') renderJrRailFenceGrid(currentBlocks, cols, rows);
  else renderJrStringPinwheelGrid(currentBlocks, cols, rows);
}

// ── JR Seams ──
document.getElementById('jr-seams-check').addEventListener('change', () => {
  if (state.jellyRoll.currentBlocks.length) jrReRenderIfActive();
});

// ── Compute JR cell size ──
function computeJrCellPx(cols, rows) {
  const availW = Math.max(window.innerWidth - 64, 320);
  const availH = Math.max(window.innerHeight - 400, 200);
  return Math.max(Math.min(Math.floor(availW / cols), Math.floor(availH / rows), 120), 20);
}

// ── Rail Fence Render ──
function renderJrRailFenceGrid(blocks, cols, rows) {
  const jr = state.jellyRoll;
  const cellPx = computeJrCellPx(cols, rows);
  jr.lastCellPx = cellPx;

  const grid = document.getElementById('jr-quilt-grid');
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = `repeat(${cols}, ${cellPx}px)`;
  grid.style.width = 'fit-content';

  const showSeams = document.getElementById('jr-seams-check').checked;
  grid.className = 'quilt-grid ' + (showSeams ? 'show-seams' : 'no-seams');

  blocks.forEach((block, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const isV = (row + col) % 2 === 1;

    const cell = document.createElement('div');
    cell.className = `jr-cell rail-block ${isV ? 'rail-v' : 'rail-h'}`;
    cell.style.width = cellPx + 'px';
    cell.style.height = cellPx + 'px';
    cell.dataset.index = i;

    const slotW = cellPx / block.strips.length; // width of each strip slot in a rail-v block

    block.strips.forEach(strip => {
      const stripEl = document.createElement('div');
      stripEl.className = 'rail-strip';

      const img = document.createElement('img');
      img.src = strip.dataUrl;
      img.alt = '';
      img.draggable = false;

      if (isV) {
        // Slot is slotW wide × cellPx tall.
        // Size the img as cellPx wide × slotW tall, center it, rotate 90°
        // so the fabric pattern runs top-to-bottom instead of being a zoomed slice.
        img.style.cssText = `width:${cellPx}px;height:${slotW}px;object-fit:cover;` +
          `position:absolute;top:50%;left:50%;` +
          `transform:translate(-50%,-50%) rotate(90deg);`;
      } else {
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      }

      stripEl.appendChild(img);
      cell.appendChild(stripEl);
    });

    grid.appendChild(cell);
  });

  addJrDragSwap();
  applyJrBorderBinding();

  document.getElementById('jr-preview-section').style.display = 'block';
  document.getElementById('jr-grid-info').textContent =
    `${cols} columns × ${rows} rows — ${blocks.length} blocks (rail fence)`;
  document.getElementById('jr-calc-section').style.display = 'block';
  renderJrCalculator();
}

// ── String Pinwheel Render ──
async function renderJrStringPinwheelGrid(blocks, cols, rows) {
  const jr = state.jellyRoll;
  const cellPx = computeJrCellPx(cols, rows);
  jr.lastCellPx = cellPx;

  // Pre-load unique images
  const uniqueUrls = new Set();
  blocks.forEach(b => b.strips.forEach(s => uniqueUrls.add(s.dataUrl)));
  const imgMap = new Map();
  await Promise.all([...uniqueUrls].map(url => new Promise(res => {
    const el = new Image();
    el.onload = () => { imgMap.set(url, el); res(); };
    el.onerror = () => res();
    el.src = url;
  })));

  const grid = document.getElementById('jr-quilt-grid');
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = `repeat(${cols}, ${cellPx}px)`;
  grid.style.width = 'fit-content';

  const showSeams = document.getElementById('jr-seams-check').checked;
  grid.className = 'quilt-grid ' + (showSeams ? 'show-seams' : 'no-seams');

  blocks.forEach((block, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const isFlipped = (row + col) % 2 === 1;

    const canvas = document.createElement('canvas');
    canvas.className = 'jr-cell';
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cellPx * dpr);
    canvas.height = Math.round(cellPx * dpr);
    canvas.style.width = cellPx + 'px';
    canvas.style.height = cellPx + 'px';
    canvas.dataset.index = i;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    drawStringPinwheelBlock(ctx, cellPx, block.strips, imgMap, isFlipped);

    grid.appendChild(canvas);
  });

  addJrDragSwap();
  applyJrBorderBinding();

  document.getElementById('jr-preview-section').style.display = 'block';
  document.getElementById('jr-grid-info').textContent =
    `${cols} columns × ${rows} rows — ${blocks.length} blocks (string pinwheel)`;
  document.getElementById('jr-calc-section').style.display = 'block';
  renderJrCalculator();
}

function drawStringPinwheelBlock(ctx, size, strips, imgMap, isFlipped) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.clip();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(isFlipped ? -Math.PI / 4 : Math.PI / 4);
  // +2px buffer so floating-point can't leave bare canvas corners unpainted
  const diag = size * Math.sqrt(2) + 2;
  const sw = diag / strips.length;
  strips.forEach((strip, i) => {
    const x = -diag / 2 + i * sw;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, -diag / 2, sw, diag);
    ctx.clip();
    const imgEl = imgMap.get(strip.dataUrl);
    if (imgEl) {
      const iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;
      const scale = Math.max(sw / iw, diag / ih);
      const dw = iw * scale, dh = ih * scale;
      ctx.drawImage(imgEl, x + (sw - dw) / 2, -diag / 2 + (diag - dh) / 2, dw, dh);
    } else {
      const c = strip.color || [180, 180, 180];
      ctx.fillStyle = `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
      ctx.fillRect(x, -diag / 2, sw, diag);
    }
    ctx.restore();
  });
  ctx.restore();
}

// ── JR Drag-to-Swap ──
function addJrDragSwap() {
  let dragSrcIndex = null;
  const jrGrid = document.getElementById('jr-quilt-grid');

  jrGrid.querySelectorAll('.jr-cell[data-index]').forEach(cell => {
    cell.draggable = true;

    cell.addEventListener('dragstart', e => {
      dragSrcIndex = parseInt(cell.dataset.index, 10);
      cell.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    cell.addEventListener('dragend', () => {
      cell.classList.remove('dragging');
      jrGrid.querySelectorAll('.jr-cell').forEach(c => c.classList.remove('drag-over'));
    });

    cell.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      jrGrid.querySelectorAll('.jr-cell').forEach(c => c.classList.remove('drag-over'));
      if (parseInt(cell.dataset.index, 10) !== dragSrcIndex) cell.classList.add('drag-over');
    });

    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));

    cell.addEventListener('drop', e => {
      e.preventDefault();
      cell.classList.remove('drag-over');
      const dropIndex = parseInt(cell.dataset.index, 10);
      if (dragSrcIndex === null || dropIndex === dragSrcIndex) return;

      const srcIdx = dragSrcIndex;
      dragSrcIndex = null;

      const blocks = state.jellyRoll.currentBlocks;
      [blocks[srcIdx], blocks[dropIndex]] = [blocks[dropIndex], blocks[srcIdx]];
      jrReRenderIfActive();
    });
  });
}

// ── JR Color Optimization ──
function jrBlockColor(block) {
  const colors = block.strips.map(s => s.color).filter(Boolean);
  if (!colors.length) return [128, 128, 128];
  const sum = colors.reduce((a, c) => [a[0]+c[0], a[1]+c[1], a[2]+c[2]], [0,0,0]);
  return sum.map(v => v / colors.length);
}

function jrOptimizeLayout() {
  const jr = state.jellyRoll;
  if (!jr.strips.length) return;
  if (!jr.currentBlocks.length) generateJrLayout(jr.layoutMode);
  if (!jr.currentBlocks.length) return;

  const { cols, rows } = jr;
  const total = cols * rows;
  const remaining = [...jr.currentBlocks.slice(0, total)];
  const result = new Array(total).fill(null);
  result[0] = remaining.splice(0, 1)[0];

  for (let i = 1; i < total; i++) {
    const row = Math.floor(i / cols), col = i % cols;
    const neighbors = [];
    if (row > 0) neighbors.push(result[(row-1)*cols + col]);
    if (col > 0) neighbors.push(result[i-1]);

    let bestIdx = 0, bestScore = -Infinity;
    for (let j = 0; j < remaining.length; j++) {
      const c = jrBlockColor(remaining[j]);
      const score = neighbors.reduce((sum, n) => sum + colorDist(c, jrBlockColor(n)), 0);
      if (score > bestScore) { bestScore = score; bestIdx = j; }
    }
    result[i] = remaining.splice(bestIdx, 1)[0];
  }

  jr.currentBlocks = result;
  jrReRenderIfActive();
  document.getElementById('jr-grid-info').textContent += '  —  color optimized';
}

function jrHueDiagonalLayout() {
  const jr = state.jellyRoll;
  if (!jr.strips.length) return;
  if (!jr.currentBlocks.length) generateJrLayout(jr.layoutMode);
  if (!jr.currentBlocks.length) return;

  const { cols, rows } = jr;
  const total = cols * rows;
  const blocks = [...jr.currentBlocks.slice(0, total)];
  blocks.sort((a, b) => hueOf(jrBlockColor(a)) - hueOf(jrBlockColor(b)));

  const numDiags = rows + cols - 1;
  const diagCells = Array.from({ length: numDiags }, () => []);
  for (let i = 0; i < total; i++) diagCells[Math.floor(i/cols) + i%cols].push(i);

  const result = new Array(total);
  let poolIdx = 0;
  for (let d = 0; d < numDiags; d++) {
    const cells = diagCells[d];
    const chunk = blocks.slice(poolIdx, poolIdx + cells.length);
    poolIdx += cells.length;
    shuffle(chunk);
    cells.forEach((cellIdx, i) => { result[cellIdx] = chunk[i]; });
  }

  jr.currentBlocks = result;
  jrReRenderIfActive();
  document.getElementById('jr-grid-info').textContent += '  —  hue diagonal';
}

function jrCheckerLayout() {
  const jr = state.jellyRoll;
  if (!jr.strips.length) return;
  if (!jr.currentBlocks.length) generateJrLayout(jr.layoutMode);
  if (!jr.currentBlocks.length) return;

  const { cols, rows } = jr;
  const total = cols * rows;
  let lightPos = 0;
  for (let i = 0; i < total; i++) if ((Math.floor(i/cols) + i%cols) % 2 === 0) lightPos++;
  const darkPos = total - lightPos;

  const sorted = [...jr.currentBlocks.slice(0, total)].sort(
    (a, b) => brightness(jrBlockColor(a)) - brightness(jrBlockColor(b))
  );
  const darkBucket  = shuffle(sorted.slice(0, darkPos));
  const lightBucket = shuffle(sorted.slice(darkPos));

  const result = [];
  let li = 0, di = 0;
  for (let i = 0; i < total; i++) {
    if ((Math.floor(i/cols) + i%cols) % 2 === 0) result.push(lightBucket[li++ % lightBucket.length]);
    else result.push(darkBucket[di++ % darkBucket.length]);
  }

  jr.currentBlocks = result;
  jrReRenderIfActive();
  document.getElementById('jr-grid-info').textContent += '  —  checkerboard (light/dark)';
}

// ── JR Calculator ──
function renderJrCalculator() {
  const section = document.getElementById('jr-calc-section');
  const jr = state.jellyRoll;
  if (!jr.currentBlocks.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  const { cols, rows, currentBlocks, stripsPerBlock, calc } = jr;
  const {
    fabricWidthIn: backingWof,
    stripWidthIn,
    packTotalStrips,
    packUniqueDesigns,
    packStripLengthIn,
  } = calc;
  const results = document.getElementById('jr-calc-results');
  results.innerHTML = '';

  // ── Derived measurements ──
  // Finished strip width = cut width - 0.5" (two ¼" seam allowances)
  const finishedStripW = stripWidthIn - 0.5;
  // Block size is determined by how many strips you sew together — not a free input
  const blockSizeIn = stripsPerBlock * finishedStripW;
  // Cut block size = sub-cut length from the strip (square block + ½" SA)
  const cutBlockSize = blockSizeIn + 0.5;
  // How many sub-cuts fit in one jelly roll strip
  const subCutsPerStrip = Math.floor(packStripLengthIn / cutBlockSize);
  const leftoverPerStrip = packStripLengthIn - subCutsPerStrip * cutBlockSize;

  // Total strip slots consumed by this layout
  const totalStripSlots = cols * rows * stripsPerBlock;
  // Total jelly roll strips needed to fill the layout
  const jrStripsNeeded = Math.ceil(totalStripSlots / subCutsPerStrip);
  // Packs needed
  const packsNeeded = Math.ceil(jrStripsNeeded / packTotalStrips);
  const stripsAvailable = packsNeeded * packTotalStrips;
  const wasteStrips = stripsAvailable - jrStripsNeeded;
  const totalBlocks = cols * rows;

  // ── Card: Cutting Guide ──
  const cutCard = makeCalcCard('Cutting Guide');
  const cutBody = document.createElement('div');
  cutBody.className = 'calc-card-body cutting-guide';

  const steps = [
    {
      n: 1,
      title: `Cut each strip into <strong>${cutBlockSize}"</strong> pieces`,
      detail: `A ${stripWidthIn}" × ${packStripLengthIn}" jelly roll strip gives you <strong>${subCutsPerStrip} pieces</strong> per strip` +
        (leftoverPerStrip > 0.05 ? ` with ${leftoverPerStrip.toFixed(2)}" left over.` : ', no waste.'),
    },
    {
      n: 2,
      title: `Sew ${stripsPerBlock} pieces together along their long (${cutBlockSize}") edges`,
      detail: `Each set of ${stripsPerBlock} pieces sews into a <strong>${cutBlockSize}" × ${cutBlockSize}"</strong> block ` +
        `(finishes at ${blockSizeIn}" × ${blockSizeIn}"). ` +
        `No math needed — just line up the ${cutBlockSize}" sides and sew.`,
    },
    {
      n: 3,
      title: `For this layout: cut <strong>${jrStripsNeeded} strips</strong> total`,
      detail: `${totalBlocks} blocks × ${stripsPerBlock} strips each = ${totalStripSlots} pieces needed. ` +
        `At ${subCutsPerStrip} cuts per strip, pull <strong>${jrStripsNeeded} strip${jrStripsNeeded !== 1 ? 's' : ''}</strong> from your pack ` +
        `(${packsNeeded} pack${packsNeeded !== 1 ? 's' : ''})` +
        (wasteStrips > 0 ? ` — ${wasteStrips} strip${wasteStrips !== 1 ? 's' : ''} leftover.` : '.'),
    },
  ];

  steps.forEach(({ n, title, detail }) => {
    const row = document.createElement('div');
    row.className = 'cutting-step';
    row.innerHTML = `<div class="cutting-step-num">${n}</div>
      <div class="cutting-step-body">
        <div class="cutting-step-title">${title}</div>
        <div class="cutting-step-detail">${detail}</div>
      </div>`;
    cutBody.appendChild(row);
  });

  cutCard.appendChild(cutBody);
  results.appendChild(cutCard);

  // ── Card: Quilt Dimensions ──
  const qWin = cols * blockSizeIn;
  const qHin = rows * blockSizeIn;
  const dimCard = makeCalcCard('Quilt Dimensions');
  const { table: dimT, tbody: dimB } = makeCalcTable(['', 'Width', 'Height']);
  const dimTotRow = dimB.insertRow();
  dimTotRow.className = 'total-row';
  dimTotRow.innerHTML = `<td>Finished quilt top</td>
    <td><strong>${qWin}"</strong> (${(qWin/36).toFixed(2)} yd)</td>
    <td><strong>${qHin}"</strong> (${(qHin/36).toFixed(2)} yd)</td>`;
  const dimBody = document.createElement('div');
  dimBody.className = 'calc-card-body';
  dimBody.appendChild(dimT);
  dimCard.appendChild(dimBody);
  results.appendChild(dimCard);

  // ── Card: Jelly Roll Pack Usage ──
  const packCard = makeCalcCard('Jelly Roll Pack Usage');
  const { table: pkT, tbody: pkB } = makeCalcTable(['', 'Value']);
  const pkRows = [
    ['JR strips needed for this layout', `${jrStripsNeeded} strip${jrStripsNeeded !== 1 ? 's' : ''}`],
    ['Strips per pack', `${packTotalStrips} (${packUniqueDesigns} unique designs)`],
  ];
  pkRows.forEach(([label, val]) => {
    const r = pkB.insertRow();
    r.innerHTML = `<td>${label}</td><td>${val}</td>`;
  });
  const pkTotRow = pkB.insertRow();
  pkTotRow.className = 'total-row';
  pkTotRow.innerHTML = `<td>Packs needed</td><td><strong>${packsNeeded} pack${packsNeeded !== 1 ? 's' : ''}</strong>`;
  if (wasteStrips > 0) pkTotRow.innerHTML += ` <span class="calc-note-inline">(${wasteStrips} strip${wasteStrips !== 1 ? 's' : ''} leftover)</span>`;
  pkTotRow.innerHTML += `</td>`;
  const pkBody = document.createElement('div');
  pkBody.className = 'calc-card-body';
  pkBody.appendChild(pkT);
  // Fabric in the pack
  const packSqIn = packTotalStrips * stripWidthIn * packStripLengthIn;
  const packNote = document.createElement('p');
  packNote.className = 'calc-disclaimer';
  packNote.textContent = `1 pack = ${packTotalStrips} strips × ${stripWidthIn}" × ${packStripLengthIn}" = ${(packSqIn / 144).toFixed(1)} sq ft of fabric total.`;
  pkBody.appendChild(packNote);
  packCard.appendChild(pkBody);
  results.appendChild(packCard);

  // ── Card: Strip Usage by Design ──
  const stripCountMap = new Map();
  currentBlocks.forEach(block => {
    block.strips.forEach(strip => {
      stripCountMap.set(strip.dataUrl, (stripCountMap.get(strip.dataUrl) || 0) + 1);
    });
  });
  const usageCard = makeCalcCard('Strip Usage by Design');
  const { table: usT, tbody: usB } = makeCalcTable(['', 'Strip', 'Slots used', 'Strips cut']);
  stripCountMap.forEach((slotCount, dataUrl) => {
    const strip = jr.strips.find(s => s.dataUrl === dataUrl) || { name: 'unknown', dataUrl };
    const stripsCut = Math.ceil(slotCount / subCutsPerStrip);
    const tr = usB.insertRow();
    tr.innerHTML = `<td><img src="${strip.dataUrl}" class="calc-thumb" alt="" /></td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${strip.name}">${strip.name}</td>
      <td>${slotCount}</td>
      <td>${stripsCut}</td>`;
  });
  const usTotRow = usB.insertRow();
  usTotRow.className = 'total-row';
  usTotRow.innerHTML = `<td colspan="2">Total</td><td>${totalStripSlots} slots</td><td>${jrStripsNeeded} strips</td>`;
  const usBody = document.createElement('div');
  usBody.className = 'calc-card-body';
  usBody.appendChild(usT);
  usageCard.appendChild(usBody);
  results.appendChild(usageCard);

  // ── Card: Backing & Batting ──
  const backW = qWin + 8;
  const backH = qHin + 8;
  let backYards, backNote;
  if (backW <= backingWof) {
    backYards = backH / 36;
    backNote = '1 panel (fits within WOF)';
  } else if (backW <= backingWof * 2 - 1) {
    backYards = (backH * 2) / 36;
    backNote = '2 panels seamed side by side';
  } else {
    backYards = (backH * 3) / 36;
    backNote = '3 panels seamed side by side';
  }
  const backCard = makeCalcCard('Backing & Batting');
  const { table: backT, tbody: backB } = makeCalcTable(['', 'Dimensions', 'Yardage', 'Notes']);
  const backRow = backB.insertRow();
  backRow.innerHTML = `<td>Backing fabric</td>
    <td>${backW.toFixed(1)}" × ${backH.toFixed(1)}"</td>
    <td class="yardage-cell">${formatYards(backYards)}</td>
    <td class="calc-note-cell">${backNote}</td>`;
  const battRow = backB.insertRow();
  battRow.innerHTML = `<td>Batting</td>
    <td>${backW.toFixed(1)}" × ${backH.toFixed(1)}"</td>
    <td class="yardage-cell calc-note-cell" colspan="2">Match backing dimensions</td>`;
  const backBody = document.createElement('div');
  backBody.className = 'calc-card-body';
  backBody.appendChild(backT);
  backCard.appendChild(backBody);
  results.appendChild(backCard);
}

// Wire up JR calc inputs
document.getElementById('jr-calc-wof').addEventListener('input', e => {
  state.jellyRoll.calc.fabricWidthIn = parseFloat(e.target.value) || 42;
  if (state.jellyRoll.currentBlocks.length) renderJrCalculator();
});
document.getElementById('jr-calc-pack-strips').addEventListener('input', e => {
  state.jellyRoll.calc.packTotalStrips = parseInt(e.target.value) || 40;
  if (state.jellyRoll.currentBlocks.length) renderJrCalculator();
});
document.getElementById('jr-calc-pack-unique').addEventListener('input', e => {
  state.jellyRoll.calc.packUniqueDesigns = parseInt(e.target.value) || 20;
  if (state.jellyRoll.currentBlocks.length) renderJrCalculator();
});
document.getElementById('jr-calc-strip-width').addEventListener('input', e => {
  state.jellyRoll.calc.stripWidthIn = parseFloat(e.target.value) || 2.5;
  if (state.jellyRoll.currentBlocks.length) renderJrCalculator();
});
document.getElementById('jr-calc-strip-length').addEventListener('input', e => {
  state.jellyRoll.calc.packStripLengthIn = parseFloat(e.target.value) || 44;
  if (state.jellyRoll.currentBlocks.length) renderJrCalculator();
});

// ── JR Save / Load ──
document.getElementById('jr-save-btn').addEventListener('click', saveJrLayout);
document.getElementById('jr-clear-saved-btn').addEventListener('click', () => {
  state.jellyRoll.savedLayouts = [];
  state.jellyRoll.activeCardId = null;
  renderJrSavedPanel();
});

function saveJrLayout() {
  const jr = state.jellyRoll;
  if (!jr.currentBlocks.length) return;

  jr.saveCounter++;
  const { cols, rows, layoutMode, currentBlocks } = jr;
  const modeName = layoutMode === 'railfence' ? 'Rail Fence' : 'String Pinwheel';
  const label = `${cols}×${rows} · ${modeName} #${jr.saveCounter}`;

  const thumbnail = generateJrThumbnailSync(currentBlocks, cols, rows, layoutMode);
  const id = Date.now();

  jr.savedLayouts.push({ id, label, blocks: [...currentBlocks], cols, rows, layoutMode, thumbnail });
  jr.activeCardId = id;

  renderJrSavedPanel();

  const saveBtn = document.getElementById('jr-save-btn');
  saveBtn.textContent = 'Saved!';
  saveBtn.classList.add('saved-flash');
  setTimeout(() => {
    saveBtn.textContent = 'Save Layout';
    saveBtn.classList.remove('saved-flash');
  }, 1200);
}

function generateJrThumbnailSync(blocks, cols, rows, mode) {
  const THUMB_W = 236;
  const gap = 1;
  const cellSize = Math.max(Math.floor((THUMB_W - gap * (cols + 1)) / cols), 4);
  const w = cellSize * cols + gap * (cols + 1);
  const h = cellSize * rows + gap * (rows + 1);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#7b5e3a';
  ctx.fillRect(0, 0, w, h);

  blocks.forEach((block, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const cx = gap + col * (cellSize + gap);
    const cy = gap + row * (cellSize + gap);

    if (mode === 'railfence') {
      const isV = (row + col) % 2 === 1;
      const numStrips = block.strips.length;
      const sw = cellSize / numStrips;
      block.strips.forEach((strip, si) => {
        const c = strip.color || [180, 180, 180];
        ctx.fillStyle = `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
        if (isV) {
          ctx.fillRect(cx + si * sw, cy, sw, cellSize);
        } else {
          ctx.fillRect(cx, cy + si * sw, cellSize, sw);
        }
      });
    } else {
      // String pinwheel — draw diagonal colored strips
      const isFlipped = (row + col) % 2 === 1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, cy, cellSize, cellSize);
      ctx.clip();
      ctx.translate(cx + cellSize / 2, cy + cellSize / 2);
      ctx.rotate(isFlipped ? -Math.PI / 4 : Math.PI / 4);
      const diag = cellSize * Math.sqrt(2);
      const sw = diag / block.strips.length;
      block.strips.forEach((strip, si) => {
        const c = strip.color || [180, 180, 180];
        ctx.fillStyle = `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
        ctx.fillRect(-diag / 2 + si * sw, -diag / 2, sw, diag);
      });
      ctx.restore();
    }
  });

  // Mode badge
  const badgeText = mode === 'railfence' ? 'Rail Fence' : 'String Pinwheel';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font = 'bold 10px sans-serif';
  const badgeW = ctx.measureText(badgeText).width + 8;
  ctx.fillRect(2, h - 16, badgeW, 14);
  ctx.fillStyle = 'white';
  ctx.fillText(badgeText, 6, h - 5);

  return canvas.toDataURL('image/jpeg', 0.85);
}

function renderJrSavedPanel() {
  const jr = state.jellyRoll;
  const sec = document.getElementById('jr-saved-section');
  const grid = document.getElementById('jr-saved-grid');
  const countEl = document.getElementById('jr-saved-count');

  sec.style.display = jr.savedLayouts.length ? 'block' : 'none';
  countEl.textContent = jr.savedLayouts.length ? `(${jr.savedLayouts.length})` : '';
  grid.innerHTML = '';

  jr.savedLayouts.forEach(layout => {
    const card = document.createElement('div');
    card.className = 'saved-card' + (layout.id === jr.activeCardId ? ' active-card' : '');
    card.dataset.id = layout.id;

    const thumb = document.createElement('img');
    thumb.src = layout.thumbnail;
    thumb.alt = layout.label;
    thumb.title = 'Click to load';
    thumb.addEventListener('click', () => loadJrSavedLayout(layout.id));

    const footer = document.createElement('div');
    footer.className = 'saved-card-footer';

    const labelEl = document.createElement('input');
    labelEl.type = 'text';
    labelEl.className = 'saved-label';
    labelEl.value = layout.label;
    labelEl.title = 'Click to rename';
    labelEl.addEventListener('change', () => { layout.label = labelEl.value; });

    const actions = document.createElement('div');
    actions.className = 'saved-card-actions';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'btn-load';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => loadJrSavedLayout(layout.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete-saved';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      jr.savedLayouts = jr.savedLayouts.filter(l => l.id !== layout.id);
      if (jr.activeCardId === layout.id) jr.activeCardId = null;
      renderJrSavedPanel();
    });

    actions.append(loadBtn, delBtn);
    footer.append(labelEl, actions);
    card.append(thumb, footer);
    grid.appendChild(card);
  });
}

function loadJrSavedLayout(id) {
  const jr = state.jellyRoll;
  const layout = jr.savedLayouts.find(l => l.id === id);
  if (!layout) return;
  jr.activeCardId = id;
  jr.currentBlocks = layout.blocks;
  jr.cols = layout.cols;
  jr.rows = layout.rows;
  jr.layoutMode = layout.layoutMode;

  if (layout.layoutMode === 'railfence') {
    renderJrRailFenceGrid(layout.blocks, layout.cols, layout.rows);
  } else {
    renderJrStringPinwheelGrid(layout.blocks, layout.cols, layout.rows);
  }
  document.getElementById('jr-grid-info').textContent = layout.label + '  (loaded)';
  renderJrSavedPanel();
}
