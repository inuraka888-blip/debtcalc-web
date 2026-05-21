export function shouldUseNormalizedCloudEvents(): boolean {
  return process.env.NEXT_PUBLIC_USE_NORMALIZED_CLOUD_EVENTS === "true";
}
