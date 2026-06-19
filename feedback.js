const FEEDBACK_MAIL_TO = "feedback@example.com";

function openMail(subject, body) {
  const url = `mailto:${FEEDBACK_MAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
}

function saveLocalFeedback(type, payload) {
  const key = "delivery-app-beta-feedback";
  const current = JSON.parse(localStorage.getItem(key) || "[]");
  current.push({ type, payload, createdAt: new Date().toISOString() });
  localStorage.setItem(key, JSON.stringify(current));
}

const feedbackForm = document.querySelector("#feedbackForm");
if (feedbackForm) {
  feedbackForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = {
      goodPoint: document.querySelector("#goodPoint").value.trim(),
      improvementPoint: document.querySelector("#improvementPoint").value.trim(),
      featureRequest: document.querySelector("#featureRequest").value.trim()
    };
    saveLocalFeedback("feedback", payload);
    document.querySelector("#feedbackMessage").textContent = "フィードバックを保存しました。メールアプリを開きます。";
    openMail(
      "デリログ ご意見・ご要望",
      `良かった点:\n${payload.goodPoint}\n\n改善点:\n${payload.improvementPoint}\n\n欲しい機能:\n${payload.featureRequest}`
    );
  });
}

const contactForm = document.querySelector("#contactForm");
if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = {
      name: document.querySelector("#contactName").value.trim(),
      email: document.querySelector("#contactEmail").value.trim(),
      message: document.querySelector("#contactMessage").value.trim()
    };
    saveLocalFeedback("contact", payload);
    document.querySelector("#contactStatus").textContent = "お問い合わせ内容を保存しました。メールアプリを開きます。";
    openMail(
      "デリログ お問い合わせ",
      `お名前:\n${payload.name || "未入力"}\n\n返信先:\n${payload.email || "未入力"}\n\n内容:\n${payload.message}`
    );
  });
}
