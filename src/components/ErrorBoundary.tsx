import { Component, type ReactNode } from 'react';

/** 任何畫面錯誤都顯示可恢復的訊息，而不是整頁空白。已儲存的評分不受影響。 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold">畫面發生錯誤</h1>
        <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
          已同步的評分不會遺失。請重新整理頁面；若持續發生，請聯絡管理員。
        </p>
        <p className="max-w-sm font-mono text-xs break-all text-zinc-400">{this.state.error.message}</p>
        <button className="btn-primary" onClick={() => window.location.reload()}>重新整理</button>
      </div>
    );
  }
}
