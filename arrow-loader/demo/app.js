import { initArrow, loadBoundariesPlane } from '../lib/arrow-loaders.js';

const out = (msg) => { const el = document.getElementById('out'); el.textContent += msg + '\n'; };

function drawBinary(canvas, buffers) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0b0b0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!buffers) return;
  const { positions, startIndices, length } = buffers;
  if (!positions || !startIndices) return;
  // Compute bounds
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for (let i=0;i<positions.length;i+=2){ const x=positions[i], y=positions[i+1]; if (x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
  const pad=10, availW=canvas.width-2*pad, availH=canvas.height-2*pad;
  const dataW=Math.max(1e-6,maxX-minX), dataH=Math.max(1e-6,maxY-minY);
  const scale=Math.min(availW/dataW, availH/dataH);
  const offX = pad + (availW - dataW*scale)/2;
  const offY = pad + (availH - dataH*scale)/2;
  ctx.strokeStyle = '#22d3ee'; ctx.lineWidth=1;
  for (let p=0;p<length;p++){
    const start = startIndices[p]; const end = startIndices[p+1];
    if (end-start < 2) continue;
    ctx.beginPath();
    for (let i=start;i<end;i++){
      const x = offX + (positions[2*i]-minX)*scale;
      const y = offY + (positions[2*i+1]-minY)*scale;
      if (i===start) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath(); ctx.stroke();
  }
}

// Configure with your manifests
const cfg = {
  spotsManifest: '../../data/arrow_spots/manifest.json',
  cellsManifest: '../../data/arrow_cells/manifest.json',
  boundariesManifest: '../../data/arrow_boundaries/manifest.json',
  cellsClassDict: '../../data/arrow_cells/class_dict.json'
};

initArrow(cfg);

document.getElementById('load').addEventListener('click', async () => {
  try {
    const plane = Number(document.getElementById('plane').value);
    out(`Loading boundaries for plane ${plane}...`);
    const { planeId, buffers } = await loadBoundariesPlane(plane);
    out(`Loaded plane ${planeId}: polys=${buffers.length}, points=${buffers.positions.length/2}`);
    drawBinary(document.getElementById('plot'), buffers);
  } catch (err) {
    out(`Error: ${err.message || err}`);
  }
});

