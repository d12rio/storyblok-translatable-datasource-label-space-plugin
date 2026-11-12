"use client";

import { Button } from "@ui-sdk/react/button";
import { Checkbox, CheckboxGroup, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@ui-sdk/react/dialog";
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import { NumberInput, NumberInputControl, NumberInputGroup } from "@ui-sdk/react/number-input";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { Textarea } from "@ui-sdk/react/textarea";
import { toast } from "@ui-sdk/react/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActionError } from "@/app/actions";
import { DEFAULT_PROMPTS, PROMPT_VARIABLES, type PromptKind } from "@/lib/prompts";
import { normalizeSettings, type PluginSettings } from "@/lib/settings";
import type { Datasource, Dimension } from "@/lib/storyblok/types";

type Props = {
  settings: PluginSettings;
  // Why settings couldn't be loaded, if they couldn't. The dialog then explains instead of saving.
  error: string | null;
  dimensions: Dimension[];
  datasources: Datasource[];
  onSave: (settings: PluginSettings) => Promise<{ ok: true } | ActionError>;
};

export function SettingsDialog({ settings, error, dimensions, datasources, onSave }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(settings);

  const update = (patch: Partial<PluginSettings>) => setDraft((d) => ({ ...d, ...patch }));
  const promptValue = (kind: PromptKind) => draft.prompts[kind] || DEFAULT_PROMPTS[kind];
  const setPrompt = (kind: PromptKind, value: string) =>
    // A prompt equal to the default is stored empty, so the space follows future default improvements.
    update({ prompts: { ...draft.prompts, [kind]: value.trim() === DEFAULT_PROMPTS[kind].trim() ? "" : value } });

  async function save() {
    const result = await onSave(normalizeSettings(draft));
    if (!result.ok) {
      toast.error("Couldn't save the settings", { description: result.error });
      return;
    }
    toast.success("Settings saved", { description: "They apply to everyone using the plugin in this space." });
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(settings);
        setOpen(next);
      }}
    >
      <DialogTrigger className="settings-trigger">Settings</DialogTrigger>
      <DialogBackdrop />
      <DialogContent className="settings-dialog">
        <DialogTitle>Plugin settings</DialogTitle>
        <DialogDescription>
          Saved per space in Storyblok, for everyone who uses this plugin here. Don&apos;t put secrets in them.
        </DialogDescription>

        {error && <p className="settings-error">Settings couldn&apos;t be loaded: {error}</p>}

        <Tabs defaultValue="voice">
          <TabsList aria-label="Settings sections">
            <TabsTab value="voice">Tone of voice</TabsTab>
            <TabsTab value="prompts">Agent prompt</TabsTab>
            <TabsTab value="language">Source language</TabsTab>
            <TabsTab value="checks">Guardrails</TabsTab>
            <TabsTab value="datasources">Datasources</TabsTab>
          </TabsList>

          <TabsPanel value="voice">
            <Field>
              <FieldLabel>For every language</FieldLabel>
              <Textarea
                autoResize
                value={draft.voice.general}
                onValueChange={(general) => update({ voice: { ...draft.voice, general } })}
                placeholder="Friendly and direct. Short sentences. No exclamation marks."
              />
            </Field>
            {dimensions.map((d) => (
              <Field key={d.id}>
                <FieldLabel>{d.name}</FieldLabel>
                <Textarea
                  autoResize
                  value={draft.voice.byLanguage[d.entry_value] ?? ""}
                  onValueChange={(v) =>
                    update({ voice: { ...draft.voice, byLanguage: { ...draft.voice.byLanguage, [d.entry_value]: v } } })
                  }
                  placeholder={d.entry_value === "de" ? "Use informal “du”." : `Rules only for ${d.name}`}
                />
              </Field>
            ))}
          </TabsPanel>

          <TabsPanel value="prompts">
            {(["translate", "review"] as const).map((kind) => (
              <Field key={kind}>
                <FieldLabel>{kind === "translate" ? "Translation agent prompt" : "Review agent prompt"}</FieldLabel>
                <Textarea
                  autoResize
                  className="prompt-editor"
                  value={promptValue(kind)}
                  onValueChange={(v) => setPrompt(kind, v)}
                />
                <FieldDescription>
                  {draft.prompts[kind] ? "Custom prompt. " : "Built-in default. "}
                  Variables: {PROMPT_VARIABLES.join(", ")}. The tone of voice and glossary are always added after it.
                </FieldDescription>
                {draft.prompts[kind] && (
                  <Button className="link-button" onClick={() => setPrompt(kind, DEFAULT_PROMPTS[kind])}>
                    Reset to default
                  </Button>
                )}
              </Field>
            ))}
          </TabsPanel>

          <TabsPanel value="language">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input
                value={draft.sourceLanguage.name}
                onValueChange={(name) => update({ sourceLanguage: { ...draft.sourceLanguage, name } })}
              />
              <FieldDescription>The language of each entry&apos;s default value.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Code</FieldLabel>
              <Input
                value={draft.sourceLanguage.code}
                onValueChange={(code) => update({ sourceLanguage: { ...draft.sourceLanguage, code } })}
              />
            </Field>
          </TabsPanel>

          <TabsPanel value="checks">
            <Field>
              <FieldLabel>Flag translations longer than the source by a factor of</FieldLabel>
              <NumberInput
                value={draft.maxLengthRatio}
                min={1}
                max={5}
                step={0.1}
                onValueChange={(v) => v !== null && update({ maxLengthRatio: v })}
              >
                <NumberInputGroup>
                  <NumberInputControl />
                </NumberInputGroup>
              </NumberInput>
              <FieldDescription>1.6 means 60% longer. Short labels (up to 10 extra characters) are never flagged.</FieldDescription>
            </Field>
          </TabsPanel>

          <TabsPanel value="datasources">
            <Field>
              <FieldLabel>Show these datasources</FieldLabel>
              <CheckboxGroup value={draft.datasources} onValueChange={(datasources) => update({ datasources })}>
                {datasources.map((d) => (
                  <label key={d.id} className="checkbox-row">
                    <Checkbox value={d.slug}>
                      <CheckboxIndicator />
                    </Checkbox>
                    {d.name}
                  </label>
                ))}
              </CheckboxGroup>
              <FieldDescription>Leave all unchecked to show every datasource with dimensions.</FieldDescription>
            </Field>
          </TabsPanel>
        </Tabs>

        <div className="dialog-actions">
          <DialogClose>Cancel</DialogClose>
          <Button data-variant="solid" onClick={save} disabled={!!error} pendingAnnouncement="Saving settings">
            Save settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
