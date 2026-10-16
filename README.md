# 流唱之夜一驗評分系統

供活動現場評審以手機／平板／筆電評分、管理員即時彙整成績的網頁系統。

- 前端：React + TypeScript + Vite，部署於 GitHub Pages
- 後端：Firebase Authentication + Cloud Firestore（Spark 免費方案）
- 權限：全部由 [`firestore.rules`](firestore.rules) 在伺服器端執行，並有自動化測試

## 本機開發

需要 Node.js 20+ 與 Java 21+（Firestore Emulator 需要）。

```bash
npm install
cp .env.example .env.local      # 填入正式 Firebase 設定（npm run dev 用）
npm run emulators               # 終端機 1：啟動本機 Firebase
node scripts/seed-emulator.mjs --emulator   # 終端機 2：建立測試帳號與表演
npm run dev:emu                 # 終端機 2：連 Emulator，http://localhost:5173/pmnight_band_judge_system/
```

測試帳號：`admin`、`judge1`、`judge2`、`judge3`，密碼皆為 `password`。

## 測試

```bash
npm run test:unit    # 平均、排名等計算邏輯
npm run test:rules   # 資料庫權限規則（會自動啟動 Emulator）
```

**修改 `firestore.rules` 後一定要跑 `npm run test:rules`。**

## 正式環境設定（只需做一次）

1. [Firebase Console](https://console.firebase.google.com/) 建立專案（Spark 方案即可）。
2. **Authentication** → 開始使用 → 啟用「電子郵件/密碼」。
   **Settings → 授權網域** 加入 `ntupm18th.github.io`。
3. **Firestore Database** → 建立資料庫（地區建議 `asia-east1` 台灣）。
4. **專案設定 → 一般 → 你的應用程式** → 新增網頁應用程式，取得設定值。
5. GitHub repo → Settings → Secrets and variables → Actions → **Variables** 新增：
   `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID`、`VITE_FIREBASE_APP_ID`
   （這些值會出現在前端程式中，本來就不是機密。）
6. GitHub repo → Settings → Pages → Source 選 **GitHub Actions**。
7. 發布資料庫規則：
   ```bash
   npx firebase login
   npx firebase use --add          # 選擇剛建立的專案
   npm run deploy:rules
   ```
8. **專案設定 → 服務帳戶 → 產生新的私密金鑰**，存成 `secrets/service-account.json`
   （已被 `.gitignore` 排除，**絕對不要提交**），然後建立第一位管理員：
   ```bash
   npm run create-admin -- <帳號> <密碼> <顯示名稱>
   ```
   其餘帳號登入後在「帳號」頁新增。

## 管理腳本

| 指令 | 用途 |
|---|---|
| `npm run create-admin -- 帳號 密碼 [名稱]` | 建立或恢復管理員 |
| `npm run reset-password -- 帳號 新密碼` | 重設密碼（評分資料不受影響） |

所有腳本加上 `--emulator` 即作用於本機 Emulator。

## 評分規則摘要

- 純人聲組：音準 40、節奏 30、表現 30
- 樂團組：Vocal（音準 15、節奏 15、表現 15）＋ Instrument（準確度 25、節奏 20、音色 10）
- 平均只納入「已完成、未標記不上場、類別相符、表演未停用」的評分；無有效評分顯示「尚無有效成績」
- 排名在同類別內計算（兩天合併），同分同名次，平均顯示到小數第三位
