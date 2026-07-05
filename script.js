const STORAGE_KEY = "uber-sales-app-records";
const SETTINGS_KEY = "uber-sales-app-settings";
const DEFAULT_PLATFORM = "Uber Eats";

const platforms = ["Uber Eats", "出前館", "menu", "Rocket Now", "Wolt"];

const categories = {
  sales: ["配達報酬", "チップ", "クエスト", "その他売上"],
  expense: ["ガソリン代", "オイル交換", "スマホ代", "バイク保険", "駐車場代", "バッグ・備品", "その他経費"]
};

const taxRules = [
  {
    category: "ガソリン代",
    taxCategory: "旅費交通費",
    deductionHint: "配達で使った燃料費。私用分がある場合は按分してください。",
    keywords: ["ガソリン", "燃料", "給油", "gasoline"]
  },
  {
    category: "オイル交換",
    taxCategory: "車両費",
    deductionHint: "配達用バイク・車両の整備費として整理できます。",
    keywords: ["オイル", "oil", "交換"]
  },
  {
    category: "スマホ代",
    taxCategory: "通信費",
    deductionHint: "配達アプリや連絡に使った通信費。私用分がある場合は按分してください。",
    keywords: ["スマホ", "携帯", "通信", "iphone", "android", "sim"]
  },
  {
    category: "バイク保険",
    taxCategory: "保険料",
    deductionHint: "配達用バイクの任意保険・自賠責など。",
    keywords: ["保険", "自賠責", "任意保険"]
  },
  {
    category: "駐車場代",
    taxCategory: "地代家賃",
    deductionHint: "配達用車両の駐車場・駐輪場代。",
    keywords: ["駐車", "駐輪", "パーキング", "parking"]
  }
];

const supabaseSettings = window.UBER_SALES_SUPABASE || {};
const isSupabaseConfigured =
  supabaseSettings.url &&
  supabaseSettings.anonKey &&
  !supabaseSettings.url.includes("YOUR_PROJECT_ID") &&
  !supabaseSettings.anonKey.includes("YOUR_SUPABASE_ANON_KEY");
const supabaseClient =
  isSupabaseConfigured && window.supabase
    ? window.supabase.createClient(supabaseSettings.url, supabaseSettings.anonKey)
    : null;
const remoteTable = supabaseSettings.table || "delivery_records";
const remoteSettingsTable = supabaseSettings.settingsTable || "user_settings";

const form = document.querySelector("#entryForm");
const typeInput = document.querySelector("#type");
const dateInput = document.querySelector("#date");
const amountInput = document.querySelector("#amount");
const platformInput = document.querySelector("#platform");
const platformField = document.querySelector("#platformField");
const deliveriesInput = document.querySelector("#deliveries");
const deliveriesField = document.querySelector("#deliveriesField");
const workHoursInput = document.querySelector("#workHours");
const workHoursField = document.querySelector("#workHoursField");
const areaInput = document.querySelector("#area");
const areaField = document.querySelector("#areaField");
const startTimeInput = document.querySelector("#startTime");
const startTimeField = document.querySelector("#startTimeField");
const endTimeInput = document.querySelector("#endTime");
const endTimeField = document.querySelector("#endTimeField");
const categoryInput = document.querySelector("#category");
const memoInput = document.querySelector("#memo");
const monthFilter = document.querySelector("#monthFilter");
const typeFilter = document.querySelector("#typeFilter");
const platformFilter = document.querySelector("#platformFilter");
const recordsBody = document.querySelector("#recordsBody");
const emptyState = document.querySelector("#emptyState");
const csvFileInput = document.querySelector("#csvFileInput");
const restoreFileInput = document.querySelector("#restoreFileInput");
const authStatus = document.querySelector("#authStatus");
const syncStatus = document.querySelector("#syncStatus");
const googleLoginButton = document.querySelector("#googleLogin");
const logoutButton = document.querySelector("#logout");
const monthlyGoalInput = document.querySelector("#monthlyGoal");
const screens = document.querySelectorAll(".app-screen");
const navButtons = document.querySelectorAll(".nav-button");

let records = loadRecords();
let settings = loadSettings();
let currentUser = null;
let isSyncing = false;

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

// 画面によって存在しない要素があっても落ちないようにする
function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function loadRecords() {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).map(normalizeRecord);
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {});
  } catch {
    return normalizeSettings({});
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function normalizeSettings(value) {
  return {
    monthlyGoal: Number(value.monthlyGoal || value.monthly_goal || 0),
    updatedAt: Number(value.updatedAt || (value.updated_at ? new Date(value.updated_at).getTime() : 0) || Date.now())
  };
}

function normalizeRecord(record) {
  const type = record.type === "expense" || record.type === "経費" ? "expense" : "sales";
  const amount = Math.abs(Number(record.amount || record["金額"] || 0));
  const signedAmount = Number(record.amount || record["金額"] || 0);
  const normalizedType = signedAmount < 0 ? "expense" : type;
  const category = record.category || record["カテゴリ"] || (normalizedType === "expense" ? "その他経費" : "その他売上");
  const memo = record.memo || record["メモ"] || "";
  const startTime = record.startTime || record.start_time || record["開始時刻"] || "";
  const endTime = record.endTime || record.end_time || record["終了時刻"] || "";
  const calculatedHours = calculateWorkHours(startTime, endTime);
  const workHours = Number(record.workHours || record.work_hours || record["稼働時間"] || calculatedHours || 0);
  const taxInfo = classifyExpense({ ...record, type: normalizedType, category, memo });

  return {
    id: record.id || createId(),
    type: normalizedType,
    date: record.date || record["日付"] || todayString(),
    amount,
    platform: platforms.includes(record.platform || record["プラットフォーム"])
      ? record.platform || record["プラットフォーム"]
      : DEFAULT_PLATFORM,
    deliveries: Number(record.deliveries || record["配達件数"] || 0),
    workHours,
    area: record.area || record["稼働エリア"] || "",
    startTime,
    endTime,
    category: taxInfo.category || category,
    memo,
    taxCategory: record.taxCategory || record.tax_category || taxInfo.taxCategory,
    deductionHint: record.deductionHint || record.deduction_hint || taxInfo.deductionHint,
    createdAt: Number(record.createdAt || Date.now())
  };
}

function classifyExpense(record) {
  if (record.type !== "expense") {
    return { category: record.category, taxCategory: "売上", deductionHint: "" };
  }

  const target = `${record.category || ""} ${record.memo || ""}`.toLowerCase();
  const rule = taxRules.find((item) => item.keywords.some((keyword) => target.includes(keyword.toLowerCase())));

  if (!rule) {
    return {
      category: record.category || "その他経費",
      taxCategory: "その他経費",
      deductionHint: "内容を確認して適切な勘定科目に整理してください。"
    };
  }

  return {
    category: rule.category,
    taxCategory: rule.taxCategory,
    deductionHint: rule.deductionHint
  };
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthString() {
  return todayString().slice(0, 7);
}

function updateCategoryOptions() {
  const type = typeInput.value;
  platformInput.innerHTML = platforms
    .map((platform) => `<option value="${platform}">${platform}</option>`)
    .join("");
  categoryInput.innerHTML = categories[type]
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");
  platformField.style.display = type === "sales" ? "grid" : "none";
  deliveriesField.style.display = type === "sales" ? "grid" : "none";
  workHoursField.style.display = type === "sales" ? "grid" : "none";
  areaField.style.display = type === "sales" ? "grid" : "none";
  startTimeField.style.display = type === "sales" ? "grid" : "none";
  endTimeField.style.display = type === "sales" ? "grid" : "none";
  deliveriesInput.value = type === "sales" ? deliveriesInput.value : "";
  workHoursInput.value = type === "sales" ? workHoursInput.value : "";
  areaInput.value = type === "sales" ? areaInput.value : "";
  startTimeInput.value = type === "sales" ? startTimeInput.value : "";
  endTimeInput.value = type === "sales" ? endTimeInput.value : "";
}

function updatePlatformFilterOptions() {
  platformFilter.innerHTML = [
    `<option value="all">すべて</option>`,
    ...platforms.map((platform) => `<option value="${platform}">${platform}</option>`)
  ].join("");
}

function getFilteredRecords() {
  return records
    .filter((record) => !monthFilter.value || record.date.startsWith(monthFilter.value))
    .filter((record) => typeFilter.value === "all" || record.type === typeFilter.value)
    .filter(
      (record) =>
        platformFilter.value === "all" ||
        (record.type === "sales" && (record.platform || DEFAULT_PLATFORM) === platformFilter.value)
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function getMonthRecords() {
  return records.filter((record) => !monthFilter.value || record.date.startsWith(monthFilter.value));
}

function getTodayRecords() {
  const today = todayString();
  return records.filter((record) => record.date === today);
}

function createId() {
  if (globalThis.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ (Math.random() * 16) >> (Number(char) / 4)).toString(16)
  );
}

function calculateWorkHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) return 0;

  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 24 * 60;

  return Math.round(((end - start) / 60) * 100) / 100;
}

function getTimeSlot(startTime) {
  if (!startTime) return "時刻未入力";
  const hour = Number(startTime.slice(0, 2));
  if (Number.isNaN(hour)) return "時刻未入力";
  if (hour >= 5 && hour < 10) return "朝 5-10時";
  if (hour >= 10 && hour < 14) return "昼 10-14時";
  if (hour >= 14 && hour < 17) return "午後 14-17時";
  if (hour >= 17 && hour < 21) return "夜 17-21時";
  return "深夜 21-5時";
}

function getWeekdayLabel(dateString) {
  const labels = ["日", "月", "火", "水", "木", "金", "土"];
  const date = new Date(`${dateString}T00:00:00`);
  return labels[date.getDay()] || "-";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function calculateTotals(targetRecords) {
  return targetRecords.reduce(
    (sum, record) => {
      if (record.type === "sales") {
        sum.sales += record.amount;
        sum.deliveries += record.deliveries || 0;
        sum.workHours += record.workHours || 0;
      } else {
        sum.expenses += record.amount;
      }
      return sum;
    },
    { sales: 0, expenses: 0, deliveries: 0, workHours: 0 }
  );
}

function calculateAnnualTotals() {
  const year = (monthFilter.value || currentMonthString()).slice(0, 4);
  const yearRecords = records.filter((record) => record.date.startsWith(year));
  return calculateTotals(yearRecords);
}

function estimateIncomeTax(taxableIncome) {
  if (taxableIncome <= 0) return 0;

  const brackets = [
    { limit: 1950000, rate: 0.05, deduction: 0 },
    { limit: 3300000, rate: 0.1, deduction: 97500 },
    { limit: 6950000, rate: 0.2, deduction: 427500 },
    { limit: 9000000, rate: 0.23, deduction: 636000 },
    { limit: 18000000, rate: 0.33, deduction: 1536000 },
    { limit: 40000000, rate: 0.4, deduction: 2796000 },
    { limit: Infinity, rate: 0.45, deduction: 4796000 }
  ];
  const bracket = brackets.find((item) => taxableIncome <= item.limit);
  return Math.max(0, Math.round(taxableIncome * bracket.rate - bracket.deduction));
}

function groupByCategory(targetRecords, type) {
  return targetRecords
    .filter((record) => record.type === type)
    .reduce((groups, record) => {
      groups[record.category] = (groups[record.category] || 0) + record.amount;
      return groups;
    }, {});
}

function groupTaxExpenses(targetRecords) {
  return targetRecords
    .filter((record) => record.type === "expense")
    .reduce((groups, record) => {
      const key = record.taxCategory || "その他経費";
      groups[key] = (groups[key] || 0) + record.amount;
      return groups;
    }, {});
}

function groupByPlatform(targetRecords) {
  const initial = platforms.reduce((groups, platform) => {
    groups[platform] = { sales: 0, deliveries: 0, workHours: 0 };
    return groups;
  }, {});

  return targetRecords
    .filter((record) => record.type === "sales")
    .reduce((groups, record) => {
      const platform = platforms.includes(record.platform) ? record.platform : DEFAULT_PLATFORM;
      groups[platform].sales += record.amount;
      groups[platform].deliveries += record.deliveries || 0;
      groups[platform].workHours += record.workHours || 0;
      return groups;
    }, initial);
}

function groupEfficiency(targetRecords, getKey) {
  return targetRecords
    .filter((record) => record.type === "sales" && Number(record.workHours || 0) > 0)
    .reduce((groups, record) => {
      const key = getKey(record) || "未入力";
      if (!groups[key]) groups[key] = { sales: 0, deliveries: 0, workHours: 0 };
      groups[key].sales += record.amount;
      groups[key].deliveries += record.deliveries || 0;
      groups[key].workHours += record.workHours || 0;
      return groups;
    }, {});
}

function renderBreakdown(elementId, groups) {
  const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const element = document.querySelector(elementId);

  element.innerHTML = entries.length
    ? entries
        .map(
          ([category, amount]) => `
            <div class="breakdown-row">
              <span>${escapeHtml(category)}</span>
              <strong>${yen.format(amount)}</strong>
            </div>
          `
        )
        .join("")
    : `<div class="breakdown-row"><span>記録なし</span><strong>${yen.format(0)}</strong></div>`;
}

function renderPlatformAnalysis(monthRecords, totalSales) {
  const groups = groupByPlatform(monthRecords);
  const element = document.querySelector("#platformAnalysis");

  element.innerHTML = platforms
    .map((platform, index) => {
      const item = groups[platform];
      const hourlySales = item.workHours ? Math.round(item.sales / item.workHours) : 0;
      const share = totalSales ? Math.round((item.sales / totalSales) * 100) : 0;

      return `
        <article class="platform-card">
          <div class="platform-card-header">
            <span class="platform-name">
              <span class="platform-dot platform-${index}"></span>
              ${escapeHtml(platform)}
            </span>
            <span class="platform-share">${share}%</span>
          </div>
          <div class="platform-stats">
            <div class="platform-stat">
              <span>売上</span>
              <strong>${yen.format(item.sales)}</strong>
            </div>
            <div class="platform-stat">
              <span>件数</span>
              <strong>${item.deliveries}件</strong>
            </div>
            <div class="platform-stat">
              <span>稼働時間</span>
              <strong>${item.workHours.toFixed(1)}h</strong>
            </div>
            <div class="platform-stat">
              <span>売上時給</span>
              <strong>${yen.format(hourlySales)}</strong>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderEfficiencyRanking(elementId, groups) {
  const entries = Object.entries(groups)
    .map(([label, value]) => ({
      label,
      sales: value.sales,
      deliveries: value.deliveries,
      workHours: value.workHours,
      hourlySales: value.workHours ? Math.round(value.sales / value.workHours) : 0
    }))
    .filter((item) => item.workHours > 0)
    .sort((a, b) => b.hourlySales - a.hourlySales)
    .slice(0, 5);

  const element = document.querySelector(elementId);
  element.innerHTML = entries.length
    ? entries
        .map(
          (item, index) => `
            <div class="ranking-row">
              <span class="ranking-rank">${index + 1}</span>
              <div class="ranking-main">
                <strong>${escapeHtml(item.label)}</strong>
                <span>${item.deliveries}件 / ${item.workHours.toFixed(1)}h</span>
              </div>
              <span class="ranking-meta">${yen.format(item.hourlySales)}/h</span>
            </div>
          `
        )
        .join("")
    : `<div class="ranking-row"><span class="ranking-rank">-</span><div class="ranking-main"><strong>データなし</strong><span>稼働時間を入力してください</span></div><span class="ranking-meta">¥0/h</span></div>`;
}

function updateEfficiencyRankings(monthRecords) {
  renderEfficiencyRanking("#weekdayRanking", groupEfficiency(monthRecords, (record) => `${getWeekdayLabel(record.date)}曜日`));
  renderEfficiencyRanking("#timeSlotRanking", groupEfficiency(monthRecords, (record) => getTimeSlot(record.startTime)));
  renderEfficiencyRanking("#areaRanking", groupEfficiency(monthRecords, (record) => record.area || "エリア未入力"));
}

function updateSummary(filteredRecords) {
  const totals = calculateTotals(filteredRecords);

  document.querySelector("#totalSales").textContent = yen.format(totals.sales);
  document.querySelector("#totalExpenses").textContent = yen.format(totals.expenses);
  document.querySelector("#totalProfit").textContent = yen.format(totals.sales - totals.expenses);
  document.querySelector("#totalDeliveries").textContent = `${totals.deliveries}件`;
  document.querySelector("#totalWorkHours").textContent = `${totals.workHours.toFixed(1)}h`;
  document.querySelector("#recordCount").textContent = `${filteredRecords.length}件の記録`;
}

function updateSimpleDashboard(monthTotals) {
  const todayTotals = calculateTotals(getTodayRecords());
  const todayProfit = todayTotals.sales - todayTotals.expenses;
  const todayHourly = todayTotals.workHours ? Math.round(todayProfit / todayTotals.workHours) : 0;
  const monthlyGoal = Number(settings.monthlyGoal || 0);
  const goalRate = monthlyGoal ? Math.min(999, Math.round((monthTotals.sales / monthlyGoal) * 100)) : 0;

  setText("#todaySales", yen.format(todayTotals.sales));
  setText("#todayExpenses", yen.format(todayTotals.expenses));
  setText("#todayProfit", yen.format(todayProfit));
  setText("#todayHourly", yen.format(todayHourly));
  setText("#monthSalesSimple", yen.format(monthTotals.sales));
  setText("#goalRateSimple", `${goalRate}%`);
}

function updateMonthlyReport() {
  const monthRecords = getMonthRecords();
  const totals = calculateTotals(monthRecords);
  const profit = totals.sales - totals.expenses;
  const activeDays = new Set(monthRecords.map((record) => record.date)).size;
  const averagePerDelivery = totals.deliveries ? Math.round(totals.sales / totals.deliveries) : 0;
  const averageDailyProfit = activeDays ? Math.round(profit / activeDays) : 0;
  const profitRate = totals.sales ? Math.round((profit / totals.sales) * 1000) / 10 : 0;

  document.querySelector("#reportMonthLabel").textContent = `${monthFilter.value || "全期間"} の月次レポート`;
  document.querySelector("#averagePerDelivery").textContent = yen.format(averagePerDelivery);
  document.querySelector("#activeDays").textContent = `${activeDays}日`;
  document.querySelector("#averageDailyProfit").textContent = yen.format(averageDailyProfit);
  document.querySelector("#profitRate").textContent = `${profitRate}%`;
  updateSimpleDashboard(totals);
  updateHero(totals, profit);
  updateAnalytics(totals, profit);

  renderBreakdown("#salesBreakdown", groupByCategory(monthRecords, "sales"));
  renderBreakdown("#expenseBreakdown", groupByCategory(monthRecords, "expense"));
  renderPlatformAnalysis(monthRecords, totals.sales);
  updateEfficiencyRankings(monthRecords);
  updateTaxReport(monthRecords, totals);
}

function updateHero(totals, profit) {
  const monthlyGoal = Number(settings.monthlyGoal || 0);
  const goalRate = monthlyGoal ? Math.min(999, Math.round((totals.sales / monthlyGoal) * 100)) : 0;

  document.querySelector("#heroMonthLabel").textContent = `${monthFilter.value || "全期間"} の利益`;
  document.querySelector("#heroProfit").textContent = yen.format(profit);
  document.querySelector("#heroSubcopy").textContent = `売上 ${yen.format(totals.sales)} / 経費 ${yen.format(totals.expenses)}`;
  document.querySelector("#goalRate").textContent = `${goalRate}%`;
  document.documentElement.style.setProperty("--goal-progress", `${Math.min(goalRate, 100)}%`);
}

function updateAnalytics(totals, profit) {
  const annualTotals = calculateAnnualTotals();
  const annualProfit = annualTotals.sales - annualTotals.expenses;
  const taxableIncome = Math.max(0, annualProfit - 480000);
  const incomeTax = estimateIncomeTax(taxableIncome);
  const residentTax = Math.round(Math.max(0, annualProfit - 430000) * 0.1);
  const healthInsurance = Math.round(Math.max(0, annualProfit - 430000) * 0.1);
  const hourlyProfit = totals.workHours ? Math.round(profit / totals.workHours) : 0;
  const hourlySales = totals.workHours ? Math.round(totals.sales / totals.workHours) : 0;

  setText("#estimatedIncomeTax", yen.format(incomeTax));
  setText("#estimatedResidentTax", yen.format(residentTax));
  setText("#estimatedHealthInsurance", yen.format(healthInsurance));
  setText("#hourlyProfit", yen.format(hourlyProfit));
  setText("#hourlySales", `売上時給 ${yen.format(hourlySales)}`);
}

function updateTaxReport(monthRecords, totals) {
  const estimatedIncome = totals.sales - totals.expenses;

  document.querySelector("#taxReportLabel").textContent = `${monthFilter.value || "全期間"} の確定申告補助`;
  document.querySelector("#taxIncome").textContent = yen.format(totals.sales);
  document.querySelector("#taxDeductibleExpenses").textContent = yen.format(totals.expenses);
  document.querySelector("#taxEstimatedIncome").textContent = yen.format(estimatedIncome);
  renderBreakdown("#taxExpenseBreakdown", groupTaxExpenses(monthRecords));
}

function renderRecords() {
  const filteredRecords = getFilteredRecords();
  updateSummary(filteredRecords);
  updateMonthlyReport();

  recordsBody.innerHTML = filteredRecords
    .map((record) => {
      const typeLabel = record.type === "sales" ? "売上" : "経費";
      const signedAmount = record.type === "sales" ? record.amount : -record.amount;
      const amountClass = record.type === "expense" ? "record-amount expense" : "record-amount";
      const platform = record.type === "sales" ? record.platform || DEFAULT_PLATFORM : "共通経費";
      const workTime =
        record.type === "sales" && record.startTime && record.endTime ? `${record.startTime}-${record.endTime}` : "-";

      return `
        <article class="record-card">
          <div class="record-card-header">
            <div class="record-title">
              <strong>${escapeHtml(platform)}</strong>
              <span>${record.date} / <span class="badge ${record.type}">${typeLabel}</span></span>
            </div>
            <div class="${amountClass}">${yen.format(signedAmount)}</div>
          </div>
          <div class="record-grid">
            <div class="record-field">
              <span>カテゴリ</span>
              <strong>${escapeHtml(record.category)}</strong>
            </div>
            <div class="record-field">
              <span>申告分類</span>
              <strong>${escapeHtml(record.taxCategory || "-")}</strong>
            </div>
            <div class="record-field">
              <span>件数</span>
              <strong>${record.type === "sales" ? `${record.deliveries || 0}件` : "-"}</strong>
            </div>
            <div class="record-field">
              <span>時間</span>
              <strong>${record.type === "sales" ? `${Number(record.workHours || 0).toFixed(1)}h` : "-"}</strong>
            </div>
            <div class="record-field">
              <span>エリア</span>
              <strong>${record.type === "sales" ? escapeHtml(record.area || "-") : "-"}</strong>
            </div>
            <div class="record-field">
              <span>稼働時刻</span>
              <strong>${escapeHtml(workTime)}</strong>
            </div>
            <div class="record-field full-width">
              <span>メモ</span>
              <strong>${record.memo ? escapeHtml(record.memo) : "-"}</strong>
            </div>
          </div>
          <div class="record-card-actions">
            <button class="delete-button" type="button" data-id="${record.id}">削除</button>
          </div>
        </article>
      `;
    })
    .join("");

  emptyState.classList.toggle("is-visible", filteredRecords.length === 0);
  renderCalendar();
}

function addRecord(event) {
  event.preventDefault();

  const amount = Number(amountInput.value);
  const deliveries = Number(deliveriesInput.value || 0);
  const calculatedHours = calculateWorkHours(startTimeInput.value, endTimeInput.value);
  const workHours = Number(workHoursInput.value || calculatedHours || 0);

  if (!amount || amount < 0) {
    amountInput.focus();
    return;
  }

  records.push(normalizeRecord({
    id: createId(),
    type: typeInput.value,
    date: dateInput.value,
    amount,
    platform: typeInput.value === "sales" ? platformInput.value : DEFAULT_PLATFORM,
    deliveries: typeInput.value === "sales" ? deliveries : 0,
    workHours: typeInput.value === "sales" ? workHours : 0,
    area: typeInput.value === "sales" ? areaInput.value.trim() : "",
    startTime: typeInput.value === "sales" ? startTimeInput.value : "",
    endTime: typeInput.value === "sales" ? endTimeInput.value : "",
    category: categoryInput.value,
    memo: memoInput.value.trim(),
    createdAt: Date.now()
  }));

  saveRecords();
  form.reset();
  dateInput.value = todayString();
  updateCategoryOptions();
  renderRecords();
  syncData({ silent: true });
}

async function deleteRecord(id) {
  records = records.filter((record) => record.id !== id);
  saveRecords();
  renderRecords();

  if (currentUser && supabaseClient) {
    const { error } = await supabaseClient.from(remoteTable).delete().eq("id", id).eq("user_id", currentUser.id);
    if (error) setSyncStatus(`削除同期エラー: ${error.message}`);
  }
}

function exportCsv() {
  const filteredRecords = getFilteredRecords();
  if (filteredRecords.length === 0) {
    alert("出力できる記録がありません。");
    return;
  }

  const header = ["日付", "種類", "プラットフォーム", "稼働エリア", "開始時刻", "終了時刻", "カテゴリ", "申告分類", "金額", "配達件数", "稼働時間", "メモ"];
  const rows = filteredRecords.map((record) => [
    record.date,
    record.type === "sales" ? "売上" : "経費",
    record.type === "sales" ? record.platform || DEFAULT_PLATFORM : "",
    record.type === "sales" ? record.area || "" : "",
    record.type === "sales" ? record.startTime || "" : "",
    record.type === "sales" ? record.endTime || "" : "",
    record.category,
    record.taxCategory || "",
    record.type === "sales" ? record.amount : -record.amount,
    record.type === "sales" ? record.deliveries || 0 : "",
    record.type === "sales" ? record.workHours || 0 : "",
    record.memo || ""
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `uber-sales-${monthFilter.value || "all"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function setSyncStatus(message) {
  if (syncStatus) syncStatus.textContent = message;
}

function updateAuthUi() {
  if (!authStatus || !googleLoginButton || !logoutButton) return;

  if (!supabaseClient) {
    authStatus.textContent = "未ログイン: Supabase設定が必要です";
    setSyncStatus("supabase-config.js を設定してください");
    googleLoginButton.disabled = true;
    logoutButton.classList.add("is-hidden");
    return;
  }

  if (currentUser) {
    authStatus.textContent = `ログイン中: ${currentUser.email || currentUser.id}`;
    googleLoginButton.classList.add("is-hidden");
    logoutButton.classList.remove("is-hidden");
    setSyncStatus("同期できます");
  } else {
    authStatus.textContent = "未ログイン: この端末に保存中";
    googleLoginButton.classList.remove("is-hidden");
    logoutButton.classList.add("is-hidden");
    setSyncStatus("この端末に保存中");
  }
}

function toRemoteRecord(record) {
  return {
    id: record.id,
    user_id: currentUser.id,
    type: record.type,
    date: record.date,
    amount: record.amount,
    platform: record.platform || DEFAULT_PLATFORM,
    area: record.area || "",
    start_time: record.startTime || "",
    end_time: record.endTime || "",
    deliveries: record.deliveries || 0,
    work_hours: record.workHours || 0,
    category: record.category,
    memo: record.memo || "",
    tax_category: record.taxCategory || "未分類",
    deduction_hint: record.deductionHint || "",
    created_at: new Date(record.createdAt || Date.now()).toISOString(),
    updated_at: new Date().toISOString()
  };
}

function fromRemoteRecord(record) {
  return normalizeRecord({
    id: record.id,
    type: record.type,
    date: record.date,
    amount: record.amount,
    platform: record.platform,
    area: record.area,
    start_time: record.start_time,
    end_time: record.end_time,
    deliveries: record.deliveries,
    work_hours: record.work_hours,
    category: record.category,
    memo: record.memo,
    tax_category: record.tax_category,
    deduction_hint: record.deduction_hint,
    createdAt: record.created_at ? new Date(record.created_at).getTime() : Date.now()
  });
}

function mergeRecords(localRecords, remoteRecords) {
  const merged = new Map();

  [...localRecords, ...remoteRecords].forEach((record) => {
    const current = merged.get(record.id);
    if (!current || Number(record.createdAt || 0) >= Number(current.createdAt || 0)) {
      merged.set(record.id, normalizeRecord(record));
    }
  });

  return [...merged.values()];
}

async function syncData(options = {}) {
  if (!supabaseClient) {
    if (!options.silent) setSyncStatus("Supabase未設定です");
    return;
  }

  if (!currentUser || isSyncing) {
    if (!options.silent && !currentUser) setSyncStatus("ログインしてください");
    return;
  }

  isSyncing = true;
  setSyncStatus("同期中...");

  try {
    const { data: remoteRecords, error: selectError } = await supabaseClient
      .from(remoteTable)
      .select("*")
      .eq("user_id", currentUser.id);

    if (selectError) throw selectError;

    records = mergeRecords(records, (remoteRecords || []).map(fromRemoteRecord));

    if (records.length) {
      const { error: upsertError } = await supabaseClient
        .from(remoteTable)
        .upsert(records.map(toRemoteRecord), { onConflict: "id" });

      if (upsertError) throw upsertError;
    }

    saveRecords();
    await syncSettings({ silent: true });
    renderRecords();
    setSyncStatus(`同期完了: ${records.length}件`);
  } catch (error) {
    setSyncStatus(`同期エラー: ${error.message}`);
  } finally {
    isSyncing = false;
  }
}

async function syncSettings(options = {}) {
  if (!supabaseClient || !currentUser) return;

  const { data, error } = await supabaseClient
    .from(remoteSettingsTable)
    .select("*")
    .eq("user_id", currentUser.id)
    .limit(1);

  if (error) {
    if (!options.silent) setSyncStatus(`設定同期エラー: ${error.message}`);
    return;
  }

  const [remoteSettings] = data || [];
  if (remoteSettings && new Date(remoteSettings.updated_at).getTime() > Number(settings.updatedAt || 0)) {
    settings = normalizeSettings(remoteSettings);
    saveSettings();
    monthlyGoalInput.value = settings.monthlyGoal || "";
  } else {
    await supabaseClient.from(remoteSettingsTable).upsert(
      {
        user_id: currentUser.id,
        monthly_goal: settings.monthlyGoal || 0,
        updated_at: new Date(settings.updatedAt || Date.now()).toISOString()
      },
      { onConflict: "user_id" }
    );
  }
}

async function replaceCloudRecords() {
  if (!supabaseClient || !currentUser) return;

  setSyncStatus("クラウド置き換え中...");
  const { error: deleteError } = await supabaseClient.from(remoteTable).delete().eq("user_id", currentUser.id);
  if (deleteError) {
    setSyncStatus(`復元同期エラー: ${deleteError.message}`);
    return;
  }

  if (!records.length) {
    setSyncStatus("クラウドデータを削除しました");
    return;
  }

  const { error: upsertError } = await supabaseClient
    .from(remoteTable)
    .upsert(records.map(toRemoteRecord), { onConflict: "id" });

  if (upsertError) setSyncStatus(`復元同期エラー: ${upsertError.message}`);
  else setSyncStatus(`クラウド復元完了: ${records.length}件`);
}

async function loginWithGoogle() {
  if (!supabaseClient) {
    setSyncStatus("supabase-config.js を設定してください");
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href.split("#")[0]
    }
  });

  if (error) setSyncStatus(`ログインエラー: ${error.message}`);
}

async function logout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  currentUser = null;
  updateAuthUi();
}

async function initializeSupabase() {
  updateAuthUi();
  if (!supabaseClient) return;

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session ? data.session.user : null;
  updateAuthUi();
  if (currentUser) syncData({ silent: true });

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    updateAuthUi();
    if (currentUser) syncData({ silent: true });
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function recordsFromCsv(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) => {
    const data = headers.reduce((result, header, index) => {
      result[header] = row[index] || "";
      return result;
    }, {});

    const typeText = data["種類"] || data.type || "";
    const amount = Number(data["金額"] || data.amount || 0);
    const type = typeText === "経費" || typeText === "expense" || amount < 0 ? "expense" : "sales";

    return normalizeRecord({
      type,
      date: data["日付"] || data.date,
      amount: Math.abs(amount),
      platform: data["プラットフォーム"] || data.platform,
      area: data["稼働エリア"] || data.area,
      startTime: data["開始時刻"] || data.startTime || data.start_time,
      endTime: data["終了時刻"] || data.endTime || data.end_time,
      deliveries: data["配達件数"] || data.deliveries,
      workHours: data["稼働時間"] || data.workHours || data.work_hours,
      category: data["カテゴリ"] || data.category,
      taxCategory: data["申告分類"] || data.taxCategory,
      memo: data["メモ"] || data.memo
    });
  });
}

function importCsv(file) {
  const reader = new FileReader();

  reader.addEventListener("load", () => {
    const importedRecords = recordsFromCsv(String(reader.result || ""));
    if (!importedRecords.length) {
      alert("取り込めるCSVデータがありません。");
      return;
    }

    records = [...records, ...importedRecords];
    saveRecords();
    renderRecords();
    syncData({ silent: true });
    alert(`${importedRecords.length}件を取り込みました。`);
    csvFileInput.value = "";
  });

  reader.readAsText(file);
}

function backupData() {
  const backup = {
    app: "uber-sales-app",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    records
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `uber-sales-backup-${todayString()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function restoreData(file) {
  const reader = new FileReader();

  reader.addEventListener("load", () => {
    try {
      const data = JSON.parse(String(reader.result || "{}"));
      const restoredRecords = Array.isArray(data) ? data : data.records;

      if (!Array.isArray(restoredRecords)) {
        throw new Error("Invalid backup format");
      }

      if (!confirm("現在のデータをバックアップファイルの内容で置き換えますか？")) {
        restoreFileInput.value = "";
        return;
      }

      records = restoredRecords.map(normalizeRecord);
      if (data.settings) {
        settings = { ...settings, ...data.settings };
        saveSettings();
        monthlyGoalInput.value = settings.monthlyGoal || "";
      }
      saveRecords();
      renderRecords();
      replaceCloudRecords();
      alert(`${records.length}件を復元しました。`);
      restoreFileInput.value = "";
    } catch {
      alert("バックアップファイルを読み込めませんでした。");
    }
  });

  reader.readAsText(file);
}

async function clearData() {
  if (!records.length) return;
  if (!confirm("すべての記録を削除しますか？")) return;

  records = [];
  saveRecords();
  renderRecords();

  if (currentUser && supabaseClient) {
    const { error } = await supabaseClient.from(remoteTable).delete().eq("user_id", currentUser.id);
    if (error) setSyncStatus(`削除同期エラー: ${error.message}`);
    else setSyncStatus("クラウドデータも削除しました");
  }
}

function saveMonthlyGoal() {
  settings.monthlyGoal = Number(monthlyGoalInput.value || 0);
  settings.updatedAt = Date.now();
  saveSettings();
  renderRecords();
  syncSettings({ silent: true });
}

function updateWorkHoursFromTimes() {
  const calculatedHours = calculateWorkHours(startTimeInput.value, endTimeInput.value);
  if (calculatedHours > 0) {
    workHoursInput.value = calculatedHours;
  }
}

function switchScreen(screenName) {
  screens.forEach((screen) => {
    screen.classList.toggle("is-active", screen.dataset.screen === screenName);
  });

  navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.targetScreen === screenName);
  });

  window.scrollTo({ top: 0, behavior: "auto" });
}

form.addEventListener("submit", addRecord);
typeInput.addEventListener("change", updateCategoryOptions);
startTimeInput.addEventListener("change", updateWorkHoursFromTimes);
endTimeInput.addEventListener("change", updateWorkHoursFromTimes);
monthFilter.addEventListener("change", renderRecords);
typeFilter.addEventListener("change", renderRecords);
platformFilter.addEventListener("change", renderRecords);
document.querySelector("#saveGoal").addEventListener("click", saveMonthlyGoal);
if (googleLoginButton) googleLoginButton.addEventListener("click", loginWithGoogle);
if (logoutButton) logoutButton.addEventListener("click", logout);
const syncDataButton = document.querySelector("#syncData");
if (syncDataButton) syncDataButton.addEventListener("click", () => syncData());
navButtons.forEach((button) => {
  button.addEventListener("click", () => switchScreen(button.dataset.targetScreen));
});
document.querySelector("#exportCsv").addEventListener("click", exportCsv);
document.querySelector("#importCsvButton").addEventListener("click", () => csvFileInput.click());
document.querySelector("#backupData").addEventListener("click", backupData);
document.querySelector("#restoreDataButton").addEventListener("click", () => restoreFileInput.click());
document.querySelector("#clearData").addEventListener("click", clearData);

csvFileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) importCsv(file);
});

restoreFileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) restoreData(file);
});

window.addEventListener("online", () => syncData({ silent: true }));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncData({ silent: true });
});

recordsBody.addEventListener("click", (event) => {
  if (event.target.matches(".delete-button")) {
    deleteRecord(event.target.dataset.id);
  }
});

dateInput.value = todayString();
monthFilter.value = currentMonthString();
monthlyGoalInput.value = settings.monthlyGoal || "";
updateCategoryOptions();
updatePlatformFilterOptions();
renderRecords();
initializeSupabase();

// service worker registration removed (kill-switch deployed 2026-07-05));
}

// ===== カレンダー（年→月→日をタップで掘れる）=====
// 初期化順の都合で var + 遅延初期化（renderRecordsの初回呼び出しが先に走るため）
var calCursor;
var calView;
var calSelectedDay;

function calPad(value) {
  return String(value).padStart(2, "0");
}

function calCompactYen(value) {
  if (value >= 10000) return `${Math.round(value / 1000) / 10}万`;
  return `¥${value.toLocaleString("ja-JP")}`;
}

function calDayTotals(dateKey) {
  return records
    .filter((record) => record.date === dateKey)
    .reduce(
      (sum, record) => {
        if (record.type === "sales") {
          sum.sales += record.amount;
          sum.deliveries += record.deliveries || 0;
        } else {
          sum.expenses += record.amount;
        }
        return sum;
      },
      { sales: 0, expenses: 0, deliveries: 0 }
    );
}

function calRangeTotals(prefix) {
  return records
    .filter((record) => record.date.startsWith(prefix))
    .reduce(
      (sum, record) => {
        if (record.type === "sales") sum.sales += record.amount;
        else sum.expenses += record.amount;
        return sum;
      },
      { sales: 0, expenses: 0 }
    );
}

function renderCalendar() {
  const grid = document.querySelector("#calGrid");
  if (!grid) return;
  if (!calCursor) calCursor = new Date();
  if (!calView) calView = "month";

  if (calView === "month") renderCalendarMonth(grid);
  else renderCalendarYear(grid);

  if (calSelectedDay) renderDayDetail(calSelectedDay);
}

function renderCalendarMonth(grid) {
  const year = calCursor.getFullYear();
  const month = calCursor.getMonth();
  const monthKey = `${year}-${calPad(month + 1)}`;
  const totals = calRangeTotals(monthKey);
  const profit = totals.sales - totals.expenses;

  setText("#calTitle", `${year}年${month + 1}月`);
  setText("#calSubtitle", `もうけ ${yen.format(profit)}（稼いだ ${yen.format(totals.sales)} − 経費 ${yen.format(totals.expenses)}）`);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = todayString();

  // 日ごとの売上マップ（ヒートマップ用の最大値も）
  const dayMap = {};
  let maxSales = 1;
  records.forEach((record) => {
    if (!record.date.startsWith(monthKey) || record.type !== "sales") return;
    dayMap[record.date] = (dayMap[record.date] || 0) + record.amount;
    if (dayMap[record.date] > maxSales) maxSales = dayMap[record.date];
  });
  const expenseDays = new Set(
    records.filter((r) => r.date.startsWith(monthKey) && r.type === "expense").map((r) => r.date)
  );

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"]
    .map((label, index) => {
      const color = index === 0 ? "var(--red)" : index === 6 ? "#0EA5E9" : "var(--text-3)";
      return `<span class="cal-weekday" style="color:${color}">${label}</span>`;
    })
    .join("");

  let cells = "";
  for (let blank = 0; blank < firstDay; blank += 1) {
    cells += `<span class="cal-cell is-blank"></span>`;
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${monthKey}-${calPad(day)}`;
    const sales = dayMap[dateKey] || 0;
    const heat = sales ? (0.12 + (sales / maxSales) * 0.3).toFixed(2) : 0;
    const classes = [
      "cal-cell",
      dateKey === todayKey ? "is-today" : "",
      dateKey === calSelectedDay ? "is-selected" : ""
    ].join(" ");
    const style = sales ? `style="background:rgba(16,185,129,${heat})"` : "";
    cells += `
      <button type="button" class="${classes}" data-cal-day="${dateKey}" ${style}>
        <span class="cal-day-num">${day}</span>
        ${sales ? `<span class="cal-day-amt">${calCompactYen(sales)}</span>` : ""}
        ${!sales && expenseDays.has(dateKey) ? `<span class="cal-day-dot"></span>` : ""}
      </button>
    `;
  }

  grid.innerHTML = `
    <div class="cal-weekdays">${weekdays}</div>
    <div class="cal-cells">${cells}</div>
  `;
}

function renderCalendarYear(grid) {
  const year = calCursor.getFullYear();
  const totals = calRangeTotals(String(year));
  const profit = totals.sales - totals.expenses;

  setText("#calTitle", `${year}年`);
  setText("#calSubtitle", `年間のもうけ ${yen.format(profit)}（稼いだ ${yen.format(totals.sales)} − 経費 ${yen.format(totals.expenses)}）`);

  let cells = "";
  for (let month = 0; month < 12; month += 1) {
    const monthKey = `${year}-${calPad(month + 1)}`;
    const monthTotals = calRangeTotals(monthKey);
    const isCurrent = calCursor.getMonth() === month;
    cells += `
      <button type="button" class="yr-cell ${isCurrent ? "is-current" : ""}" data-cal-month="${month}">
        <span class="cal-day-num">${month + 1}月</span>
        <span class="cal-day-amt">${monthTotals.sales ? calCompactYen(monthTotals.sales) : "-"}</span>
      </button>
    `;
  }

  grid.innerHTML = `<div class="yr-grid">${cells}</div>`;
}

function renderDayDetail(dateKey) {
  const panel = document.querySelector("#dayDetailPanel");
  if (!panel) return;

  const dayRecords = records
    .filter((record) => record.date === dateKey)
    .sort((a, b) => b.createdAt - a.createdAt);
  const totals = calDayTotals(dateKey);
  const profit = totals.sales - totals.expenses;

  panel.hidden = false;
  setText("#dayDetailTitle", `${Number(dateKey.slice(5, 7))}月${Number(dateKey.slice(8))}日（${getWeekdayLabel(dateKey)}）の記録`);
  setText(
    "#dayDetailSummary",
    dayRecords.length
      ? `もうけ ${yen.format(profit)}（稼いだ ${yen.format(totals.sales)} − 経費 ${yen.format(totals.expenses)}）`
      : "この日の記録はまだありません"
  );

  const list = document.querySelector("#dayDetailList");
  list.innerHTML = dayRecords
    .map((record) => {
      const isSales = record.type === "sales";
      const title = isSales ? record.platform || DEFAULT_PLATFORM : record.category;
      const metaParts = [];
      if (isSales && record.deliveries) metaParts.push(`${record.deliveries}件`);
      if (isSales && record.startTime && record.endTime) metaParts.push(`${record.startTime}-${record.endTime}`);
      if (isSales && record.area) metaParts.push(record.area);
      if (!isSales) metaParts.push(record.taxCategory || "経費");
      if (record.memo) metaParts.push(record.memo);
      return `
        <div class="day-rec">
          <div class="day-rec-main">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(metaParts.join(" ・ ") || "-")}</span>
          </div>
          <b class="day-rec-amount ${isSales ? "" : "is-expense"}">${isSales ? "" : "-"}${yen.format(record.amount)}</b>
        </div>
      `;
    })
    .join("");
}

function shiftCalendar(step) {
  if (!calCursor) calCursor = new Date();
  if (calView === "year") calCursor = new Date(calCursor.getFullYear() + step, calCursor.getMonth(), 1);
  else calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + step, 1);
  calSelectedDay = null;
  const panel = document.querySelector("#dayDetailPanel");
  if (panel) panel.hidden = true;
  renderCalendar();
}

const calGridElement = document.querySelector("#calGrid");
if (calGridElement) {
  document.querySelector("#calPrev").addEventListener("click", () => shiftCalendar(-1));
  document.querySelector("#calNext").addEventListener("click", () => shiftCalendar(1));

  document.querySelectorAll("#calViewToggle .type-btn").forEach((button) => {
    button.addEventListener("click", () => {
      calView = button.dataset.calView;
      document.querySelectorAll("#calViewToggle .type-btn").forEach((b) => {
        b.classList.toggle("is-active", b === button);
      });
      renderCalendar();
    });
  });

  calGridElement.addEventListener("click", (event) => {
    const dayCell = event.target.closest("[data-cal-day]");
    if (dayCell) {
      calSelectedDay = dayCell.dataset.calDay;
      renderCalendar();
      return;
    }
    const monthCell = event.target.closest("[data-cal-month]");
    if (monthCell) {
      calCursor = new Date(calCursor.getFullYear(), Number(monthCell.dataset.calMonth), 1);
      calView = "month";
      document.querySelectorAll("#calViewToggle .type-btn").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.calView === "month");
      });
      renderCalendar();
    }
  });

  renderCalendar();
}
