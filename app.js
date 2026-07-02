(function () {
  const ENTRY_STORAGE_KEY = "noesia-persona-calendar-v1";
  const SETTINGS_STORAGE_KEY = "noesia-persona-calendar-settings-v1";
  const DEFAULT_CHAT_API_URL =
    window.APP_CONFIG?.defaultChatApiUrl || "https://noesia.onrender.com/v1/chat";

  const state = {
    currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selectedDateKey: toDateKey(new Date()),
    entries: loadEntries(),
    settings: loadSettings(),
  };

  const elements = {
    modeBadge: document.getElementById("modeBadge"),
    monthLabel: document.getElementById("monthLabel"),
    calendarGrid: document.getElementById("calendarGrid"),
    selectedDateLabel: document.getElementById("selectedDateLabel"),
    memoInput: document.getElementById("memoInput"),
    replyOutput: document.getElementById("replyOutput"),
    tokenInfo: document.getElementById("tokenInfo"),
    apiKeyInput: document.getElementById("apiKeyInput"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
    clearSettingsBtn: document.getElementById("clearSettingsBtn"),
    settingsMessage: document.getElementById("settingsMessage"),
    prevMonthBtn: document.getElementById("prevMonthBtn"),
    nextMonthBtn: document.getElementById("nextMonthBtn"),
    saveMemoBtn: document.getElementById("saveMemoBtn"),
    generateReplyBtn: document.getElementById("generateReplyBtn"),
    clearEntryBtn: document.getElementById("clearEntryBtn"),
  };

  init();

  function init() {
    elements.prevMonthBtn.addEventListener("click", () => {
      state.currentMonth = new Date(
        state.currentMonth.getFullYear(),
        state.currentMonth.getMonth() - 1,
        1
      );
      renderCalendar();
    });

    elements.nextMonthBtn.addEventListener("click", () => {
      state.currentMonth = new Date(
        state.currentMonth.getFullYear(),
        state.currentMonth.getMonth() + 1,
        1
      );
      renderCalendar();
    });

    elements.saveMemoBtn.addEventListener("click", saveMemo);
    elements.generateReplyBtn.addEventListener("click", generateReply);
    elements.clearEntryBtn.addEventListener("click", clearEntry);
    elements.saveSettingsBtn.addEventListener("click", saveSettings);
    elements.clearSettingsBtn.addEventListener("click", clearSettings);

    renderAll();
  }

  function renderAll() {
    renderSettings();
    renderCalendar();
    renderSelectedEntry();
  }

  function renderSettings() {
    elements.modeBadge.textContent = getModeLabel();
    elements.apiKeyInput.value = state.settings.apiKey;
  }

  function renderCalendar() {
    const year = state.currentMonth.getFullYear();
    const month = state.currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();

    elements.monthLabel.textContent = formatMonthLabel(state.currentMonth);
    elements.calendarGrid.innerHTML = "";

    for (let i = 0; i < 42; i += 1) {
      const date = new Date(year, month, i - startOffset + 1);
      const dateKey = toDateKey(date);
      const entry = state.entries[dateKey];
      const isCurrentMonth = date.getMonth() === month;
      const isSelected = dateKey === state.selectedDateKey;
      const isToday = dateKey === toDateKey(new Date());

      const button = document.createElement("button");
      button.type = "button";
      button.className = "day-cell";

      if (!isCurrentMonth) button.classList.add("is-outside");
      if (isSelected) button.classList.add("is-selected");
      if (isToday) button.classList.add("is-today");

      const flags = [];
      if (entry?.memo) flags.push('<span class="flag">メモ</span>');
      if (entry?.reply) flags.push('<span class="flag">AI</span>');

      button.innerHTML = `
        <span class="day-number">${date.getDate()}</span>
        <div class="day-flags">${flags.join("")}</div>
      `;

      button.addEventListener("click", () => {
        state.selectedDateKey = dateKey;
        if (!isCurrentMonth) {
          state.currentMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        }
        renderAll();
      });

      elements.calendarGrid.appendChild(button);
    }
  }

  function renderSelectedEntry() {
    const entry = state.entries[state.selectedDateKey];

    elements.selectedDateLabel.textContent = formatDateLabel(state.selectedDateKey);
    elements.memoInput.value = entry?.memo || "";

    if (entry?.reply) {
      elements.replyOutput.textContent = entry.reply;
      elements.replyOutput.classList.remove("empty");
    } else {
      elements.replyOutput.textContent = "まだコメントはありません。";
      elements.replyOutput.classList.add("empty");
    }

    elements.tokenInfo.textContent = entry?.tokensUsed ? `tokens: ${entry.tokensUsed}` : "";
  }

  function saveMemo() {
    const entry = ensureEntry(state.selectedDateKey);
    entry.memo = elements.memoInput.value.trim();
    persistEntries();
    renderAll();
  }

  async function generateReply() {
    const entry = ensureEntry(state.selectedDateKey);
    const memo = elements.memoInput.value.trim();
    const message =
      memo || "今日はまだメモがありません。この人格ならどんな短いコメントを返すか日本語で答えてください。";

    setReplyLoading(true);

    try {
      const context = buildContext(state.selectedDateKey);
      const response = await requestReply(message, context);
      entry.memo = memo;
      entry.reply = response.reply;
      entry.tokensUsed = response.tokensUsed || 0;
      entry.requestId = response.requestId || "";
      persistEntries();
      renderAll();
    } catch (error) {
      elements.replyOutput.textContent = `コメント生成に失敗しました: ${error.message}`;
      elements.replyOutput.classList.remove("empty");
    } finally {
      setReplyLoading(false);
    }
  }

  function clearEntry() {
    delete state.entries[state.selectedDateKey];
    persistEntries();
    renderAll();
  }

  function saveSettings() {
    state.settings.apiKey = elements.apiKeyInput.value.trim();
    persistSettings();
    renderSettings();
    elements.settingsMessage.textContent = state.settings.apiKey
      ? "APIキーを保存しました。このブラウザから noesia API を直接呼び出します。"
      : "APIキーが未設定のため Demo モードのまま動作します。";
  }

  function clearSettings() {
    state.settings = { apiKey: "" };
    persistSettings();
    renderSettings();
    elements.settingsMessage.textContent = "接続設定を消去しました。Demo モードに戻りました。";
  }

  async function requestReply(message, context) {
    if (state.settings.apiKey) {
      return requestDirectReply(message, context);
    }

    if (window.APP_CONFIG?.mode === "api" && window.APP_CONFIG?.noesiaProxyUrl) {
      return requestProxyReply(message, context);
    }

    return buildDemoReply(message, context);
  }

  async function requestDirectReply(message, context) {
    const response = await fetch(DEFAULT_CHAT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": state.settings.apiKey,
      },
      body: JSON.stringify({
        message,
        context,
        lang: "ja",
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorMessage = await safeErrorMessage(response);
      throw new Error(errorMessage || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return normalizeReplyData(data);
  }

  async function requestProxyReply(message, context) {
    const response = await fetch(window.APP_CONFIG.noesiaProxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        context,
        lang: "ja",
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorMessage = await safeErrorMessage(response);
      throw new Error(errorMessage || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return normalizeReplyData(data);
  }

  function normalizeReplyData(data) {
    return {
      reply: data.reply || "応答が空でした。",
      tokensUsed: data.tokens_used || 0,
      requestId: data.request_id || "",
    };
  }

  function buildDemoReply(message, context) {
    const previousMemo = context
      .filter((item) => item.role === "user")
      .slice(-1)
      .map((item) => item.content)
      .join("");

    let tone = "落ち着いた反応で返すと、この人格の雰囲気を見やすそうです。";

    if (/[!！]/.test(message)) {
      tone = "少し勢いのある返しにすると、この人格らしさを確認しやすそうです。";
    } else if (/疲|眠|しんど|だる/.test(message)) {
      tone = "やわらかく気づかう返しにすると、人格の自然さを見やすそうです。";
    } else if (/うれ|楽|最高|良かった/.test(message)) {
      tone = "前向きな温度感を保つ返しにすると、人格らしさが出やすそうです。";
    }

    const continuity = previousMemo
      ? `前の流れとして「${previousMemo}」もあるので、そのつながりも見比べられます。`
      : "まだ前の流れがないので、まずは単発の反応を見る形です。";

    return Promise.resolve({
      reply: `${tone}\n\n${continuity}\n\n同じ内容を少し言い換えて何回か試すと、返答のぶれが見やすくなります。`,
      tokensUsed: Math.max(80, Math.min(220, message.length * 4)),
      requestId: "demo-mode",
    });
  }

  function buildContext(selectedDateKey) {
    return Object.values(state.entries)
      .filter((entry) => entry.date < selectedDateKey && entry.reply)
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .slice(-3)
      .flatMap((entry) => [
        {
          role: "user",
          content:
            entry.memo ||
            "その日は特にメモなし。人格の自然なひとことコメントだけを確認した。",
        },
        { role: "assistant", content: entry.reply },
      ]);
  }

  function loadEntries() {
    try {
      return JSON.parse(localStorage.getItem(ENTRY_STORAGE_KEY) || "{}");
    } catch (error) {
      return {};
    }
  }

  function loadSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
      return { apiKey: parsed.apiKey || "" };
    } catch (error) {
      return { apiKey: "" };
    }
  }

  function ensureEntry(dateKey) {
    if (!state.entries[dateKey]) {
      state.entries[dateKey] = {
        date: dateKey,
        memo: "",
        reply: "",
        tokensUsed: 0,
        requestId: "",
      };
    }

    return state.entries[dateKey];
  }

  function persistEntries() {
    localStorage.setItem(ENTRY_STORAGE_KEY, JSON.stringify(state.entries));
  }

  function persistSettings() {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
  }

  function setReplyLoading(isLoading) {
    elements.generateReplyBtn.disabled = isLoading;
    elements.generateReplyBtn.textContent = isLoading ? "生成中..." : "AIコメントを生成";
  }

  function getModeLabel() {
    if (state.settings.apiKey) return "Direct API";
    if (window.APP_CONFIG?.mode === "api" && window.APP_CONFIG?.noesiaProxyUrl) {
      return "Proxy API";
    }
    return "Demo";
  }

  async function safeErrorMessage(response) {
    try {
      const data = await response.json();
      return data?.error?.message || data?.message || "";
    } catch (error) {
      return "";
    }
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDateLabel(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  }

  function formatMonthLabel(date) {
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
    });
  }
})();
