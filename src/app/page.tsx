import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadingLabels } from "@/components/loading-labels";
import { signInUrl } from "@/lib/storyblok/urls";
import { bulkSave, review, saveChange, saveSpaceSettings, setUpGlossary, setUpLabels, translate } from "@/app/actions";
import { SetupLabels } from "@/components/setup-labels";
import { LabelEditor } from "@/components/label-editor";
import { listDatasources, loadGlossary, loadLabelRows, loadSettings } from "@/lib/storyblok/mapi";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { getAppSession } from "@/lib/storyblok/session";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<LoadingLabels />}>
      <Editor searchParams={searchParams} />
    </Suspense>
  );
}

async function Editor({ searchParams }: { searchParams: SearchParams }) {
  // The session check compares the token expiry with the current time, so it only runs at request time.
  await connection();
  const params = await searchParams;
  const spaceId = Number(params.space_id);
  const userId = Number(params.user_id);

  const session = spaceId && userId ? await getAppSession({ spaceId, userId }) : undefined;
  if (!session) redirect(signInUrl);

  const [all, settingsResult] = await Promise.all([
    listDatasources(session),
    loadSettings(session).then(
      (settings) => ({ settings, error: null }),
      (error: unknown) => ({ settings: DEFAULT_SETTINGS, error: error instanceof Error ? error.message : String(error) }),
    ),
  ]);
  const { settings } = settingsResult;
  const allDatasources = all.filter((d) => d.dimensions.length > 0);
  const chosen = allDatasources.filter((d) => settings.datasources.includes(d.slug));
  const datasources = chosen.length ? chosen : allDatasources;
  const datasource =
    datasources.find((d) => d.slug === params.datasource) ??
    datasources.find((d) => d.slug === "labels") ??
    datasources[0];

  if (!datasource) {
    return (
      <SetupLabels session={{ spaceId, userId }} sourceLanguage={settings.sourceLanguage.name} onSetUp={setUpLabels} />
    );
  }

  const [rows, glossary] = await Promise.all([loadLabelRows(session, datasource), loadGlossary(session, all)]);

  return (
    <LabelEditor
      key={datasource.id}
      session={{ spaceId, userId }}
      onSave={saveChange}
      onBulkSave={bulkSave}
      onTranslate={translate}
      onReview={review}
      onSetUpGlossary={setUpGlossary}
      onSaveSettings={saveSpaceSettings}
      glossary={glossary}
      settings={settings}
      settingsError={settingsResult.error}
      allDatasources={allDatasources}
      datasources={datasources}
      datasource={datasource}
      initialRows={rows}
    />
  );
}
