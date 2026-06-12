import { Info } from "lucide-react";

interface ServerStatusProps {
  message?: string | null;
}

export function ServerStatus({ message }: ServerStatusProps) {
  if (!message) return null;

  return (
    <p className="flex items-center gap-2 rounded-lg border border-sky-400/25 bg-sky-950/30 px-3 py-2 text-sm text-sky-100">
      <Info className="size-4 shrink-0" />
      {message}
    </p>
  );
}
