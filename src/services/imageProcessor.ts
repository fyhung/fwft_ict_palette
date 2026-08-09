export const SOURCE_IMAGE_LIMIT = 10 * 1024 * 1024;
export const MAIN_IMAGE_LIMIT = 1.5 * 1024 * 1024;
export const THUMB_IMAGE_LIMIT = 300 * 1024;
export const MAIN_LONGEST_EDGE = 1600;
export const THUMB_LONGEST_EDGE = 480;
export const MAIN_WEBP_QUALITY = 0.78;
export const THUMB_WEBP_QUALITY = 0.68;
export const REUSABLE_SOURCE_LIMIT = 1.2 * 1024 * 1024;
export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface ProcessedImage {
  main: Blob;
  thumbnail: Blob;
  sourceBytes: number;
  width: number;
  height: number;
}

export function isSupportedImageType(type: string) {
  return SUPPORTED_IMAGE_TYPES.includes(type as (typeof SUPPORTED_IMAGE_TYPES)[number]);
}

export function calculateTargetSize(width: number, height: number, longestEdge: number) {
  if (width <= longestEdge && height <= longestEdge) return { width, height };
  const scale = longestEdge / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function canReuseSourceImage(type: string, size: number, width: number, height: number) {
  return (type === "image/jpeg" || type === "image/webp")
    && size <= REUSABLE_SOURCE_LIMIT
    && Math.max(width, height) <= MAIN_LONGEST_EDGE;
}

async function loadImage(file: File) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("IMAGE_CANVAS_UNAVAILABLE");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("IMAGE_ENCODE_FAILED"))),
      "image/webp",
      quality,
    );
  });
}

export async function processImage(file: File): Promise<ProcessedImage> {
  if (!isSupportedImageType(file.type)) throw new Error("IMAGE_TYPE_UNSUPPORTED");
  if (file.size > SOURCE_IMAGE_LIMIT) throw new Error("IMAGE_SOURCE_TOO_LARGE");

  const image = await loadImage(file);
  const sourceWidth = "naturalWidth" in image ? image.naturalWidth : image.width;
  const sourceHeight = "naturalHeight" in image ? image.naturalHeight : image.height;
  const mainSize = calculateTargetSize(sourceWidth, sourceHeight, MAIN_LONGEST_EDGE);
  const thumbSize = calculateTargetSize(sourceWidth, sourceHeight, THUMB_LONGEST_EDGE);
  const reuseSource = canReuseSourceImage(file.type, file.size, sourceWidth, sourceHeight);
  const [main, thumbnail] = await Promise.all([
    reuseSource
      ? Promise.resolve(file as Blob)
      : renderBlob(image, mainSize.width, mainSize.height, MAIN_WEBP_QUALITY),
    renderBlob(image, thumbSize.width, thumbSize.height, THUMB_WEBP_QUALITY),
  ]);

  if ("close" in image && typeof image.close === "function") image.close();
  if (main.size > MAIN_IMAGE_LIMIT) throw new Error("IMAGE_MAIN_TOO_LARGE");
  if (thumbnail.size > THUMB_IMAGE_LIMIT) throw new Error("IMAGE_THUMB_TOO_LARGE");

  return {
    main,
    thumbnail,
    sourceBytes: file.size,
    width: mainSize.width,
    height: mainSize.height,
  };
}
