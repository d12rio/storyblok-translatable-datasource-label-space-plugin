"use client";

import { Button } from "@ui-sdk/react/button";
import { Checkbox, CheckboxGroup, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import { Toast, ToastClose, ToastDescription, ToastRegion, ToastTitle, toast } from "@ui-sdk/react/toast";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { setUpLabels } from "@/app/actions";
import type { SessionRef } from "@/lib/storyblok/session";
import { COMMON_LANGUAGES, STARTER_LABELS } from "@/lib/starter";

type Props = { session: SessionRef; sourceLanguage: string; onSetUp: typeof setUpLabels };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function SetupLabels({ session, sourceLanguage, onSetUp }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("Labels");
  const [slug, setSlug] = useState("labels");
  const [slugTouched, setSlugTouched] = useState(false);
  const [languages, setLanguages] = useState<string[]>(["de", "fr"]);
  const [starter, setStarter] = useState(true);

  async function create() {
    const result = await onSetUp(session, {
      name,
      slug,
      languages: COMMON_LANGUAGES.filter((l) => languages.includes(l.code)),
      withStarterLabels: starter,
    });
    if (!result.ok) {
      toast.error("Couldn't create the datasource", { description: result.error });
      return;
    }
    toast.success(`Created “${name}”`, { description: "Use “AI → Translate missing” on each language to fill it." });
    const next = new URLSearchParams(searchParams?.toString());
    next.set("datasource", result.slug);
    router.push(`?${next}`);
    router.refresh();
  }

  return (
    <main className="setup">
      <div className="setup-card card">
        <h1>Set up your labels</h1>
        <p>
          This space has no datasource with languages yet. Labels are the small texts of a website, like buttons, form
          errors and screen reader texts. They live in a <strong>datasource</strong>: each entry has a key and a default
          text in {sourceLanguage}, and each <strong>dimension</strong> adds one more language.
        </p>

        <Field>
          <FieldLabel>Datasource name</FieldLabel>
          <Input
            value={name}
            onValueChange={(v) => {
              setName(v);
              if (!slugTouched) setSlug(slugify(v));
            }}
          />
        </Field>
        <Field>
          <FieldLabel>Slug</FieldLabel>
          <Input
            value={slug}
            onValueChange={(v) => {
              setSlugTouched(true);
              setSlug(v);
            }}
          />
          <FieldDescription>Your frontend loads the labels with ?datasource={slug || "…"}.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Languages to translate into</FieldLabel>
          <CheckboxGroup className="language-grid" value={languages} onValueChange={setLanguages}>
            {COMMON_LANGUAGES.map((l) => (
              <label key={l.code} className="checkbox-row">
                <Checkbox value={l.code}>
                  <CheckboxIndicator />
                </Checkbox>
                {l.name} <span className="language-code">{l.code}</span>
              </label>
            ))}
          </CheckboxGroup>
          <FieldDescription>
            Each one becomes a dimension. You can add more later in the datasource&apos;s Dimensions tab.
          </FieldDescription>
        </Field>

        <label className="checkbox-row">
          <Checkbox checked={starter} onCheckedChange={(v) => setStarter(v === true)}>
            <CheckboxIndicator />
          </Checkbox>
          Add {STARTER_LABELS.length} starter labels (navigation, forms, search, pagination, cookie banner)
        </label>

        <Button
          data-variant="solid"
          className="setup-create"
          onClick={create}
          disabled={!name.trim() || !slug.trim() || !languages.length}
          pendingAnnouncement="Creating the datasource"
        >
          Create datasource
        </Button>
      </div>

      <ToastRegion>
        {() => (
          <Toast>
            <ToastTitle />
            <ToastDescription />
            <ToastClose aria-label="Dismiss" />
          </Toast>
        )}
      </ToastRegion>
    </main>
  );
}
