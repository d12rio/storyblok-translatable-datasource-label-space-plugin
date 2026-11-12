// What the setup screen offers when a space has no datasource with dimensions yet.

export const COMMON_LANGUAGES = [
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "pt", name: "Portuguese" },
  { code: "pl", name: "Polish" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "fi", name: "Finnish" },
  { code: "cs", name: "Czech" },
  { code: "tr", name: "Turkish" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ar", name: "Arabic" },
];

export const STARTER_LABELS: [key: string, value: string][] = [
  ["a11y.skip_to_main_content", "Skip to main content"],
  ["a11y.opens_in_new_window", "(opens in a new window)"],
  ["nav.home", "Home"],
  ["nav.menu_open", "Open menu"],
  ["nav.menu_close", "Close menu"],
  ["nav.back", "Back"],
  ["common.loading", "Loading…"],
  ["common.read_more", "Read more"],
  ["common.show_more", "Show more"],
  ["common.show_less", "Show less"],
  ["common.close", "Close"],
  ["common.cancel", "Cancel"],
  ["common.save", "Save"],
  ["common.error", "Something went wrong. Please try again."],
  ["search.label", "Search"],
  ["search.placeholder", "Search…"],
  ["search.no_results", "No results found"],
  ["search.results_count", "{count} results"],
  ["form.name", "Name"],
  ["form.email", "Email"],
  ["form.message", "Message"],
  ["form.submit", "Submit"],
  ["form.required", "This field is required."],
  ["form.invalid_email", "Please enter a valid email address."],
  ["form.success", "Thanks! We've received your message."],
  ["pagination.previous", "Previous"],
  ["pagination.next", "Next"],
  ["pagination.page_of", "Page {current} of {total}"],
  ["cookie.accept_all", "Accept all"],
  ["cookie.reject_all", "Reject all"],
  ["cookie.settings", "Cookie settings"],
  ["blog.published_on", "Published on {date}"],
  ["footer.copyright", "© {year} {company}. All rights reserved."],
];

export type LabelsSetup = {
  name: string;
  slug: string;
  languages: { code: string; name: string }[];
  withStarterLabels: boolean;
};
