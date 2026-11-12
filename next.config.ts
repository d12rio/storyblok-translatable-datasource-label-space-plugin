import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Storyblok loads the plugin from a public HTTPS URL, so local dev runs through a tunnel.
  allowedDevOrigins: ["*.ngrok.app", "*.ngrok-free.app", "*.ngrok.dev", "*.ngrok-free.dev"],
  serverExternalPackages: ["@storyblok/app-extension-auth", "openid-client"],
};

export default nextConfig;
