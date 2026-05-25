// Downscale a picked image File to <=maxEdge px on its longest side and
// return a base64 data URL (JPEG, q=0.85). Originally extracted from
// GenerateRecipeSheet.tsx so both recipe cover photos and profile avatars
// can reuse the same path. Data URLs let us keep everything in Dexie
// without standing up object storage.

export async function downscaleToDataUrl(file: File, maxEdge: number): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { width, height } = scaleTo(img.naturalWidth, img.naturalHeight, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas context');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

export function scaleTo(w: number, h: number, maxEdge: number): { width: number; height: number } {
  if (w <= maxEdge && h <= maxEdge) return { width: w, height: h };
  if (w >= h) {
    return { width: maxEdge, height: Math.round((h * maxEdge) / w) };
  }
  return { width: Math.round((w * maxEdge) / h), height: maxEdge };
}
