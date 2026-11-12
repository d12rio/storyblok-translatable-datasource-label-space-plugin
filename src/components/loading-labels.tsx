import { Progress, ProgressIndicator, ProgressLabel, ProgressTrack } from "@ui-sdk/react/progress";

const GHOST_ROWS = ["w-60", "w-40", "w-75", "w-50", "w-65", "w-45", "w-70"];

// Shown while the server loads every language of the datasource. Rendered on the server,
// so it appears instantly as part of the static shell.
export function LoadingLabels() {
  return (
    <main className="loading">
      <div className="loading-ghost" aria-hidden="true">
        {GHOST_ROWS.map((width, i) => (
          <div key={i} className="ghost-row">
            <span className="ghost-key" />
            <span className={`ghost-cell ${width}`} />
            <span className="ghost-cell" />
            <span className="ghost-cell" />
          </div>
        ))}
      </div>
      <div className="loading-center">
        <Progress value={null} className="loading-progress">
          <ProgressLabel>Loading labels from Storyblok</ProgressLabel>
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
        <p>Fetching every language of the datasource…</p>
      </div>
    </main>
  );
}
