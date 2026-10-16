// 重設任一帳號的密碼（帳號與評分資料都不變）
// 用法：npm run reset-password -- <帳號> <新密碼> [--emulator]
import { adminAuth, positional, usernameToEmail } from './_admin.mjs';

const [username, password] = positional;
if (!username || !password || password.length < 6) {
  console.error('用法：npm run reset-password -- <帳號> <新密碼(至少6字元)> [--emulator]');
  process.exit(1);
}
try {
  const user = await adminAuth.getUserByEmail(usernameToEmail(username));
  await adminAuth.updateUser(user.uid, { password });
  // 讓其他裝置上的舊登入失效
  await adminAuth.revokeRefreshTokens(user.uid);
  console.log(`已重設 ${username} 的密碼`);
  process.exit(0);
} catch (e) {
  console.error(e.code === 'auth/user-not-found' ? `找不到帳號：${username}` : e);
  process.exit(1);
}
