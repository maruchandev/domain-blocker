const MAX_DYNAMIC_RULES = 5000;
const ALLOW_PRIORITY = 10;
const BLOCK_PRIORITY = 1;
const RESOURCE_TYPES = ["main_frame", "sub_frame", "script", "image", "stylesheet", "object", "xmlhttprequest", "other"];

async function rebuildRules() {
  const sync = await chrome.storage.sync.get(["enabled", "blockedDomains", "whitelistedDomains", "disabledBlockedDomains", "redirectEnabled", "redirectUrl"]);
  if (!sync.enabled) { await clearAllRules(); return; }

  const action = sync.redirectEnabled && sync.redirectUrl
    ? { type: "redirect", redirect: { url: sync.redirectUrl } }
    : { type: "block" };

  const whitelisted = (sync.whitelistedDomains || []).map(d => d.toLowerCase());
  const whitelistSet = new Set(whitelisted);
  const manualDisabled = new Set((sync.disabledBlockedDomains || []).map(d => d.toLowerCase()));
  let blockSources = [...new Set((sync.blockedDomains || []).map(d => d.toLowerCase()))].filter(d => !manualDisabled.has(d));
  blockSources = [...new Set(blockSources)].filter(d => !whitelistSet.has(d));

  const allowRules = whitelisted.map((d, i) => ({ id: 1 + i, priority: ALLOW_PRIORITY, action: { type: "allow" }, condition: { urlFilter: `||${d}`, resourceTypes: RESOURCE_TYPES } }));
  const available = MAX_DYNAMIC_RULES - allowRules.length;
  const blockRules = blockSources.slice(0, Math.max(0, available)).map((d, i) => ({ id: 10000 + i, priority: BLOCK_PRIORITY, action, condition: { urlFilter: `||${d}`, resourceTypes: RESOURCE_TYPES } }));

  const allRules = [...allowRules, ...blockRules];
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map(r => r.id), addRules: allRules });
  await chrome.storage.local.set({ stats: { totalRules: allRules.length, allowRules: allowRules.length, blockRules: blockRules.length, totalBlockSources: blockSources.length, truncated: blockSources.length > blockRules.length } });
}

async function clearAllRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  if (existing.length > 0) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map(r => r.id) });
  await chrome.storage.local.set({ stats: { totalRules: 0, allowRules: 0, blockRules: 0, totalBlockSources: 0, truncated: false } });
}

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

chrome.runtime.onInstalled.addListener(async () => {
  const { filters, pinHash } = await chrome.storage.sync.get(["filters", "pinHash"]);
  if (!filters) {
    await chrome.storage.sync.set({ enabled: true, blockedDomains: [], whitelistedDomains: [], redirectEnabled: false, redirectUrl: "" });
  }
  if (!pinHash) await chrome.storage.sync.set({ pinHash: await hashPin("0000") });
  await rebuildRules();
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "sync") return;
  await rebuildRules();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "rebuildRules") { rebuildRules().then(sendResponse); return true; }
  if (msg.type === "getStats") { chrome.storage.local.get("stats").then(r => sendResponse(r.stats)); return true; }
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
