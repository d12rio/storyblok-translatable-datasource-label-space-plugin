import { authHandler, type AuthHandlerParams } from "@storyblok/app-extension-auth";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

// Read lazily so `next build` works without the plugin's secrets.
export function getAuthParams(): AuthHandlerParams {
  return {
    clientId: env("STORYBLOK_PLUGIN_CLIENT_IDENTIFIER"),
    clientSecret: env("STORYBLOK_PLUGIN_CLIENT_SECRET"),
    baseUrl: env("STORYBLOK_PLUGIN_BASE_URL"),
    sessionKey: "auth",
    successCallback: "/",
    errorCallback: "/401",
    endpointPrefix: "/api/connect",
  };
}

let handler: ReturnType<typeof authHandler> | undefined;
export const handleConnect: ReturnType<typeof authHandler> = (req, res) => {
  handler ??= authHandler(getAuthParams());
  return handler(req, res);
};
