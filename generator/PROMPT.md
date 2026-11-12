# Build a Storyblok Space Plugin with Next.js and Vercel's ui-sdk

> **For AI coding agents.** You fetched this prompt to build a **Storyblok Space Plugin**: a full web app that runs inside the Storyblok interface, in the space's sidebar under Apps. Replace the example in **"The app to build"** (at the end) with what the person asked for; everything else applies to any Space Plugin.
>
> Before you write code, reply with a **5-line plan**: what the app does, which Storyblok data it reads and writes, where it stores its own data, the main screens, and what you will test.

A Space Plugin can be any tool a team needs next to its content: audits, bulk editors, dashboards, importers, AI helpers. The repository this prompt lives in is one working example (an editor for datasource translations); copy its patterns when in doubt, not its features.

**What the person needs:**
- Node.js 20+
- A Storyblok account that can register a Space Plugin (Organization or Partner Portal → Extensions)
- A public HTTPS URL for development ([ngrok](https://ngrok.com): `ngrok http 3000`)
- Optional: an Anthropic API key, if the app uses AI

## 1. Scaffold

```bash
npx create-next-app@latest my-space-plugin --ts --eslint --app --src-dir --use-npm --no-tailwind --yes
cd my-space-plugin
npm install @ui-sdk/react @ui-sdk/core @storyblok/app-extension-auth @storyblok/region-helper jsonwebtoken server-only
npm install -D @types/jsonwebtoken
npx skills add vercel-labs/ui --skill ui-sdk
```

- **Leave Tailwind out.** Tailwind's reset (`border: 0` in `@layer base`) overrides ui-sdk's default styles, and ui-sdk injects its own layer at runtime, so the order can't be fixed in CSS. Use plain CSS on top of ui-sdk's `web.css`.
- Before using any ui-sdk component, read `node_modules/@ui-sdk/react/docs/llms.txt`, then only the component pages you need (`docs/components/<name>.md`). Follow the installed `ui-sdk` skill.
- Next.js 16 changed things. Read `node_modules/next/dist/docs/` when an API surprises you. `cookies()`, `headers()` and `searchParams` are async.

## 2. Auth: OAuth with `@storyblok/app-extension-auth`

Storyblok opens the plugin in an iframe at `/?space_id=…&user_id=…`. The auth package runs the OAuth flow and stores the session in a **signed, partitioned cookie** named `${spaceId}:${userId}:auth`.

`src/auth.ts` reads the env vars lazily, so `next build` works without secrets:

```ts
import { authHandler, type AuthHandlerParams } from "@storyblok/app-extension-auth";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}.`);
  return value;
}

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
```

`src/pages/api/connect/[...slugs].ts`: the handler is a Node `(req, res)` listener, so it lives in the **Pages Router**, next to the App Router:

```ts
import { handleConnect } from "@/auth";
export const config = { api: { externalResolver: true } };
export default handleConnect;
```

`src/lib/storyblok/session.ts` reads and verifies the session in server components and server actions:

```ts
import "server-only";
import { isAppSession, type AppSession } from "@storyblok/app-extension-auth";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { getAuthParams } from "@/auth";

export type SessionRef = { spaceId: number; userId: number };

export async function getAppSession({ spaceId, userId }: SessionRef): Promise<AppSession | undefined> {
  const { clientSecret, sessionKey } = getAuthParams();
  const raw = (await cookies()).get(`${spaceId}:${userId}:${sessionKey}`)?.value;
  if (!raw) return;
  try {
    const { data } = jwt.verify(raw, clientSecret) as { data: unknown };
    if (!isAppSession(data) || data.expiresAt < Date.now() + 60_000) return;
    return data;
  } catch {
    return;
  }
}
```

**The page:**
- Wrap everything that reads the session in `<Suspense>`.
- Call `await connection()` from `next/server` before the session check, because it compares the expiry with the current time.
- Without a session, `redirect("/api/connect/storyblok")`.
- Take `space_id` and `user_id` from `await searchParams` only to pick the cookie. Every API call uses `session.spaceId`, so one deployment works in every space it's installed in.

**`src/app/401/page.tsx`:** a client page that runs `if (window.top === window.self) window.location.assign("https://app.storyblok.com/oauth/app_redirect")`. The first consent happens outside the iframe, where the partitioned cookie isn't readable, and this sends the person back into Storyblok to finish.

**`next.config.ts`:**

```ts
allowedDevOrigins: ["*.ngrok.app", "*.ngrok-free.app", "*.ngrok.dev", "*.ngrok-free.dev"],
serverExternalPackages: ["@storyblok/app-extension-auth", "openid-client"],
```

**`.env.example`:** `STORYBLOK_PLUGIN_CLIENT_IDENTIFIER`, `STORYBLOK_PLUGIN_CLIENT_SECRET`, `STORYBLOK_PLUGIN_BASE_URL` (the public HTTPS URL), `STORYBLOK_SPACE_PLUGIN_SLUG` (needed for space-level settings). `.env*` stays gitignored, except `.env.example`.

## 3. The Management API

- Base URL: `getManagementBaseUrl(session.region)` from `@storyblok/region-helper`, then `/v1/spaces/${session.spaceId}/…`.
- Header: `Authorization: Bearer ${session.accessToken}`.
- Do all API work on the server: server components for reads, server actions for writes. **Every server action checks the session first.**
- **Rate limit:** 3 requests per second on Starter plans, 6 on paid ones. Pace bulk writes (about 350 ms apart), retry 429s with growing waits, and show progress.
- **Pagination:** `per_page` up to 1000; keep reading pages until you have the `total` response header's count.
- **Stories** (if the app uses them):
  - List: `GET /stories?per_page=100&page=…` (filters like `text_search`, `with_tag`, `starts_with`, `filter_query`). List results are summaries; load one story's full `content` with `GET /stories/:id`.
  - Update: `PUT /stories/:id` with `{ story: { content, … } }`, plus `publish: 1` only when the person explicitly chose to publish. Never publish as a side effect.
  - Keep the story's `content` shape exactly as you received it, and only change the fields you mean to.
- **Datasources** (if the app uses them):
  - Entries have `name` (key) and `value` (default). **Dimensions** add one `dimension_value` per entry, and an empty one falls back to `value`.
  - Reading one dimension: `GET /datasource_entries?datasource_id=…&dimension=<dimension id>`.
  - Writing: `PUT /datasource_entries/:id` with `{ datasource_entry: { name, value, dimension_value }, dimension_id }`. `dimension_id` sits at the **top level**, and the `PUT` replaces the entry, so always send the default `value` too.
  - Creating: `POST /datasources` with `dimensions_attributes: [{ name, entry_value }]`, then `POST /datasource_entries`.

## 4. Storage: no database

Pick the lightest place that fits each piece of data:

| Data | Where |
| --- | --- |
| Content the app manages (lists, key/value data, per-language text) | A Storyblok **datasource** (with dimensions for languages). Editors also get Storyblok's own UI for it. |
| Per-space configuration (non-sensitive) | **Space-level settings**: enable "Enable settings on space level" on the extension, then `GET /app_provisions`, find yours by `slug === STORYBLOK_SPACE_PLUGIN_SLUG`, read `space_level_settings`, and write it with `PUT /app_provisions/:app_id` and `{ app_provision: { space_level_settings } }`. Normalize on read: unknown or missing fields get defaults. |
| Per-person view preferences | `localStorage`, wrapped in `try/catch`, restored in an effect after hydration |
| Unsaved edits | `sessionStorage`, so a reload or a new sign-in doesn't lose them |
| Secrets | Server env vars only. Never in settings or the browser. |

## 5. UI rules

- **ui-sdk for every control.** Import from each component's entry (`@ui-sdk/react/select`, `/dialog`, `/menu`, `/popover`, `/toast` …). Never hand-roll a `role="listbox"`, `"menu"` or `"dialog"`.
- **CSS:** start `globals.css` with `@layer ui-sdk;` and `@import "@ui-sdk/core/web.css";`, then your own rules. Style state through `data-*` attributes (`[data-selected]`, `[data-open]`).
- **Storyblok look:** set ui-sdk's tokens from Storyblok's design tokens:

  ```css
  :root {
    color-scheme: light;
    --ui-foreground: #1b243f; --ui-muted: #f7f9fc; --ui-muted-foreground: #5f616e;
    --ui-border: #dde3ee; --ui-input: #8b91a7; --ui-primary: #037c7d; --ui-primary-foreground: #fff;
    --ui-destructive: #c11c14; --ui-ring: #c2dedc; --ui-ring-border: #037c7d;
    --ui-radius: 8px; --ui-font-size: 0.875rem;
  }
  body { background: #f6f7f8; }
  ```

  Load Roboto and Roboto Mono with `next/font/google`. Use teal `#037c7d` for primary actions and selected states, with fill **and** text **and** an outline, so state never depends on color alone.
- **Layout:** the iframe is wide (Storyblok's main area). Use a header with a title and the main actions, cards on a light gray background, and sticky table headers.
- **Every state:** loading (a server-rendered `<Suspense>` fallback with an indeterminate `Progress`), empty (offer to set things up, not a dead end), error (a toast with the reason), session expired (a toast with a "Sign in" link to `/api/connect/storyblok`), and rate limited.
- **Name every control** (visible label, or `aria-label` for icon-only buttons). Ask with `confirm()` from `@ui-sdk/react/alert-dialog` before discarding work. `useShortcut("mod+s")` for save.
- **Avoid these:** a class named like a utility (`.grid`); `content-visibility` on table rows (it breaks column widths); fixed heights inside the iframe.

## 6. AI features (optional)

- Run them in server actions that check the Storyblok session first, so only signed-in editors can spend tokens. Read `ANTHROPIC_API_KEY` from env and create the client on first use.
- `@anthropic-ai/sdk` with `client.messages.parse` and `zodOutputFormat(…)` gives JSON that's guaranteed to parse. Use `claude-haiku-5-5` at `effort: "low"` for high-volume text tasks.
- Put large shared context (for example, all entries of a datasource) in the system prompt with `cache_control`, and batch the work (about 40 items per request).
- **AI output is a draft.** Show it, let people edit it, and write to Storyblok only when they save.
- Keep prompts in one module that both the request and an "AI instructions" view use, so editors can see exactly what the model gets. Editable parts (tone of voice, custom prompts) live in space-level settings.

## 7. Register and run it in Storyblok

1. Organization (or Partner Portal) → **Extensions** → New Extension → type **Sidebar**.
2. **OAuth 2.0 and Pages:** Index to your page = `https://<your-url>`; Redirection endpoint = `https://<your-url>/api/connect/callback`. (The callback really is `/api/connect/callback`, whatever older READMEs say.) Copy the Client Identifier and Client Secret into `.env`.
3. **General:** copy the slug into `STORYBLOK_SPACE_PLUGIN_SLUG`. **Details:** enable space-level settings if you use them.
4. Install it into a space with the install link, then open it from the sidebar under Apps. The first consent may bounce once through `/401`; that's expected.

## 8. Done when

- `npm run build`, `npx eslint src` and `npx tsc --noEmit` pass.
- Pure logic (parsing, validation, merging) lives in `src/lib/*.ts` with tests (`npx vitest --run`).
- It was opened inside Storyblok through the tunnel, and the main flow (read, edit, save) was checked against the real space.
- `README.md` explains what the app does, the setup steps, an env var table, and where its data lives.
- The dev server and tunnel are stopped afterwards. Deploy (for example on Vercel) only when asked.

## The app to build

*Replace this example with the person's request.*

**SEO audit.** A Space Plugin that checks every story's SEO fields and lets editors fix them in one place:
- A table of stories (name, path, last updated) with their meta title and meta description. Which content fields hold them is configured in space-level settings (for example `content.seo.title`).
- Checks per story: missing title or description, too long (title over 60, description over 160 characters), duplicates across stories. Show "N issues" per folder.
- Inline editing as drafts, then save the changed stories with `PUT /stories/:id`. Publishing is an explicit, separate choice.
- Optional AI: suggest a title and description from the story's content, as drafts to review.
- Empty state: if the configured fields aren't found in any story, explain how to set them in Settings.

Other ideas the same recipe fits: a redirects manager on a datasource, a broken-link checker, a bulk tag editor, an asset alt-text helper, or a release checklist dashboard.
