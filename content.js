(() => {
  const THINK_RE = /Thought for\s+\d+\s+seconds/i;

  function normalizeText(t) {
    return (t || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();
  }

  function isAssistantMessage(msgEl) {
    if (!msgEl) return false;

    // Final answer markdown (NOT inside ds-think-content)
    const hasFinalMarkdown = !!msgEl.querySelector(
      ".ds-markdown:not(.ds-think-content .ds-markdown)"
    );
    if (hasFinalMarkdown) return true;

    // Fallback: DeepThink marker text
    const t = (msgEl.innerText || "").trim();
    return THINK_RE.test(t);
  }

  function getFinalAnswerFromMessage(msgEl) {
    // Some messages have multiple ds-markdown blocks.
    // Reasoning lives inside .ds-think-content, answer lives outside it.
    const markdowns = Array.from(msgEl.querySelectorAll(".ds-markdown"));
    const finals = markdowns.filter(md => !md.closest(".ds-think-content"));
    if (finals.length === 0) return "";

    const combined = finals
      .map(md => normalizeText(md.innerText || ""))
      .filter(Boolean)
      .join("\n\n");

    return normalizeText(combined);
  }

  function trimChapterHeaderSmart(text) {
    const lines = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

    const firstNonEmptyIndex = lines.findIndex(l => (l || "").trim() !== "");
    if (firstNonEmptyIndex < 0) return { text: "", trimmed: false };

    const first = (lines[firstNonEmptyIndex] || "").trim();

    // No Chapter header, do nothing
    if (!/^chapter\b/i.test(first)) {
      return { text: normalizeText(lines.join("\n")), trimmed: false };
    }

    // Case A: "Chapter One: Title..." on one line -> remove ONLY that line
    const hasInlineTitle = /:\s*\S+/.test(first);
    if (hasInlineTitle) {
      const kept = lines.slice(0, firstNonEmptyIndex).concat(lines.slice(firstNonEmptyIndex + 1));
      return { text: normalizeText(kept.join("\n")), trimmed: true };
    }

    // Case B: "Chapter 1:" then "Title" then body
    const nonEmptyIdxs = [];
    for (let i = 0; i < lines.length; i++) {
      if ((lines[i] || "").trim() !== "") nonEmptyIdxs.push(i);
    }

    if (nonEmptyIdxs.length >= 2) {
      const titleIdx = nonEmptyIdxs[1];
      const titleLine = (lines[titleIdx] || "").trim();

      // Heuristic: title is usually short and not ending with punctuation like a sentence
      const isShortTitle = titleLine.length <= 120;
      const looksNotBody = !/[.!?]\s*$/.test(titleLine);

      if (isShortTitle && looksNotBody) {
        const kept = lines.filter((_, i) => i !== firstNonEmptyIndex && i !== titleIdx);
        return { text: normalizeText(kept.join("\n")), trimmed: true };
      }
    }

    // Fallback: remove only the "Chapter..." line
    const kept = lines.slice(0, firstNonEmptyIndex).concat(lines.slice(firstNonEmptyIndex + 1));
    return { text: normalizeText(kept.join("\n")), trimmed: true };
  }

  async function buildPayload(options) {
    const messages = Array.from(document.querySelectorAll("div.ds-message"));
    const assistantMsgs = messages.filter(isAssistantMessage);

    const chunks = [];
    let trimmedCount = 0;
    let reasoningSkippedCount = 0;

    for (const msg of assistantMsgs) {
      if (msg.querySelector(".ds-think-content")) reasoningSkippedCount += 1;

      let out = getFinalAnswerFromMessage(msg);
      out = normalizeText(out);
      if (!out) continue;

      if (options?.trimChapter) {
        const tr = trimChapterHeaderSmart(out);
        out = tr.text;
        if (tr.trimmed) trimmedCount += 1;
      }

      out = normalizeText(out);
      if (out) chunks.push(out);
    }

    // Skip first 2 replies if requested (the usual acknowledgement + chapter list)
    let finalChunks = chunks;
    if (options?.skipFirstTwo) finalChunks = chunks.slice(2);

    // 2 blank line gaps between replies means 3 newlines
    const sep = options?.twoGaps ? "\n\n\n" : "\n\n";

    return {
      ok: true,
      text: finalChunks.join(sep).trim(),
      replyCount: finalChunks.length,
      trimmedCount,
      reasoningRemovedCount: reasoningSkippedCount
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg?.type !== "lazyCopy") return;
      const res = await buildPayload(msg.options || {});
      sendResponse(res);
    })();
    return true;
  });
})();
