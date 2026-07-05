// デリログ — スクショ自動記帳API (Vercel Serverless Function)
// 配達アプリの売上画面スクショ → Claude vision → 金額/件数/時間などを抽出して返す。
// APIキーは Vercel の環境変数 ANTHROPIC_API_KEY にのみ存在し、クライアントには渡さない。
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5'; // 最安構成: 画像1枚 ≈ ¥0.3
const MAX_TOKENS = 400;
const DAILY_LIMIT = 10; // 端末ごと1日10枚（ベストエフォート。コスト暴走の上限）
const MAX_IMAGE_B64 = 3_000_000; // ≈2.2MB。クライアント側で縮小済み前提

const hits = new Map(); // deviceId -> { day, count }

function rateLimited(deviceId) {
  const day = new Date().toISOString().slice(0, 10);
  const rec = hits.get(deviceId);
  const count = rec && rec.day === day ? rec.count : 0;
  if (count >= DAILY_LIMIT) return true;
  hits.set(deviceId, { day, count: count + 1 });
  if (hits.size > 5000) hits.clear();
  return false;
}

const SYSTEM_PROMPT = `あなたはフードデリバリー配達員の売上画面スクリーンショットから数値を抽出するアシスタント。
画像は Uber Driver / 出前館ドライバー / menu配達クルー / Rocket Now の売上・報酬画面、または出前館の支払通知書PDF。

## まずプラットフォームを判別する（固有語・UIで判定）
- "Uber Eats": 「収益」「オンライン時間」「乗車」「ポイント」「プロモーション」「クエスト」「ピーク料金」、緑/黒のUber Driver UI。※Uberに「ブースト」は無い（廃止済み）
- "出前館": 「基本報酬」「ブースト」「配達実績」「実績ダウンロード」「商品代金補填料」「代引き預り金」「支払通知書」。金額は「400円」形式、マイナスは「▲」表記
- "menu": 「回数報酬」「走行距離報酬」「ランクボーナス」「経験値」「EXP」「Lv.」「RANK」「配達クルーとしての売り上げ」「今週の売り上げ/今月の売り上げ」
- "Rocket Now": 「MY収入」「ミッション」「距離報酬」「リワードプログラム」、ロケットのロゴ・「ロケットナウ」表記
- 判別できなければ platform は null

## 抽出ルール
- sales: 画面の主役になっている報酬合計（円、整数、カンマ除去）。
  - Uber: 「報酬総額/合計支払額」または画面中央の大きな収益額（チップ・プロモーション込みの合計）
  - 出前館: 「アプリ表示報酬」（=基本報酬+ブースト）。支払通知書なら「支払金額」。▲項目は控除として扱う
  - menu: 「今週/今月の売り上げ」または明細合計（サービス手数料控除後があればそちら）
  - Rocket Now: MY収入の合計額
- deliveries: 配達件数・完了件数・乗車回数（Uberの「ポイント」は1配達=1ptなので件数として使ってよい）
- workHours: 稼働時間・オンライン時間（時間単位の小数。例「5時間30分」→5.5）
- startTime/endTime: 稼働の開始・終了時刻が明示されている場合のみ "HH:MM"
- date: 対象日が特定できる場合のみ "YYYY-MM-DD"。週間・半月・月間サマリーの場合は null（期間はnoteに書く）
- 読み取れない・確信がない項目は必ず null。推測で埋めない
- note: 30字以内の補足。特に「週間合計」「7/1〜7/15の半月合計」「月間合計」など期間単位は必ず書く。チップ・ブースト等の内訳が見えたら簡潔に。なければ null`;

const OUTPUT_FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      sales: { type: ['integer', 'null'] },
      deliveries: { type: ['integer', 'null'] },
      workHours: { type: ['number', 'null'] },
      startTime: { type: ['string', 'null'] },
      endTime: { type: ['string', 'null'] },
      date: { type: ['string', 'null'] },
      platform: { type: ['string', 'null'] },
      note: { type: ['string', 'null'] },
    },
    required: ['sales', 'deliveries', 'workHours', 'startTime', 'endTime', 'date', 'platform', 'note'],
    additionalProperties: false,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ ok: false, error: 'not configured' });
    return;
  }

  const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.slice(0, 64) : '';
  if (!deviceId) {
    res.status(400).json({ ok: false, error: 'deviceId required' });
    return;
  }
  if (rateLimited(deviceId)) {
    res.status(429).json({ ok: false, error: 'daily limit reached' });
    return;
  }

  const image = typeof req.body?.image === 'string' ? req.body.image : '';
  const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(req.body?.mediaType)
    ? req.body.mediaType
    : 'image/jpeg';
  if (!image || image.length > MAX_IMAGE_B64) {
    res.status(400).json({ ok: false, error: 'invalid image' });
    return;
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: { format: OUTPUT_FORMAT },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: 'この売上画面から数値を抽出して。' },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal') {
      res.status(502).json({ ok: false, error: 'scan unavailable' });
      return;
    }
    const text = response.content.find((b) => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text);
    res.status(200).json({ ok: true, result: parsed });
  } catch (e) {
    const status = e?.status === 429 ? 429 : 502;
    res.status(status).json({ ok: false, error: 'upstream error' });
  }
}
