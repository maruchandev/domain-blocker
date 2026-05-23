async function bg(method, data = {}) {
  return chrome.runtime.sendMessage({ type: method, ...data });
}

async function loadData() {
  const sync = await chrome.storage.sync.get(["enabled", "whitelistedDomains", "blockedDomains", "disabledBlockedDomains", "redirectEnabled", "redirectUrl", "pinHash"]);
  return { sync };
}

async function renderGlobalToggle() {
  const { sync } = await loadData();
  document.getElementById("global-toggle").checked = sync.enabled !== false;
}

async function renderWhitelist() {
  const { sync } = await loadData();
  const list = sync.whitelistedDomains || [];
  const el = document.getElementById("whitelist-list");
  el.innerHTML = "";
  if (list.length === 0) { el.innerHTML = '<div class="empty-msg">Allowlist is empty</div>'; return; }
  for (const d of [...list].sort()) {
    const div = document.createElement("div"); div.className = "list-item";
    const name = document.createElement("span"); name.className = "name"; name.textContent = d;
    const btn = document.createElement("button"); btn.className = "btn-icon"; btn.textContent = "\u00d7";
    btn.onclick = async () => {
      if (!confirm(`Remove "${d}" from allowlist?`)) return;
      await chrome.storage.sync.set({ whitelistedDomains: list.filter(x => x !== d) });
      renderAll();
    };
    div.appendChild(name); const actions = document.createElement("div"); actions.className = "actions"; actions.appendChild(btn); div.appendChild(actions);
    el.appendChild(div);
  }
}

async function renderBlocklist() {
  const { sync } = await loadData();
  const list = sync.blockedDomains || [];
  const disabled = new Set((sync.disabledBlockedDomains || []).map(d => d.toLowerCase()));
  const el = document.getElementById("blocklist-list");
  el.innerHTML = "";
  if (list.length === 0) { el.innerHTML = '<div class="empty-msg">Blocklist is empty</div>'; return; }
  for (const d of [...list].sort()) {
    const div = document.createElement("div"); div.className = "list-item";
    const name = document.createElement("span"); name.className = "name"; name.textContent = d;
    name.style.textDecoration = disabled.has(d.toLowerCase()) ? "line-through" : "none";
    name.style.color = disabled.has(d.toLowerCase()) ? "#adb5bd" : "inherit";
    const actions = document.createElement("div"); actions.className = "actions";

    const toggle = document.createElement("label"); toggle.className = "d-toggle";
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !disabled.has(d.toLowerCase());
    cb.onchange = async () => {
      const { sync } = await loadData();
      const dd = sync.disabledBlockedDomains || [];
      const dl = d.toLowerCase();
      await chrome.storage.sync.set({ disabledBlockedDomains: cb.checked ? dd.filter(x => x !== dl) : [...new Set([...dd, dl])] });
    };
    const slider = document.createElement("span"); slider.className = "slider";
    toggle.appendChild(cb); toggle.appendChild(slider);

    const btn = document.createElement("button"); btn.className = "btn-icon"; btn.textContent = "\u00d7";
    btn.onclick = async () => {
      if (!confirm(`Remove "${d}" from blocklist?`)) return;
      const { sync } = await loadData();
      await chrome.storage.sync.set({ blockedDomains: list.filter(x => x !== d), disabledBlockedDomains: (sync.disabledBlockedDomains || []).filter(x => x !== d.toLowerCase()) });
      renderAll();
    };
    actions.appendChild(toggle); actions.appendChild(btn);
    div.appendChild(name); div.appendChild(actions);
    el.appendChild(div);
  }
}

async function renderRedirect() {
  const { sync } = await loadData();
  document.getElementById("redirect-toggle").checked = sync.redirectEnabled || false;
  document.getElementById("redirect-url-input").value = sync.redirectUrl || "";
}

async function renderAll() {
  renderGlobalToggle();
  renderWhitelist();
  renderBlocklist();
  renderRedirect();
}

function showStatus(elId, msg, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = "submit-status " + (type || "");
  setTimeout(() => { el.textContent = ""; el.className = "submit-status"; }, 3000);
}

// ===== Event Handlers =====

document.getElementById("global-toggle").addEventListener("change", async (e) => {
  await chrome.storage.sync.set({ enabled: e.target.checked });
});

document.getElementById("whitelist-add-btn").addEventListener("click", async () => {
  const input = document.getElementById("whitelist-input");
  const domain = input.value.trim().toLowerCase();
  if (!domain) return;
  const { sync } = await loadData();
  const list = sync.whitelistedDomains || [];
  if (list.includes(domain)) { showStatus("whitelist-status", "Already in allowlist", "err"); return; }
  list.push(domain);
  await chrome.storage.sync.set({ whitelistedDomains: list });
  input.value = "";
  renderAll();
});
document.getElementById("whitelist-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("whitelist-add-btn").click();
});

document.getElementById("blocklist-add-btn").addEventListener("click", async () => {
  const input = document.getElementById("blocklist-input");
  const domain = input.value.trim().toLowerCase();
  if (!domain) return;
  const { sync } = await loadData();
  const list = sync.blockedDomains || [];
  if (list.includes(domain)) { showStatus("blocklist-status", "Already in blocklist", "err"); return; }
  list.push(domain);
  await chrome.storage.sync.set({ blockedDomains: list });
  input.value = "";
  renderAll();
});
document.getElementById("blocklist-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("blocklist-add-btn").click();
});

document.getElementById("redirect-save-btn").addEventListener("click", async () => {
  const enabled = document.getElementById("redirect-toggle").checked;
  const url = document.getElementById("redirect-url-input").value.trim();
  if (enabled && !/^https?:\/\//.test(url)) { showStatus("redirect-status", "Enter a valid URL (http/https)", "err"); return; }
  await chrome.storage.sync.set({ redirectEnabled: enabled, redirectUrl: url });
  showStatus("redirect-status", "Saved", "ok");
});

document.getElementById("pin-change-btn").addEventListener("click", async () => {
  const newPin = document.getElementById("pin-new-change").value;
  const confirm = document.getElementById("pin-confirm-change").value;
  if (newPin !== confirm) { showStatus("pin-status-msg", "PINs do not match", "err"); return; }
  const { success, error } = await bg("changePin", { newPin });
  if (success) {
    showStatus("pin-status-msg", "PIN changed", "ok");
    document.getElementById("pin-new-change").value = "";
    document.getElementById("pin-confirm-change").value = "";
  } else {
    showStatus("pin-status-msg", error || "Failed", "err");
  }
});

// ===== PIN Overlay =====

let pinResolve = null;
const pinPromise = new Promise((resolve) => { pinResolve = resolve; });

async function checkPin() {
  const { sync } = await loadData();
  if (!sync.pinHash) { pinResolve(); return; }

  const overlay = document.getElementById("pin-overlay");
  const input = document.getElementById("pin-field");
  const error = document.getElementById("pin-error");

  overlay.classList.remove("hidden");
  input.focus();

  let verifying = false;
  async function verify() {
    if (verifying) return;
    const pin = input.value;
    if (pin.length !== 4) { error.textContent = "Enter 4 digits"; return; }
    verifying = true;
    const { valid } = await bg("verifyPin", { pin });
    if (valid) {
      overlay.classList.add("hidden");
      pinResolve();
    } else {
      error.textContent = "Incorrect PIN";
      input.value = "";
      input.focus();
    }
    verifying = false;
  }

  input.addEventListener("input", () => {
    error.textContent = "";
    if (input.value.length === 4) verify();
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") verify(); });
}

// ===== Init =====
(async () => {
  await checkPin();
  await pinPromise;

  try {
    const { pendingDomain, pendingAction } = await chrome.storage.session.get(["pendingDomain", "pendingAction"]);
    if (pendingDomain && pendingAction) {
      await chrome.storage.session.remove(["pendingDomain", "pendingAction"]);
      if (pendingAction === "allow") {
        document.getElementById("whitelist-input").value = pendingDomain;
        document.getElementById("whitelist-input").focus();
      } else if (pendingAction === "block") {
        document.getElementById("blocklist-input").value = pendingDomain;
        document.getElementById("blocklist-input").focus();
      }
    }
  } catch (_) {}

  renderAll();
})();
