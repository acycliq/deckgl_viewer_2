/**
 * Sample Dataset Generator (copied from test-dataset.js)
 */

function generateTestDataset() {
  const bounds = { left: 0, right: 1000, top: 0, bottom: 800, depth: 120, note: "Coordinates in pixel space" };
  const geneNames = ["ACTB", "GAPDH", "CD68", "KRT19", "DAPI", "PECAM1", "VIM", "PTPRC"];
  const numPlanes = 6;
  const spotsPerPlane = 25;
  const spots = [];
  for (let planeId = 0; planeId < numPlanes; planeId++) {
    const spotsInThisPlane = spotsPerPlane + Math.floor((Math.random() - 0.5) * 10);
    for (let i = 0; i < spotsInThisPlane; i++) {
      const x = Math.random() * (bounds.right - bounds.left) + bounds.left;
      const y = Math.random() * (bounds.bottom - bounds.top) + bounds.top;
      const z = (planeId / (numPlanes - 1)) * bounds.depth + (Math.random() - 0.5) * 8;
      const gene = geneNames[Math.floor(Math.random() * geneNames.length)];
      const hasParentCell = Math.random() > 0.3;
      const parent_cell_id = hasParentCell ? Math.floor(Math.random() * 50) + 1 : null;
      const parent_cell_X = hasParentCell ? x + (Math.random() - 0.5) * 20 : null;
      const parent_cell_Y = hasParentCell ? y + (Math.random() - 0.5) * 20 : null;
      const parent_cell_Z = hasParentCell ? z + (Math.random() - 0.5) * 5 : null;
      spots.push({ gene, x, y, z, plane_id: planeId, spot_id: `plane${planeId}_spot_${i.toString().padStart(3, '0')}`, parent_cell_id, parent_cell_X, parent_cell_Y, parent_cell_Z });
    }
  }
  const uniqueCells = 12;
  const cells = [];
  for (let cellId = 1; cellId <= uniqueCells; cellId++) {
    const baseCenterX = Math.random() * (bounds.right - bounds.left) + bounds.left;
    const baseCenterY = Math.random() * (bounds.bottom - bounds.top) + bounds.top;
    const baseRadius = 60 + Math.random() * 80;
    const planesForThisCell = Math.floor(Math.random() * 4) + 2;
    const startPlane = Math.floor(Math.random() * (numPlanes - planesForThisCell));
    for (let p = 0; p < planesForThisCell; p++) {
      const plane = startPlane + p;
      const centerX = baseCenterX + (Math.random() - 0.5) * 10;
      const centerY = baseCenterY + (Math.random() - 0.5) * 10;
      const radius = baseRadius * (0.8 + Math.random() * 0.4);
      const numVertices = 6 + Math.floor(Math.random() * 6);
      const originalBoundary = [];
      const clippedBoundary = [];
      for (let j = 0; j < numVertices; j++) {
        const angle = (j / numVertices) * 2 * Math.PI;
        const r = radius * (0.7 + Math.random() * 0.6);
        const x = centerX + r * Math.cos(angle);
        const y = centerY + r * Math.sin(angle);
        originalBoundary.push([x, y]);
        const clippedX = Math.max(bounds.left, Math.min(bounds.right, x));
        const clippedY = Math.max(bounds.top, Math.min(bounds.bottom, y));
        clippedBoundary.push([clippedX, clippedY]);
      }
      originalBoundary.push(originalBoundary[0]);
      clippedBoundary.push(clippedBoundary[0]);
      cells.push({ intersects: true, clippedBoundary, originalBoundary, cellId, plane });
    }
  }
  return { bounds, spots: { count: spots.length, data: spots }, cells: { count: cells.length, note: "Clipped cell boundaries that intersect with selection", data: cells } };
}

if (typeof window !== 'undefined') {
  window.generateTestDataset = generateTestDataset;
}

