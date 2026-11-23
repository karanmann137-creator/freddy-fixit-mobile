// Picker asset → compress → Storage → scan. Step 1.5, PLAN.md §2.2.
// Same order as the web call sites (e.g. MilestonePanel.complete):
//   compressImage → storage.upload → scanImage → shouldBlock
// The scan runs on the object AFTER upload (that's how the scan-image edge
// function works), and a blocked image returns the shared reject wording.
//
// Never throws: callers get { ok: false, message } with words fit to show the
// person. A cancelled picker is the caller's job (`if (!asset) return`).
import { File } from "expo-file-system";
import { supabase } from "@/lib/supabase";
import { compressImage, type CompressProfile, type UploadAsset } from "@/lib/imageCompress";
import { rejectMessage, scanImage, shouldBlock } from "@/lib/imageSafety";

export type UploadResult = { ok: true; path: string } | { ok: false; message: string };

function extOf(a: UploadAsset): string {
  const fromName = (a.fileName || "").split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5 && fromName !== a.fileName?.toLowerCase()) return fromName;
  const t = (a.mimeType || "").split("/")[1];
  return t === "jpeg" ? "jpg" : t || "jpg";
}

/**
 * @param bucket   Storage bucket (e.g. "completion-photos", "contractor-docs")
 * @param basePath path WITHOUT extension; the extension follows the compressed file
 * @param evidence true for job evidence (before/after, milestones, disputes): only
 *                 sexual/hate block, same as web `shouldBlock(scan, { evidence: true })`
 */
export async function uploadImage(opts: {
  bucket: string; basePath: string; asset: UploadAsset; profile?: CompressProfile; evidence?: boolean;
}): Promise<UploadResult> {
  try {
    const small = await compressImage(opts.asset, opts.profile ?? "photo");
    const path = `${opts.basePath}.${extOf(small)}`;
    const body = await new File(small.uri).arrayBuffer();
    const { error } = await supabase.storage.from(opts.bucket).upload(path, body, {
      contentType: small.mimeType || undefined,
    });
    if (error) return { ok: false, message: "Couldn't upload that photo. Check your connection and try again." };
    const scan = await scanImage(opts.bucket, path); // never throws; "unknown" on any problem
    if (shouldBlock(scan, { evidence: !!opts.evidence })) return { ok: false, message: rejectMessage(scan) };
    return { ok: true, path };
  } catch {
    return { ok: false, message: "Couldn't read that photo. Try choosing it again." };
  }
}
