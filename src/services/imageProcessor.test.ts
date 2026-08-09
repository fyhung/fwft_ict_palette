import { describe, expect, it } from "vitest";
import {
  calculateTargetSize,
  canReuseSourceImage,
  MAIN_LONGEST_EDGE,
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

  it("uses the 1600px classroom display target", () => {
    expect(MAIN_LONGEST_EDGE).toBe(1600);
    expect(calculateTargetSize(4032, 3024, MAIN_LONGEST_EDGE)).toEqual({ width: 1600, height: 1200 });
  });

  it("reuses only already-small JPEG or WebP source images", () => {
    expect(canReuseSourceImage("image/jpeg", 500_000, 1200, 900)).toBe(true);
    expect(canReuseSourceImage("image/webp", 500_000, 1600, 1200)).toBe(true);
    expect(canReuseSourceImage("image/png", 500_000, 1200, 900)).toBe(false);
    expect(canReuseSourceImage("image/jpeg", 500_000, 2000, 1500)).toBe(false);
    expect(canReuseSourceImage("image/jpeg", 1.3 * 1024 * 1024, 1200, 900)).toBe(false);
  });
});
