// Builds the installable Agent Skill from generator/PROMPT.md, so the prompt stays the single source.
// Run: node generator/build-skill.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const prompt = readFileSync(join(root, "generator", "PROMPT.md"), "utf8");

// The prompt's intro talks to an agent that fetched it from a URL; a skill is loaded instead.
const body = prompt.replace("You fetched this prompt to build", "Use this skill to build");

const frontmatter = `---
name: storyblok-space-plugin
description: Builds a Storyblok Space Plugin, a full web app inside the Storyblok interface, with Next.js and Vercel's ui-sdk. Covers OAuth with @storyblok/app-extension-auth, the Management API (stories, datasources, rate limits), storage without a database (datasources, space-level settings), a Storyblok look on ui-sdk components, optional AI features, and registering the plugin. Use when someone wants to extend Storyblok with an app, tool, dashboard or editor beyond a field plugin.
---

`;

const dir = join(root, "skills", "storyblok-space-plugin");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "SKILL.md"), frontmatter + body);
console.log("wrote skills/storyblok-space-plugin/SKILL.md");
