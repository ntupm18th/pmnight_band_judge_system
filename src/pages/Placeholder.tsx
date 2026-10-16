export function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="card p-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-zinc-500">此功能將於{phase}完成。</p>
    </div>
  );
}
