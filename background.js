const MAX_DYNAMIC_RULES = 5000;
const BLOCK_PRIORITY = 1;

const BLOCKED_PAGE_URL = chrome.runtime.getURL("blocked.html");

async function rebuildRules() {
  try {
    const sync = await chrome.storage.sync.get(["enabled", "blockedDomains", "disabledBlockedDomains", "redirectEnabled", "redirectUrl", "showBlockPage"]);
    if (!sync.enabled) { await clearAllRules(); return; }

    let redirectUrl = null;
    if (sync.redirectEnabled && sync.redirectUrl) {
      redirectUrl = sync.redirectUrl;
    } else if (sync.showBlockPage) {
      redirectUrl = BLOCKED_PAGE_URL;
    }
    const action = redirectUrl
      ? { type: "redirect", redirect: { url: redirectUrl } }
      : { type: "block" };

    const manualDisabled = new Set((sync.disabledBlockedDomains || []).map(d => d.toLowerCase()));
    const blockSources = [...new Set((sync.blockedDomains || []).map(d => d.toLowerCase()))].filter(d => !manualDisabled.has(d));

    const available = MAX_DYNAMIC_RULES;
    const blockRules = blockSources.slice(0, Math.max(0, available)).map((d, i) => ({ id: 10000 + i, priority: BLOCK_PRIORITY, action, condition: { urlFilter: `||${d}` } }));

    const allRules = blockRules;
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map(r => r.id), addRules: allRules });
    await chrome.storage.local.set({ stats: { totalRules: allRules.length, blockRules: blockRules.length, totalBlockSources: blockSources.length, truncated: blockSources.length > blockRules.length } });
  } catch (e) {
    console.error("Domain Blocker: rebuildRules failed", e);
  }
}

async function clearAllRules() {
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    if (existing.length > 0) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map(r => r.id) });
    await chrome.storage.local.set({ stats: { totalRules: 0, blockRules: 0, totalBlockSources: 0, truncated: false } });
  } catch (e) {
    console.error("Domain Blocker: clearAllRules failed", e);
  }
}

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const data = await chrome.storage.sync.get(["blockedDomains", "pinHash"]);
    if (!Array.isArray(data.blockedDomains)) {
      await chrome.storage.sync.set({ enabled: true, blockedDomains: [], disabledBlockedDomains: [], redirectEnabled: false, redirectUrl: "", enabledPresets: [], showBlockPage: false });
    }
    if (!data.pinHash) await chrome.storage.sync.set({ pinHash: await hashPin("0000") });
  } catch (e) {
    console.error("Domain Blocker: onInstalled init failed", e);
  }
  await rebuildRules();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  rebuildRules().catch(e => console.error("Domain Blocker: onChanged handler failed", e));
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "rebuildRules") { rebuildRules().then(sendResponse).catch(() => sendResponse(false)); return true; }
  if (msg.type === "getStats") { chrome.storage.local.get("stats").then(r => sendResponse(r.stats)).catch(() => sendResponse(null)); return true; }
  if (msg.type === "verifyPin") {
    (async () => {
      try {
        const { pinHash } = await chrome.storage.sync.get("pinHash");
        if (!pinHash) { sendResponse({ valid: true }); return; }
        sendResponse({ valid: (await hashPin(msg.pin)) === pinHash });
      } catch (e) { sendResponse({ valid: false }); }
    })();
    return true;
  }
  if (msg.type === "changePin") {
    (async () => {
      if (!/^\d{4}$/.test(msg.newPin)) { sendResponse({ success: false, error: "4桁の数字を入力してください" }); return; }
      await chrome.storage.sync.set({ pinHash: await hashPin(msg.newPin) });
      sendResponse({ success: true });
    })();
    return true;
  }
});
