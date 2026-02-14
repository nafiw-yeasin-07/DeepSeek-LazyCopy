function qs(id) { return document.getElementById(id); }

const DEFAULTS = {
  trimChapter: true,
  twoGaps: true,
  skipFirstTwo: true
};

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id || null;
}

async function sendToContent(msg) {
  const tabId = await getActiveTabId();
  if (!tabId) return null;
  try { return await chrome.tabs.sendMessage(tabId, msg); }
  catch { return null; }
}

function setStatus(text) {
  qs("status").innerHTML = 'Status: <span class="pill">' + text + "</span>";
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}

function readUI() {
  return {
    trimChapter: !!qs("trimChapter").checked,
    twoGaps: !!qs("twoGaps").checked,
    skipFirstTwo: !!qs("skipFirstTwo").checked
  };
}

function applyUI(s) {
  qs("trimChapter").checked = !!s.trimChapter;
  qs("twoGaps").checked = !!s.twoGaps;
  qs("skipFirstTwo").checked = !!s.skipFirstTwo;
}

function saveSettings(s) {
  return chrome.storage.local.set({ settings: s });
}

function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(["settings"], (res) => {
      resolve(res.settings || null);
    });
  });
}

async function init() {
  const saved = await loadSettings();
  const settings = saved ? { ...DEFAULTS, ...saved } : { ...DEFAULTS };
  applyUI(settings);

  // save immediately so first run persists defaults
  await saveSettings(settings);

  // persist changes live
  ["trimChapter", "twoGaps", "skipFirstTwo"].forEach(id => {
    qs(id).addEventListener("change", async () => {
      await saveSettings(readUI());
    });
  });
}

init();

qs("copy").addEventListener("click", async () => {
  setStatus("working…");
  qs("meta").textContent = "";

  const opts = readUI();

  const res = await sendToContent({
    type: "lazyCopy",
    options: opts
  });

  if (!res || !res.ok) {
    setStatus("open chat.deepseek.com");
    return;
  }

  const chars = (res.text || "").length;
  if (chars === 0) {
    setStatus("no replies found");
    qs("meta").textContent = "Scroll up to load replies, then try again.";
    return;
  }

  const ok = await copyTextToClipboard(res.text || "");
  if (!ok) {
    setStatus("copy failed");
    qs("meta").textContent = "Clipboard blocked. Try Chrome desktop or allow clipboard.";
    return;
  }

  setStatus("copied ✅");
  qs("meta").textContent =
    "replies " + (res.replyCount || 0) +
    " | reasoning removed " + (res.reasoningRemovedCount || 0) +
    " | chapter trimmed " + (res.trimmedCount || 0) +
    " | chars " + chars;
});
