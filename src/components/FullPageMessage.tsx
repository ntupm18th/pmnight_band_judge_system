import type { ReactNode } from 'react';

export function FullPageMessage({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      {detail && <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{detail}</p>}
      {children}
    </div>
  );
}
