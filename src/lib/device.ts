const KEY = 'pm.deviceId';

export function deviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID().slice(0, 18);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}
