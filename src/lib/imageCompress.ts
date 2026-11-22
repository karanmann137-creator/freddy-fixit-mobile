// NATIVE OVERRIDE of web src/lib/imageCompress.ts. PLAN.md §2.2.
//
// Same contract as web: shrink + re-encode to WebP before upload, and ALWAYS
// resolve. On any problem it resolves with the asset you passed in, so a failed
// compress can never block an upload.
//
// One deliberate API difference: React Native has no browser `File`, so this
// takes and returns a picker-style asset `{ uri, mimeType, fileName }` instead.
// No synced file imports compressImage (web docPhotos.ts is web-only), so the
// signature change breaks nothing. The size/quality numbers are NOT copied by
// hand: they're generated from the web file by `npm run sync`.
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { PROFILES, type CompressProfile } from "@/lib/imageProfiles.generated";

export type { CompressProfile };
export type UploadAsset = { uri: string; mimeType?: string | null; fileName?: string | null; width?: number; height?: number };

/** Extensions we'll attempt even when the picker reports an empty MIME type (HEIC does this). */
const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "heif", "bmp", "tif", "tiff", "avif"];

function extOf(name?: string | null): string {
  const parts = (name || "").split("?")[0].split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

function looksCompressible(a: UploadAsset): boolean {
  const t = (a.mimeType || "").toLowerCase();
  const ext = extOf(a.fileName) || extOf(a.uri);
  if (t.startsWith("video/") || t === "application/pdf" || t === "image/gif") return false;
  if (ext === "pdf" || ext === "gif") return false; // a GIF would lose its animation
  if (t.startsWith("image/")) return true;
  return IMAGE_EXTS.includes(ext);
}

function sizeOf(uri: string): number | null {
  try { const n = new File(uri).size; return typeof n === "number" && n > 0 ? n : null; } catch { return null; }
}

export async function compressImage(asset: UploadAsset, profile: CompressProfile = "photo"): Promise<UploadAsset> {
  try {
    if (!asset?.uri || !looksCompressible(asset)) return asset;
    const { maxDim, quality } = PROFILES[profile] ?? PROFILES.photo;

    const ctx = ImageManipulator.manipulate(asset.uri);
    const w0 = asset.width ?? 0, h0 = asset.height ?? 0;
    // Resize only when we know it's too big (never upscale); resizing one edge keeps aspect ratio.
    if (w0 && h0 && Math.max(w0, h0) > maxDim) {
      ctx.resize(w0 >= h0 ? { width: maxDim } : { height: maxDim });
    }
    let ref = await ctx.renderAsync();
    // Picker didn't report a size: now we know it, so cap it in a second pass.
    if ((!w0 || !h0) && Math.max(ref.width, ref.height) > maxDim) {
      ref = await ImageManipulator.manipulate(ref)
        .resize(ref.width >= ref.height ? { width: maxDim } : { height: maxDim })
        .renderAsync();
    }
    const out = await ref.saveAsync({ format: SaveFormat.WEBP, compress: quality });

    // Same guard as web: if re-encoding made it bigger, keep the original.
    const before = sizeOf(asset.uri), after = sizeOf(out.uri);
    if (before && after && after >= before) return asset;

    const base = (asset.fileName || "upload").replace(/\.[^.]+$/, "");
    return { uri: out.uri, mimeType: "image/webp", fileName: base + ".webp", width: out.width, height: out.height };
  } catch {
    return asset;
  }
}
