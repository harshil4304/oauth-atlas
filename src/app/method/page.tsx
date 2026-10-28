import type { Metadata } from "next";
import { EVIDENCE } from "@/components/Badges";
import { FACTOR_LABELS, WEIGHTS } from "@/lib/rubric";
import { FACTOR_KEYS } from "@/lib/schema";

export const metadata: Metadata = { title: "How we rate" };

export default function MethodPage() {
  return (
    <div className="max-w-3xl pt-10">
      <h1 className="text-3xl font-extrabold sm:text-4xl">How we rate an app</h1>
      <p className="mt-4 text-lg text-ink-2">
        Every guide answers the same questions for one realistic use case, written at the top of the guide (for example &ldquo;reads email for users outside
        your company&rdquo;). The difficulty comes from those answers through fixed weights, so a hand-written guide and an agent-written guide are scored the
        same way and nobody picks the label by feel.
      </p>

      <h2 className="mt-10 text-2xl font-bold">What adds difficulty</h2>
      <table className="mt-4 w-full text-left">
        <thead className="text-sm text-ink-3">
          <tr className="border-b border-line">
            <th className="py-2 font-normal">Fact about the provider</th>
            <th className="py-2 text-right font-normal">Points</th>
          </tr>
        </thead>
        <tbody>
          {FACTOR_KEYS.map((k) => (
            <tr key={k} className="border-b border-line">
              <td className="py-2">{FACTOR_LABELS[k]}</td>
              <td className="py-2 text-right font-semibold">{WEIGHTS[k]}</td>
            </tr>
          ))}
          <tr className="border-b border-line">
            <td className="py-2">Setup itself takes a working day or more</td>
            <td className="py-2 text-right font-semibold">1</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-4 text-ink-2">
        0–2 points is Easy, 3–5 is Medium, 6 or more is Hard. Required counts fully. Sometimes and Unknown count only toward the upper end, which is why some
        apps show a range such as &ldquo;Medium to Hard&rdquo;. A wide range is a signal to check the unconfirmed items before you plan.
      </p>
      <p className="mt-3 text-ink-2">
        The heaviest weight goes to third-party security assessments because they cost money, need code changes, and repeat every year. Provider review and
        paid access come next because they put a calendar wait or a budget line between you and launch.
      </p>

      <h2 className="mt-10 text-2xl font-bold">How sure we are about each claim</h2>
      <ul className="mt-4 space-y-3">
        {(Object.keys(EVIDENCE) as (keyof typeof EVIDENCE)[]).map((k) => (
          <li key={k}>
            <span className={`font-semibold ${EVIDENCE[k].cls}`}>
              <span aria-hidden>{EVIDENCE[k].mark}</span> {EVIDENCE[k].label}
            </span>
            <span className="text-ink-2">: {EVIDENCE[k].help}.</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-ink-2">
        Anything without a source is shown as Unconfirmed, automatically. The research agent is never allowed to label its own claims as Tested; only the live
        checks below can do that.
      </p>

      <h2 className="mt-10 text-2xl font-bold">What the live checks test</h2>
      <p className="mt-3 text-ink-2">
        From our server, with no credentials: the provider&apos;s OpenID discovery document parses, the authorize endpoint answers a request from a fake
        client, the token endpoint rejects a fake code with a standard OAuth error, the developer portal loads, and the cited official pages are still online.
        These prove the endpoints and pages exist today. They can&apos;t prove review times or policy details; those come from the sources.
      </p>

      <h2 className="mt-10 text-2xl font-bold">How a new guide is generated</h2>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-ink-2">
        <li>A research agent searches for the provider&apos;s developer docs, reads the pages on OAuth setup, scopes, review and distribution limits, and fills in the guide with a source for each claim.</li>
        <li>The live checks run against the endpoints and pages it found.</li>
        <li>A separate fact-check pass re-opens every cited page and marks each key claim as confirmed, partly confirmed, or unsupported. Unsupported factors become Unknown, which widens the difficulty range instead of hiding the doubt.</li>
        <li>The rubric scores it and the guide is saved with a link you can share.</li>
      </ol>

      <h2 className="mt-10 text-2xl font-bold">What these guides can&apos;t tell you</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-2">
        <li>Review times are mostly what providers publish or developers report. Your own review can be faster or slower.</li>
        <li>No approvals were actually submitted while building these guides.</li>
        <li>Providers change rules; four of the twelve library apps changed meaningfully in the last 18 months. Check the date on each guide.</li>
      </ul>
    </div>
  );
}
