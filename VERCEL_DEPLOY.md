# Vercelデプロイ手順

## 1. Supabase設定

デプロイ前に `supabase-config.js` の値を実際のSupabaseプロジェクトに変更してください。

```js
window.UBER_SALES_SUPABASE = {
  url: "https://xxxxxxxx.supabase.co",
  anonKey: "your-anon-public-key",
  table: "delivery_records"
};
```

## 2. Vercelへデプロイ

```bash
cd ~/Desktop/uber-sales-app
npm install
npm run deploy
```

初回はVercelログインとプロジェクト作成の確認が表示されます。

## 3. SupabaseのURL設定

Vercelの公開URLが決まったら、Supabase Dashboardで次を設定してください。

- Authentication > URL Configuration > Site URL: Vercelの公開URL
- Authentication > URL Configuration > Redirect URLs: `https://your-app.vercel.app/**`

Google Cloud Console側にも、SupabaseのGoogle provider画面に表示されるCallback URLを登録してください。

## 4. iPhoneホーム画面追加

SafariでVercelの公開URLを開き、「共有」から「ホーム画面に追加」を選びます。
