import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 writes AGENTS.md / CLAUDE.md into the repo root on dev startup.
  // They are generated Next.js boilerplate, not project documentation — the
  // conventions that actually govern this repo live in CONTRIBUTING.md.
  agentRules: false,
};

export default nextConfig;
