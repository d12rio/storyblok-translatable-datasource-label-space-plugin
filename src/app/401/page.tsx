"use client";

import { useEffect } from "react";

// The first OAuth consent happens outside the iframe, where the partitioned cookie
// can't be read. Send the user back into Storyblok so the flow finishes inside it.
export default function Unauthorized() {
  useEffect(() => {
    if (window.top === window.self) window.location.assign("https://app.storyblok.com/oauth/app_redirect");
  }, []);

  return (
    <main className="notice">
      <h1>Couldn&apos;t sign in to Storyblok</h1>
      <p>Open this plugin from the sidebar of your Storyblok space.</p>
    </main>
  );
}
