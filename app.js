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
    monthReplies: loadMonthReplies(),
    replyScope: "day",
  };

  const elements = {
    modeBadge: document.getElementById("modeBadge"),
    monthLabel: document.getElementById("monthLabel"),
    calendarGrid: document.getElementById("calendarGrid"),
    selectedDateLabel: document.getElementById("selectedDateLabel"),
    memoInput: document.getElementById("memoInput"),
    replyOutput: document.getElementById("replyOutput"),
    replySectionLabel: document.getElementById("replySectionLabel"),
    tokenInfo: document.getElementById("tokenInfo"),
    apiKeyInput: document.getElementById("apiKeyInput"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
    clearSettingsBtn: document.getElementById("clearSettingsBtn"),
    dayScopeBtn: document.getElementById("dayScopeBtn"),
    monthScopeBtn: document.getElementById("monthScopeBtn"),
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
    elements.dayScopeBtn.addEventListener("click", () => setReplyScope("day"));
    elements.monthScopeBtn.addEventListener("click", () => setReplyScope("month"));

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
    const monthReply = state.monthReplies[getMonthKey(state.currentMonth)];

    elements.selectedDateLabel.textContent = formatDateLabel(state.selectedDateKey);
    elements.memoInput.value = entry?.memo || "";
    elements.replySectionLabel.textContent =
      state.replyScope === "month" ? "AIコメント（この月）" : "AIコメント（この日）";
    syncScopeButtons();

    if (state.replyScope === "month" && monthReply?.reply) {
      elements.replyOutput.textContent = monthReply.reply;
      elements.replyOutput.classList.remove("empty");
    } else if (state.replyScope === "day" && entry?.reply) {
      elements.replyOutput.textContent = entry.reply;
      elements.replyOutput.classList.remove("empty");
    } else {
      elements.replyOutput.textContent = "まだコメントはありません。";
      elements.replyOutput.classList.add("empty");
    }

    if (state.replyScope === "month" && monthReply?.tokensUsed) {
      elements.tokenInfo.textContent = `tokens: ${monthReply.tokensUsed}`;
    } else if (state.replyScope === "day" && entry?.tokensUsed) {
      elements.tokenInfo.textContent = `tokens: ${entry.tokensUsed}`;
    } else {
      elements.tokenInfo.textContent = "";
    }
  }

  function saveMemo() {
    const entry = ensureEntry(state.selectedDateKey);
    entry.memo = elements.memoInput.value.trim();
    persistEntries();
    renderAll();
  }

  async function generateReply() {
    if (state.replyScope === "month") {
      return generateMonthReply();
    }

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

  async function generateMonthReply() {
    const monthKey = getMonthKey(state.currentMonth);
    const monthMessage = buildMonthMessage(monthKey);

    setReplyLoading(true);

    try {
      const response = await requestReply(monthMessage, buildMonthContext(monthKey));
      state.monthReplies[monthKey] = {
        month: monthKey,
        reply: response.reply,
        tokensUsed: response.tokensUsed || 0,
        requestId: response.requestId || "",
      };
      persistMonthReplies();
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

  function buildMonthContext(currentMonthKey) {
    return Object.values(state.monthReplies)
      .filter((reply) => reply.month < currentMonthKey && reply.reply)
      .sort((a, b) => (a.month > b.month ? 1 : -1))
      .slice(-2)
      .flatMap((reply) => [
        { role: "user", content: `${reply.month} のまとめコメントを依頼した。` },
        { role: "assistant", content: reply.reply },
      ]);
  }

  function buildMonthMessage(monthKey) {
    const monthEntries = Object.values(state.entries)
      .filter((entry) => entry.date.startsWith(monthKey))
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    if (monthEntries.length === 0) {
      return `${monthKey} の記録はまだありません。この月全体に対する短いコメントを日本語で返してください。`;
    }

    const memoLines = monthEntries.map((entry) => {
      const memo = entry.memo || "メモなし";
      return `${entry.date}: ${memo}`;
    });

    return [
      `${monthKey} の記録をまとめて見て、この月全体へのコメントを日本語で返してください。`,
      "日ごとの記録:",
      memoLines.join("\n"),
    ].join("\n\n");
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

  function loadMonthReplies() {
    try {
      return JSON.parse(localStorage.getItem("noesia-persona-month-replies-v1") || "{}");
    } catch (error) {
      return {};
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

  function persistMonthReplies() {
    localStorage.setItem(
      "noesia-persona-month-replies-v1",
      JSON.stringify(state.monthReplies)
    );
  }

  function setReplyLoading(isLoading) {
    elements.generateReplyBtn.disabled = isLoading;
    elements.generateReplyBtn.textContent = isLoading
      ? "生成中..."
      : state.replyScope === "month"
        ? "この月にコメント"
        : "AIコメントを生成";
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

  function getMonthKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function setReplyScope(scope) {
    state.replyScope = scope;
    renderSelectedEntry();
    setReplyLoading(false);
  }

  function syncScopeButtons() {
    elements.dayScopeBtn.classList.toggle("is-active", state.replyScope === "day");
    elements.monthScopeBtn.classList.toggle("is-active", state.replyScope === "month");
  }
})();
