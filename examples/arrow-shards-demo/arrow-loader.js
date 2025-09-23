// Minimal Arrow shards loader (separate from the main UI)
// Loads an Arrow manifest, fetches shards, and exposes zero-copy TypedArrays per shard.

import { tableFromIPC } from 'https://cdn.jsdelivr.net/npm/apache-arrow@12.0.1/+esm';

// Configure to your manifest locations
let manifestUrl = '../../data/arrow_spots/manifest.json';
const spotsManifestUrl = '../../data/arrow_spots/manifest.json';
const cellsManifestUrl = '../../data/arrow_cells/manifest.json';
const boundariesManifestUrl = '../../data/arrow_boundaries/manifest.json';

// Simple module-scope store for decoded shards
let boundaryShardsGlobal = null;

function log(msg) {
  const out = document.getElementById('out');
  out.textContent += msg + '\n';
}

async function fetchShard(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch shard ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const table = tableFromIPC(new Uint8Array(buf));
  return table;
}

function getTypedArrayFromColumn(table, name) {
  const col = table.getChild(name);
  if (!col) return null;
  // Combine chunks if multiple; most Feather shards have one chunk
  if (col.data.length === 1) return col.data[0].values; // zero-copy view
  const totalLength = col.length;
  const sample = col.data[0].values;
  const Ctor = sample.constructor; // e.g., Float32Array
  const out = new Ctor(totalLength);
  let offset = 0;
  for (const chunk of col.data) {
    const v = chunk.values;
    out.set(v, offset);
    offset += v.length;
  }
  return out; // note: this concatenation allocates; individual chunks remain zero-copy
}

async function loadManifest(manifestUrl) {
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
  return res.json();
}

async function loadShards(manifest) {
  // Resolve shard URLs relative to manifest
  const base = new URL(manifestUrl, window.location.href);
  const baseDir = base.href.substring(0, base.href.lastIndexOf('/') + 1);
  const shards = [];
  for (const s of manifest.shards) {
    const url = new URL(s.url, baseDir).href;
    const table = await fetchShard(url);
    const x = getTypedArrayFromColumn(table, 'x');
    const y = getTypedArrayFromColumn(table, 'y');
    const z = getTypedArrayFromColumn(table, 'z');
    const planeId = getTypedArrayFromColumn(table, 'plane_id');
    const geneId = getTypedArrayFromColumn(table, 'gene_id') || null;
    const spotIdCol = table.getChild('spot_id'); // strings – not used for plotting
    // Robust row count: prefer Arrow's numRows, fall back to a column length
    const numRows = (typeof table.numRows === 'number') ? table.numRows : (x?.length ?? y?.length ?? z?.length ?? planeId?.length ?? 0);
    shards.push({ length: numRows, x, y, z, planeId, geneId, spotIdCol });
  }
  return shards;
}

async function loadBoundaryShards(manifest) {
  // Resolve shard URLs relative to manifest
  const base = new URL(manifestUrl, window.location.href);
  const baseDir = base.href.substring(0, base.href.lastIndexOf('/') + 1);
  const shards = [];
  for (const s of manifest.shards) {
    const url = new URL(s.url, baseDir).href;
    const table = await fetchShard(url);
    const xListCol = table.getChild('x_list');
    const yListCol = table.getChild('y_list');
    const planeId = getTypedArrayFromColumn(table, 'plane_id');
    const label = getTypedArrayFromColumn(table, 'label');
    const polys = [];
    let pointCount = 0;
    const n = Math.min(xListCol?.length || 0, yListCol?.length || 0);
    for (let i = 0; i < n; i++) {
      let xs = xListCol.get(i) || [];
      let ys = yListCol.get(i) || [];
      // Normalize Arrow JS list values to plain TypedArrays/Arrays
      if (xs && typeof xs.toArray === 'function') xs = xs.toArray();
      if (ys && typeof ys.toArray === 'function') ys = ys.toArray();
      polys.push({ xs, ys });
      pointCount += (xs?.length || 0);
    }
    shards.push({ polys, planeId, label, numPolys: polys.length, numPoints: pointCount });
  }
  return shards;
}

function drawQuickPlot(canvas, shard, count = 2000, color = '#60a5fa') {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0b0b0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Normalize to canvas size
  const xs = shard.x;
  const ys = shard.y;
  if (!xs || !ys) return;
  const n = Math.min(count, shard.length);
  const minX = Math.min(...xs.slice(0, n));
  const maxX = Math.max(...xs.slice(0, n));
  const minY = Math.min(...ys.slice(0, n));
  const maxY = Math.max(...ys.slice(0, n));

  // Uniform scaling (preserve aspect ratio)
  const pad = 10;
  const dataW = Math.max(1e-6, maxX - minX);
  const dataH = Math.max(1e-6, maxY - minY);
  const availW = canvas.width - 2 * pad;
  const availH = canvas.height - 2 * pad;
  const scale = Math.min(availW / dataW, availH / dataH);
  const drawW = dataW * scale;
  const drawH = dataH * scale;
  const offX = pad + (availW - drawW) / 2;
  const offY = pad + (availH - drawH) / 2;

  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const px = offX + (xs[i] - minX) * scale;
    const py = offY + (ys[i] - minY) * scale;
    ctx.fillRect(px, py, 2, 2);
  }
}

function drawBoundaries(canvas, shard, maxPolys = 200) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0b0b0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const { polys } = shard;
  if (!polys || polys.length === 0) return;

  // Compute basic bounds from a subset for normalization
  const sample = Math.min(polys.length, 100);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < sample; i++) {
    const p = polys[i];
    for (let j = 0; j < p.xs.length; j++) {
      const xi = p.xs[j];
      const yi = p.ys[j];
      if (xi < minX) minX = xi; if (xi > maxX) maxX = xi;
      if (yi < minY) minY = yi; if (yi > maxY) maxY = yi;
    }
  }

  // Uniform scaling transform
  const pad = 10;
  const dataW = Math.max(1e-6, maxX - minX);
  const dataH = Math.max(1e-6, maxY - minY);
  const availW = canvas.width - 2 * pad;
  const availH = canvas.height - 2 * pad;
  const scale = Math.min(availW / dataW, availH / dataH);
  const drawW = dataW * scale;
  const drawH = dataH * scale;
  const offX = pad + (availW - drawW) / 2;
  const offY = pad + (availH - drawH) / 2;

  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 1;
  const drawCount = Math.min(maxPolys, polys.length);
  for (let pi = 0; pi < drawCount; pi++) {
    const p = polys[pi];
    if (p.xs.length < 2) continue;
    ctx.beginPath();
    for (let i = 0; i < p.xs.length; i++) {
      const xi = p.xs[i];
      const yi = p.ys[i];
      const px = offX + (xi - minX) * scale;
      const py = offY + (yi - minY) * scale;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function drawPolygonsList(canvas, polys, color = '#22d3ee') {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0b0b0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!polys || polys.length === 0) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const sample = Math.min(polys.length, 200);
  for (let i = 0; i < sample; i++) {
    const p = polys[i];
    for (let j = 0; j < p.xs.length; j++) {
      const xi = p.xs[j];
      const yi = p.ys[j];
      if (xi < minX) minX = xi; if (xi > maxX) maxX = xi;
      if (yi < minY) minY = yi; if (yi > maxY) maxY = yi;
    }
  }
  if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) return;

  // Uniform scaling
  const pad = 10;
  const dataW = Math.max(1e-6, maxX - minX);
  const dataH = Math.max(1e-6, maxY - minY);
  const availW = canvas.width - 2 * pad;
  const availH = canvas.height - 2 * pad;
  const scale = Math.min(availW / dataW, availH / dataH);
  const drawW = dataW * scale;
  const drawH = dataH * scale;
  const offX = pad + (availW - drawW) / 2;
  const offY = pad + (availH - drawH) / 2;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (const p of polys) {
    if (!p.xs || p.xs.length < 2) continue;
    ctx.beginPath();
    for (let i = 0; i < p.xs.length; i++) {
      const xi = p.xs[i];
      const yi = p.ys[i];
      const px = offX + (xi - minX) * scale;
      const py = offY + (yi - minY) * scale;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function filterPolysByLabel(boundaryShards, labelValue) {
  const out = [];
  for (const shard of boundaryShards || []) {
    const labels = shard.label; // TypedArray
    const polys = shard.polys;
    if (!labels || !polys) continue;
    for (let i = 0; i < polys.length && i < labels.length; i++) {
      if (labels[i] === labelValue) out.push(polys[i]);
    }
  }
  return out;
}

function filterPolysByPlaneAndBBox(boundaryShards, planeValue, bbox) {
  const { xmin, ymin, xmax, ymax } = bbox;
  const out = [];
  for (const shard of boundaryShards || []) {
    const planes = shard.planeId; // TypedArray per polygon
    const polys = shard.polys;
    if (!planes || !polys) continue;
    const n = Math.min(planes.length, polys.length);
    for (let i = 0; i < n; i++) {
      if (planes[i] !== planeValue) continue;
      const p = polys[i];
      if (!p || !p.xs || !p.ys) continue;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let j = 0; j < p.xs.length; j++) {
        const xi = p.xs[j];
        const yi = p.ys[j];
        if (xi < minX) minX = xi; if (xi > maxX) maxX = xi;
        if (yi < minY) minY = yi; if (yi > maxY) maxY = yi;
      }
      // bbox intersection test (inclusive)
      const intersects = !(maxX < xmin || maxY < ymin || minX > xmax || minY > ymax);
      if (intersects) out.push(p);
    }
  }
  return out;
}

async function main() {
  try {
    // Spots first
    manifestUrl = spotsManifestUrl;
    log(`Loading SPOTS manifest: ${manifestUrl}`);
    const spotsManifest = await loadManifest(manifestUrl);
    log(`Spots shards: ${spotsManifest.shards.length}, total rows: ${spotsManifest.total_rows}`);
    const spotShards = await loadShards(spotsManifest);
    const spotsTotal = spotShards.reduce((a, s) => a + (Number(s.length) || 0), 0);
    log(`Decoded SPOTS: ${spotShards.length} shards, combined rows: ${spotsTotal}`);
    log(`SPOTS rows per shard: [${spotShards.map(s => s.length).join(', ')}]`);
    drawQuickPlot(document.getElementById('plotSpots'), spotShards[0], 3000, '#60a5fa');

    // Cells next (plot centroids X/Y)
    manifestUrl = cellsManifestUrl;
    log(`\nLoading CELLS manifest: ${manifestUrl}`);
    const cellsManifest = await loadManifest(manifestUrl);
    log(`Cells shards: ${cellsManifest.shards.length}, total rows: ${cellsManifest.total_rows}`);
    // Load only first shard for quick demo plot
    const base = new URL(manifestUrl, window.location.href);
    const baseDir = base.href.substring(0, base.href.lastIndexOf('/') + 1);
    const firstCellUrl = new URL(cellsManifest.shards[0].url, baseDir).href;
    const firstCellTable = await fetchShard(firstCellUrl);
    const X = getTypedArrayFromColumn(firstCellTable, 'X');
    const Y = getTypedArrayFromColumn(firstCellTable, 'Y');
    drawQuickPlot(document.getElementById('plotCells'), { x: X, y: Y, length: Math.min(X?.length || 0, Y?.length || 0) }, 3000, '#ef4444');

    // Boundaries last
    manifestUrl = boundariesManifestUrl;
    log(`\nLoading BOUNDARIES manifest: ${manifestUrl}`);
    const boundariesManifest = await loadManifest(manifestUrl);
    log(`Boundaries shards: ${boundariesManifest.shards.length}, total polys: ${boundariesManifest.total_rows}`);
    const boundaryShards = await loadBoundaryShards(boundariesManifest);
    boundaryShardsGlobal = boundaryShards;
    const totalPolys = boundaryShards.reduce((a, s) => a + (Number(s.numPolys) || 0), 0);
    const totalPoints = boundaryShards.reduce((a, s) => a + (Number(s.numPoints) || 0), 0);
    log(`Decoded BOUNDARIES: ${boundaryShards.length} shards, polys: ${totalPolys}, points: ${totalPoints}`);
    if (boundaryShards[0]) {
      drawBoundaries(document.getElementById('plotBoundaries'), boundaryShards[0], 250);
    }

    // Wire up cell boundary plotting
    const btn = document.getElementById('plotCellBtn');
    const input = document.getElementById('cellInput');
    if (btn && input) {
      btn.addEventListener('click', () => {
        const v = Number(input.value);
        if (!Number.isFinite(v)) {
          log('Please enter a valid integer cell_num');
          return;
        }
        const polys = filterPolysByLabel(boundaryShardsGlobal, v);
        log(`Cell ${v}: polygons found = ${polys.length}`);
        drawPolygonsList(document.getElementById('plotCellBoundary'), polys, '#34d399');
      });
    }

    // Wire up bbox + plane plotting
    const bboxBtn = document.getElementById('plotBBoxBtn');
    const planeIn = document.getElementById('planeInput');
    const xminIn = document.getElementById('xminInput');
    const yminIn = document.getElementById('yminInput');
    const xmaxIn = document.getElementById('xmaxInput');
    const ymaxIn = document.getElementById('ymaxInput');
    if (bboxBtn && planeIn && xminIn && yminIn && xmaxIn && ymaxIn) {
      bboxBtn.addEventListener('click', () => {
        const plane = Number(planeIn.value);
        const xmin = Number(xminIn.value);
        const ymin = Number(yminIn.value);
        const xmax = Number(xmaxIn.value);
        const ymax = Number(ymaxIn.value);
        if (![plane, xmin, ymin, xmax, ymax].every(Number.isFinite)) {
          log('Please enter valid numeric values for plane_id and bbox');
          return;
        }
        const bxmin = Math.min(xmin, xmax);
        const bymin = Math.min(ymin, ymax);
        const bxmax = Math.max(xmin, xmax);
        const bymax = Math.max(ymin, ymax);
        const polys = filterPolysByPlaneAndBBox(boundaryShardsGlobal, plane, { xmin: bxmin, ymin: bymin, xmax: bxmax, ymax: bymax });
        log(`BBox plane ${plane}: polygons found = ${polys.length}`);
        drawPolygonsList(document.getElementById('plotBBoxBoundary'), polys, '#f59e0b');
      });
    }
  } catch (err) {
    log(`Error: ${err.message || err}`);
  }
}

main();
