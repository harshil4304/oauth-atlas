import { Guide } from "./schema";
import atlassian from "../../data/guides/atlassian-jira.json";
import dropbox from "../../data/guides/dropbox.json";
import github from "../../data/guides/github.json";
import google from "../../data/guides/google-gmail.json";
import hubspot from "../../data/guides/hubspot.json";
import linkedin from "../../data/guides/linkedin.json";
import microsoft from "../../data/guides/microsoft-outlook.json";
import notion from "../../data/guides/notion.json";
import salesforce from "../../data/guides/salesforce.json";
import slack from "../../data/guides/slack.json";
import x from "../../data/guides/x-twitter.json";
import zoom from "../../data/guides/zoom.json";

const RAW = [github, notion, atlassian, dropbox, slack, hubspot, zoom, salesforce, microsoft, google, linkedin, x];

/** Parsed at import time so a broken guide fails the build, not a page view. */
export const LIBRARY: Guide[] = RAW.map((g) => Guide.parse(g));

export function getLibraryGuide(slug: string): Guide | undefined {
  return LIBRARY.find((g) => g.slug === slug);
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Match a typed name or URL to a library guide (e.g. "gmail", "slack.com", "Jira"). */
export function findInLibrary(query: string): Guide | undefined {
  const q = norm(query);
  if (!q) return undefined;
  const host = q.split(" ")[0];
  return LIBRARY.find((g) => {
    const names = [g.slug.replace(/-/g, " "), norm(g.name), norm(g.website)];
    return names.some((n) => n === q || n.split(" ").includes(q) || n.startsWith(host + " ") || q.startsWith(n));
  });
}
