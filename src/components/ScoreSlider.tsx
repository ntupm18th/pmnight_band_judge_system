import { useId } from 'react';

interface Props {
  label: string;
  max: number;
  value: number | null;
  disabled?: boolean;
  /** 拖動中即時更新（不儲存） */
  onChange: (v: number) => void;
  /** 放開滑桿、按鍵或 ± 按鈕後儲存 */
  onCommit: (v: number) => void;
}

export function ScoreSlider({ label, max, value, disabled, onChange, onCommit }: Props) {
  const id = useId();
  const filled = value !== null;
  const shown = value ?? 0;

  const step = (delta: number) => {
    const v = Math.min(max, Math.max(0, (value ?? (delta > 0 ? -1 : 1)) + delta));
    onChange(v);
    onCommit(v);
  };

  const commitFromInput = (el: HTMLInputElement) => onCommit(Number(el.value));

  return (
    <div className="py-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <span className="tabular-nums" aria-hidden="true">
          {filled ? (
            <span className="text-2xl font-semibold">{value}</span>
          ) : (
            <span className="text-base font-medium text-amber-600 dark:text-amber-400">未填</span>
          )}
          <span className="text-sm text-zinc-500"> / {max}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary size-11 shrink-0 px-0 text-xl"
          onClick={() => step(-1)}
          disabled={disabled || value === 0}
          aria-label={`${label} 減 1`}
        >
          −
        </button>
        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={1}
          value={shown}
          disabled={disabled}
          aria-valuetext={filled ? `${value} 分，滿分 ${max}` : `未填，滿分 ${max}`}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={(e) => commitFromInput(e.currentTarget)}
          onKeyUp={(e) => {
            if (/^(Arrow|Page|Home|End)/.test(e.key)) commitFromInput(e.currentTarget);
          }}
          className={`score-range h-11 w-full ${filled ? '' : 'unfilled'}`}
        />
        <button
          type="button"
          className="btn-secondary size-11 shrink-0 px-0 text-xl"
          onClick={() => step(1)}
          disabled={disabled || value === max}
          aria-label={`${label} 加 1`}
        >
          +
        </button>
      </div>
    </div>
  );
}
