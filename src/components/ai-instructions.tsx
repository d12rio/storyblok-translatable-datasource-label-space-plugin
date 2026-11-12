"use client";

import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@ui-sdk/react/dialog";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { glossaryFor, type Glossary } from "@/lib/checks";
import { buildInstructions } from "@/lib/prompts";
import type { PluginSettings } from "@/lib/settings";
import type { Dimension } from "@/lib/storyblok/types";

type Props = { dimensions: Dimension[]; glossary: Glossary | null; settings: PluginSettings; labelCount: number };

export function AiInstructions({ dimensions, glossary, settings, labelCount }: Props) {
  return (
    <Dialog>
      <DialogTrigger className="ai-instructions-trigger">AI instructions</DialogTrigger>
      <DialogBackdrop />
      <DialogContent className="ai-instructions">
        <DialogTitle>AI instructions</DialogTitle>
        <DialogDescription>
          The exact system prompts Claude Haiku gets for each language: the prompt and tone of voice from Settings, plus
          the glossary. Every request also includes all {labelCount} labels of this datasource (key,{" "}
          {settings.sourceLanguage.name} and the current translation) as context.
        </DialogDescription>
        <Tabs defaultValue={String(dimensions[0]?.id)}>
          <TabsList aria-label="Language">
            {dimensions.map((d) => (
              <TabsTab key={d.id} value={String(d.id)}>
                {d.name}
              </TabsTab>
            ))}
          </TabsList>
          {dimensions.map((d) => {
            const language = { name: d.name, code: d.entry_value };
            const terms = glossaryFor(glossary, d.entry_value);
            return (
              <TabsPanel key={d.id} value={String(d.id)}>
                <h3>Translate</h3>
                <pre>{buildInstructions("translate", settings, language, terms)}</pre>
                <h3>Review</h3>
                <pre>{buildInstructions("review", settings, language, terms)}</pre>
              </TabsPanel>
            );
          })}
        </Tabs>
        <DialogClose className="ai-instructions-close">Close</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
