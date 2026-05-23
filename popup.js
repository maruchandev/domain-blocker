async function getCurrentDomain() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  try { return new URL(tab.url).hostname; } catch { return null; }
}

function openOptions(domain, action) {
  chrome.storage.session.set({ pendingDomain: domain, pendingAction: action }).then(() => {
    chrome.runtime.openOptionsPage();
  });
}

async function render() {
  const { enabled, whitelistedDomains, blockedDomains, disabledBlockedDomains } = await chrome.storage.sync.get(["enabled", "whitelistedDomains", "blockedDomains", "disabledBlockedDomains"]);

  document.getElementById("toggle").checked = enabled !== false;

  const domain = await getCurrentDomain();
  const domainEl = document.getElementById("current-domain");
  const statusEl = document.getElementById("domain-status");
  const wlBtn = document.getElementById("whitelist-btn");
  const blBtn = document.getElementById("block-btn");

  if (!domain) {
    domainEl.textContent = "No page detected";
    statusEl.textContent = "Open a web page to manage it";
    return;
  }

  domainEl.textContent = domain;
  const isWL = (whitelistedDomains || []).includes(domain);
  const isBL = (blockedDomains || []).includes(domain) && !(disabledBlockedDomains || []).includes(domain);

  wlBtn.style.display = "none";
  blBtn.style.display = "none";

  if (isWL) {
    statusEl.textContent = "This site is allowed";
    blBtn.style.display = "";
    blBtn.className = "btn btn-outline";
    blBtn.textContent = "Add to blocklist";
    blBtn.onclick = () => openOptions(domain, "block");
  } else if (isBL) {
    statusEl.textContent = "This site is blocked";
    wlBtn.style.display = "";
    wlBtn.className = "btn btn-primary";
    wlBtn.textContent = "Add to allowlist";
    wlBtn.onclick = () => openOptions(domain, "allow");
  } else {
    statusEl.textContent = "No rule set for this site";
    wlBtn.style.display = "";
    wlBtn.className = "btn btn-primary";
    wlBtn.textContent = "Allow this site";
    wlBtn.onclick = () => openOptions(domain, "allow");
    blBtn.style.display = "";
    blBtn.className = "btn btn-outline";
    blBtn.textContent = "Block this site";
    blBtn.onclick = () => openOptions(domain, "block");
  }
}

document.getElementById("toggle").addEventListener("change", async (e) => {
  await chrome.storage.sync.set({ enabled: e.target.checked });
});

document.getElementById("options-link").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
