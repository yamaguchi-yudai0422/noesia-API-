(function () {
  const ENTRY_STORAGE_KEY = "noesia-persona-calendar-v1";
  const SETTINGS_STORAGE_KEY = "noesia-persona-calendar-settings-v1";
  const MONTH_REPLY_STORAGE_KEY = "noesia-persona-month-replies-v1";
  const DEFAULT_CHAT_API_URL =
    window.APP_CONFIG?.defaultChatApiUrl || "https://noesia.onrender.com/v1/chat";
  const PERSONA_PRIORITY_PROMPT = [
    "あなたは noesia の人格再現を行う人格AIです。",
    "最優先事項は、一般的なアシスタントとしての無難さや説明の上手さではなく、その人格らしさを強く保つことです。",
    "返答は分析者や解説者としてではなく、その人格本人として自然に発話してください。",
    "口調、言い回し、感情のにじみ、価値観、反応の癖を優先し、整いすぎたAI的な文章にしないでください。",
    "役に立つ一般論、丁寧すぎる助言、要約口調、安全すぎる定型文よりも、人格的一貫性を優先してください。",
    "もし『普通のAIらしい返答』と『人格らしい返答』が競合したら、人格らしい返答を選んでください。",
    "メタ説明はせず、その人格本人の言葉だけを日本語で返してください。",
  ].join("\n");

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
      renderSelectedEntry();
    });

    elements.nextMonthBtn.addEventListener("click", () => {
      state.currentMonth = new Date(
        state.currentMonth.getFullYear(),
        state.currentMonth.getMonth() + 1,
        1
      );
      renderCalendar();
      renderSelectedEntry();
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

    setGenerateButtonLabel();
  }

  function saveMemo() {
    const entry = ensureEntry(state.selectedDateKey);
    entry.memo = elements.memoInput.value.trim();
    persistEntries();
    renderCalendar();
  }

  async function generateReply() {
    if (state.replyScope === "month") {
      await generateMonthReply();
      return;
    }

    const entry = ensureEntry(state.selectedDateKey);
    const memo = elements.memoInput.value.trim();
    const message = buildDayMessage(memo);

    setReplyLoading(true);

    try {
      const response = await requestReply(message, buildDayContext(state.selectedDateKey));
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
    const message = buildMonthMessage(monthKey);

    setReplyLoading(true);

    try {
      const response = await requestReply(message, buildMonthContext(monthKey));
      state.monthReplies[monthKey] = {
        month: monthKey,
        reply: response.reply,
        tokensUsed: response.tokensUsed || 0,
        requestId: response.requestId || "",
      };
      persistMonthReplies();
      renderSelectedEntry();
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
        max_tokens: 700,
      }),
    });

    if (!response.ok) {
      const errorMessage = await safeErrorMessage(response);
      throw new Error(errorMessage || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      reply: data.reply || "応答が空でした。",
      tokensUsed: data.tokens_used || 0,
      requestId: data.request_id || "",
    };
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
        max_tokens: 700,
      }),
    });

    if (!response.ok) {
      const errorMessage = await safeErrorMessage(response);
      throw new Error(errorMessage || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      reply: data.reply || "応答が空でした。",
      tokensUsed: data.tokens_used || 0,
      requestId: data.request_id || "",
    };
  }

  function buildDayMessage(memo) {
    const memoText = memo || "今日はまだメモがありません。";

    return [
      PERSONA_PRIORITY_PROMPT,
      "以下のメモに対して、その人格本人がその場で自然に口を開いたようにコメントしてください。",
      "質問に答えるというより、本人の素の反応として返してください。",
      "コメントは短すぎず長すぎない、自然なひとことから数文程度にしてください。",
      "",
      "今日のメモ:",
      memoText,
    ].join("\n");
  }

  function buildMonthMessage(monthKey) {
    const monthEntries = Object.values(state.entries)
      .filter((entry) => entry.date.startsWith(monthKey))
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    if (monthEntries.length === 0) {
      return [
        PERSONA_PRIORITY_PROMPT,
        "一般的な月次サマリーではなく、その人格本人としてこの月にひとこと言うように自然に話してください。",
        "まとめ役や分析役にはならず、本人の気分や視点がにじむコメントにしてください。",
        "コメントは日本語で数文にしてください。",
        "",
        `${monthKey} の記録はまだありません。`,
        "記録がない月に対しても、その人格らしい自然なコメントを返してください。",
      ].join("\n");
    }

    const memoLines = monthEntries.map((entry) => `${entry.date}: ${entry.memo || "メモなし"}`);

    return [
      PERSONA_PRIORITY_PROMPT,
      "一般的で整いすぎた月次総括ではなく、その人格本人としてこの月全体にコメントしてください。",
      "要約や整理よりも、本人の気分、関心、反応の偏りがにじむコメントを優先してください。",
      "分析者のように箇条書きで整理せず、人格本人の自然なコメントとして返してください。",
      "コメントは日本語で数文にしてください。",
      "",
      `${monthKey} の記録:`,
      memoLines.join("\n"),
    ].join("\n");
  }

  function buildDayContext(selectedDateKey) {
    return Object.values(state.entries)
      .filter((entry) => entry.date < selectedDateKey && entry.reply)
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .slice(-4)
      .flatMap((entry) => [
        {
          role: "user",
          content: buildDayMessage(
            entry.memo || "その日は特にメモなし。自然な短いコメントだけを求めた。"
          ),
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
        {
          role: "user",
          content: [
            PERSONA_PRIORITY_PROMPT,
            `${reply.month} の月全体に対して、その人格本人としてコメントしてください。`,
          ].join("\n"),
        },
        { role: "assistant", content: reply.reply },
      ]);
  }

  function buildDemoReply(message, context) {
    const hasMonthPrompt = message.includes("月全体");
    const previousReply = context.slice(-1)[0]?.content || "";

    const opening = hasMonthPrompt
      ? "この月の流れを見ると、ちょっとその人格の気分や視点がにじむ返し方の方が合いそうです。"
      : "この内容なら、説明っぽく整えすぎずに、その人格の地の反応を出した方が自然です。";

    const continuity = previousReply
      ? `直前までの返しもあるので、その空気を切らさず続けるのがよさそうです。`
      : "まだ比較材料が少ないので、まずは人格の口調をはっきり出すのがよさそうです。";

    return Promise.resolve({
      reply: `${opening}\n\n${continuity}\n\n無難な案内より、その人格本人がぽろっと言いそうな言い回しを優先して返すと、再現度を見やすくなります。`,
      tokensUsed: Math.max(100, Math.min(260, message.length * 3)),
      requestId: "demo-mode",
    });
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
      return JSON.parse(localStorage.getItem(MONTH_REPLY_STORAGE_KEY) || "{}");
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
    localStorage.setItem(MONTH_REPLY_STORAGE_KEY, JSON.stringify(state.monthReplies));
  }

  function setReplyLoading(isLoading) {
    elements.generateReplyBtn.disabled = isLoading;
    elements.generateReplyBtn.textContent = isLoading ? "生成中..." : getGenerateButtonLabel();
  }

  function setGenerateButtonLabel() {
    elements.generateReplyBtn.textContent = getGenerateButtonLabel();
  }

  function getGenerateButtonLabel() {
    return state.replyScope === "month" ? "この月にコメント" : "AIコメントを生成";
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

  function getMonthKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
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

  function setReplyScope(scope) {
    state.replyScope = scope;
    renderSelectedEntry();
  }

  function syncScopeButtons() {
    elements.dayScopeBtn.classList.toggle("is-active", state.replyScope === "day");
    elements.monthScopeBtn.classList.toggle("is-active", state.replyScope === "month");
  }
})();
