// GENERATED from freddy-fixit@09b0a25:src/lib/imageCompress.ts. DO NOT EDIT.
export type CompressProfile = "photo" | "avatar" | "document";
export const PROFILES: Record<CompressProfile, { maxDim: number; quality: number }> = {
  photo: { maxDim: 1600, quality: 0.82 },
  avatar: { maxDim: 640, quality: 0.85 },
  document: { maxDim: 2400, quality: 0.92 },
};
