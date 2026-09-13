import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@alarab/tools", "@alarab/jobs", "@alarab/ai"],
  serverExternalPackages: ["ioredis", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
