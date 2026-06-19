# デリログ

## 概要

デリログは、Uber Eats・出前館・menu・Rocket Now・Woltなどで稼働するフードデリバリー配達員向けの売上管理Webアプリです。

スマホから売上、経費、利益、時給、月間目標達成率をかんたんに確認できます。PWA対応のため、iPhoneのホーム画面に追加してアプリのように利用できます。

## 機能一覧

- 今日の売上、利益、時給の確認
- 今月の売上と月間目標達成率の表示
- 売上・経費の記録
- Uber Eats、出前館、menu、Rocket Now、Woltのプラットフォーム別管理
- 月次レポート
- プラットフォーム別の売上、件数、稼働時間、時給分析
- 曜日別、時間帯別、エリア別の時給ランキング
- 税金予測
- 確定申告補助のための経費自動分類
- CSVインポート / CSV出力
- データのバックアップ / 復元
- PWA対応
- Google Search Console向けの `sitemap.xml` / `robots.txt` / JSON-LD対応

## 技術スタック

- HTML
- CSS
- JavaScript
- PWA
- Supabase連携用設定
- Vercel

## デプロイURL

https://uber-sales-app.vercel.app

## ローカルでの確認

静的ファイルのみで構成されています。`index.html` をブラウザで開くか、Vercel CLIでローカルプレビューできます。

```bash
npx vercel dev
```

## デプロイ

```bash
npx vercel --prod --yes
```
