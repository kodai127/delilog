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
画像は Uber Driver / 出前館ドライバー / menu配達クルー / Rocket Now などの売上・報酬画面。

抽出ルール:
- sales: 画面の売上・報酬の合計金額（円、整数）。期間合計と日別があれば、画面の主役になっている金額を選ぶ
- deliveries: 配達件数・完了件数
- workHours: 稼働時間・オンライン時間（時間単位の小数、例 5.5）
- startTime/endTime: 稼働の開始・終了時刻が読み取れる場合のみ "HH:MM"
- date: 対象日が読み取れる場合のみ "YYYY-MM-DD"（「今日」等の相対表記は null）
- platform: 画面のUI・ロゴから判定できる場合のみ "Uber Eats" | "出前館" | "menu" | "Rocket Now"
- 読み取れない・確信がない項目は必ず null。推測で埋めない
- note: 読み取りの補足があれば30字以内（例:「週間合計の画面です」）。なければ null`;

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
