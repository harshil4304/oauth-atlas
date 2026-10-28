import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OAuth Atlas: how hard is it to get your OAuth app approved?", template: "%s · OAuth Atlas" },
  description:
    "Setup and approval guides for provider OAuth apps, for developers whose AI agents need users to connect apps. See difficulty, time and blockers, or generate a guide for any app.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="no-print border-b border-line">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
            <Link href="/" className="font-display text-lg font-extrabold tracking-tight no-underline">
              OAuth Atlas
            </Link>
            <div className="ml-auto flex gap-5 text-sm text-ink-2">
              <Link href="/#library" className="hover:text-ink">
                Library
              </Link>
              <Link href="/compare" className="hover:text-ink">
                Compare
              </Link>
              <Link href="/method" className="hover:text-ink">
                How we rate
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">{children}</main>
        <footer className="no-print mx-auto max-w-6xl border-t border-line px-4 py-6 text-sm text-ink-3 sm:px-6">
          Guides describe provider requirements as checked on the date shown on each guide. Providers change policies; follow the linked sources before you
          submit anything.
        </footer>
      </body>
    </html>
  );
}
