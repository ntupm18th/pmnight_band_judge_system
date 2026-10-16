import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // 規則測試共用同一個 emulator，必須依序執行
    fileParallelism: false,
    testTimeout: 20000,
  },
});
