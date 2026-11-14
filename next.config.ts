import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  turbopack: {
    root: __dirname,
  },
};

export default withWorkflow(nextConfig);
