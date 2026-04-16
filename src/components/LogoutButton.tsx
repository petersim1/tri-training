import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";
import { logoutFn } from "~/lib/auth/server-fns";

export function LogoutButton() {
  const runLogout = useServerFn(logoutFn);
  const [pending, setPending] = useState(false);

  const onClick = useCallback(async () => {
    setPending(true);
    try {
      await runLogout();
    } finally {
      setPending(false);
    }
  }, [runLogout]);

  return (
    <button
      type="button"
      disabled={pending}
      className="text-sm text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline disabled:opacity-50"
      onClick={onClick}
    >
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}
