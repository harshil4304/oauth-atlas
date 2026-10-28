export function SearchBox({ defaultValue = "", autoFocus = false }: { defaultValue?: string; autoFocus?: boolean }) {
  return (
    <form action="/go" method="get" className="flex w-full max-w-2xl flex-col gap-2 sm:flex-row" role="search">
      <label htmlFor="app-query" className="sr-only">
        App name or website
      </label>
      <input
        id="app-query"
        name="q"
        required
        autoFocus={autoFocus}
        defaultValue={defaultValue}
        placeholder="Gmail, Salesforce, linear.app…"
        autoComplete="off"
        className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-4 py-3 text-lg placeholder:text-ink-3 focus:border-ink focus:outline-none"
      />
      <button type="submit" className="rounded-lg bg-ink px-5 py-3 text-lg font-semibold text-paper hover:opacity-90">
        Get the guide
      </button>
    </form>
  );
}
