// デリログ — スクショ自動記帳（フロント側）
// 売上画面のスクショを選ぶ → 縮小して /api/scan へ → 返ってきた値をフォームに自動入力。
// 最終確認と「追加する」はユーザーが行う（誤読み取りをそのまま保存しない）。
(() => {
  const SCAN_DAILY_LIMIT = 10;
  const scanButton = document.getElementById('scanButton');
  const scanFileInput = document.getElementById('scanFileInput');
  const scanStatus = document.getElementById('scanStatus');
  if (!scanButton || !scanFileInput) return;

  function deviceId() {
    let id = localStorage.getItem('delilog-device');
    if (!id) {
      id = `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('delilog-device', id);
    }
    return id;
  }

  function scanCount() {
    try {
      const raw = JSON.parse(localStorage.getItem('delilog-scan-count') || '{}');
      const day = new Date().toISOString().slice(0, 10);
      return raw.day === day ? raw.count || 0 : 0;
    } catch {
      return 0;
    }
  }

  function bumpScanCount() {
    const day = new Date().toISOString().slice(0, 10);
    localStorage.setItem('delilog-scan-count', JSON.stringify({ day, count: scanCount() + 1 }));
  }

  function setStatus(message, isError) {
    if (!scanStatus) return;
    scanStatus.textContent = message || '';
    scanStatus.classList.toggle('is-error', !!isError);
  }

  // 大きい写真はそのまま送らない（通信量・API費用の節約）
  function downscale(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image load failed'));
      };
      img.src = url;
    });
  }

  function fillForm(result) {
    const filled = [];
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el && value !== null && value !== undefined && value !== '') {
        el.value = value;
        return true;
      }
      return false;
    };

    // スクショ読み取りは売上前提。種類を売上に揃える
    const typeSelect = document.getElementById('type');
    if (typeSelect.value !== 'sales') {
      typeSelect.value = 'sales';
      typeSelect.dispatchEvent(new Event('change'));
      document.querySelectorAll('#typeToggle .type-btn').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.type === 'sales');
      });
    }

    if (setValue('amount', result.sales)) filled.push(`売上${Number(result.sales).toLocaleString()}円`);
    if (setValue('date', result.date)) filled.push('日付');
    if (result.platform) {
      const platform = document.getElementById('platform');
      const option = [...platform.options].find((o) => o.value === result.platform);
      if (option) {
        platform.value = result.platform;
        filled.push(result.platform);
      }
    }
    const hasDetail =
      setValue('deliveries', result.deliveries) |
      setValue('workHours', result.workHours) |
      setValue('startTime', result.startTime) |
      setValue('endTime', result.endTime);
    if (result.deliveries) filled.push(`${result.deliveries}件`);
    if (result.workHours) filled.push(`${result.workHours}h`);
    if (hasDetail) document.getElementById('moreFields').open = true;

    return filled;
  }

  scanButton.addEventListener('click', () => {
    if (scanCount() >= SCAN_DAILY_LIMIT) {
      setStatus(`今日の読み取り回数（${SCAN_DAILY_LIMIT}枚）を使い切りました。明日また使えます。`, true);
      return;
    }
    scanFileInput.click();
  });

  scanFileInput.addEventListener('change', async (event) => {
    const [file] = event.target.files;
    scanFileInput.value = '';
    if (!file) return;

    scanButton.disabled = true;
    const originalLabel = scanButton.textContent;
    scanButton.textContent = '🔍 読み取り中…';
    setStatus('');

    try {
      const image = await downscale(file);
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId(), image, mediaType: 'image/jpeg' }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 429) {
        setStatus('今日の読み取り上限に達しました。明日また使えます。', true);
        return;
      }
      if (!response.ok || !data.ok) {
        setStatus('読み取りに失敗しました。もう一度試すか、手で入力してください。', true);
        return;
      }

      bumpScanCount();
      const filled = fillForm(data.result);
      if (filled.length) {
        const note = data.result.note ? `（${data.result.note}）` : '';
        setStatus(`✅ 読み取りました: ${filled.join(' / ')}${note} — 内容を確認して「追加する」を押してください`);
      } else {
        setStatus('数値を読み取れませんでした。売上金額が写った画面で試してください。', true);
      }
    } catch {
      setStatus('読み取りに失敗しました。通信環境を確認してください。', true);
    } finally {
      scanButton.disabled = false;
      scanButton.textContent = originalLabel;
    }
  });
})();
