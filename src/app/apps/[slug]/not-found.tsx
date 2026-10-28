import { SearchBox } from "@/components/SearchBox";

export default function NotFound() {
  return (
    <div className="pt-16">
      <h1 className="text-3xl font-extrabold">No guide at this address</h1>
      <p className="mt-3 max-w-[60ch] text-ink-2">
        Generated guides can expire on deployments without a database. Search for the app to open its library guide or generate a fresh one.
      </p>
      <div className="mt-6">
        <SearchBox />
      </div>
    </div>
  );
}
