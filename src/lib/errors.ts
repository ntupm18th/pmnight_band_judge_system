const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': '帳號或密碼錯誤',
  'auth/wrong-password': '帳號或密碼錯誤',
  'auth/user-not-found': '帳號或密碼錯誤',
  'auth/invalid-email': '帳號格式不正確',
  'auth/too-many-requests': '嘗試次數過多，請稍後再試',
  'auth/network-request-failed': '網路連線失敗，請確認網路後再試',
  'auth/email-already-in-use': '此帳號已存在（若是先前建立失敗，請輸入相同密碼重試）',
  'auth/weak-password': '密碼至少需要 6 個字元',
  'auth/user-disabled': '此帳號已被停用',
  'permission-denied': '沒有權限執行此操作',
  'unavailable': '目前無法連線到伺服器',
  'failed-precondition': '資料狀態已變更，請重新整理後再試',
  'not-found': '找不到資料',
};

export function errorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (e instanceof Error && e.message) return e.message;
  return '發生未知錯誤';
}
