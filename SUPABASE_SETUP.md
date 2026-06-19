# Supabase設定手順

## 1. Supabaseプロジェクトを作成

Supabaseで新規プロジェクトを作成し、Project URL と anon public key を控えます。

## 2. テーブルとRLSを作成

Supabase SQL Editorで `supabase-schema.sql` の内容を実行します。
既存プロジェクトに後から反映する場合も、同じSQLを再実行してください。プラットフォーム用の `platform`、稼働エリア用の `area`、開始/終了時刻用の `start_time` / `end_time`、稼働時間用の `work_hours` カラムと月間目標用の `user_settings` テーブルが追加されます。

## 3. Googleログインを有効化

Supabase Dashboard の Authentication > Providers で Google を有効化します。
Google Cloud ConsoleでOAuthクライアントを作成し、SupabaseにClient IDとClient Secretを設定します。

Redirect URLにはSupabase側に表示されるCallback URLをGoogle Cloud Consoleへ登録してください。
アプリを公開する場合は、Authentication > URL Configuration に公開URLを追加します。

## 4. アプリへキーを設定

`supabase-config.js` を編集します。

```js
window.UBER_SALES_SUPABASE = {
  url: "https://xxxxxxxx.supabase.co",
  anonKey: "your-anon-public-key",
  table: "delivery_records"
};
```

## 5. iPhoneで使う場合

PWA、Googleログイン、Service Workerは `file://` では正しく動きません。
HTTPSで公開したURLをSafariで開き、「共有」から「ホーム画面に追加」を選んでください。
