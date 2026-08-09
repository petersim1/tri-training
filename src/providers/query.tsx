import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { getQueryClient } from "@/lib/query/client";

const QueryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queryClient] = useState(() => getQueryClient());

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

export default QueryProvider;
