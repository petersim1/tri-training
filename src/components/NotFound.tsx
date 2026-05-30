import { Link } from "@tanstack/react-router";

export function NotFound({ children }: { children?: React.ReactNode }) {
  return (
    <div className="space-y-2 p-2">
      <div className="text-zinc-400">
        {children ?? <p>That page does not exist.</p>}
      </div>
      <p className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-sm bg-emerald-600 px-2 py-1 text-sm font-black text-white uppercase"
        >
          Go back
        </button>
        <Link
          to="/"
          className="rounded-sm bg-cyan-700 px-2 py-1 text-sm font-black text-white uppercase"
        >
          Home
        </Link>
      </p>
    </div>
  );
}
