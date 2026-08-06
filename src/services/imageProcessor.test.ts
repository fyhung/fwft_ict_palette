import { describe, expect, it } from "vitest";
import {
  calculateTargetSize,
  isSupportedImageType,
  SOURCE_IMAGE_LIMIT,
} from "./imageProcessor";

describe("image processing guards", () => {
  it("accepts only the MVP image formats", () => {
    expect(isSupportedImageType("image/jpeg")).toBe(true);
    expect(isSupportedImageType("image/webp")).toBe(true);
    expect(isSupportedImageType("image/heic")).toBe(false);
    expect(isSupportedImageType("application/pdf")).toBe(false);
  });

  it("preserves aspect ratio while shrinking a landscape image", () => {
    expect(calculateTargetSize(4032, 3024, 1920)).toEqual({ width: 1920, height: 1440 });
  });

  it("does not enlarge a small source image", () => {
    expect(calculateTargetSize(800, 600, 1920)).toEqual({ width: 800, height: 600 });
  });

  it("keeps the documented source limit at 10 MiB", () => {
    expect(SOURCE_IMAGE_LIMIT).toBe(10 * 1024 * 1024);
  });
});
