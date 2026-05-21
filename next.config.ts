import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig = (phase: string): NextConfig => ({
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
});

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default function config(phase: string) {
  return withNextIntl(nextConfig(phase));
}
