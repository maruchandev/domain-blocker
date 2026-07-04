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
  const { enabled, blockedDomains, disabledBlockedDomains } = await chrome.storage.sync.get(["enabled", "blockedDomains", "disabledBlockedDomains"]);

  document.getElementById("toggle").checked = enabled !== false;

  const domain = await getCurrentDomain();
  const domainEl = document.getElementById("current-domain");
  const statusEl = document.getElementById("domain-status");
  const blBtn = document.getElementById("block-btn");

  if (!domain) {
    domainEl.textContent = "No page detected";
    statusEl.textContent = "Open a web page to manage it";
    return;
  }

  domainEl.textContent = domain;
  const isBL = (blockedDomains || []).includes(domain) && !(disabledBlockedDomains || []).includes(domain);

  blBtn.style.display = "none";

  if (isBL) {
    statusEl.textContent = "This site is blocked";
  } else {
    statusEl.textContent = "No rule set for this site";
    blBtn.style.display = "";
    blBtn.className = "btn btn-outline";
    blBtn.textContent = "Block this site";
    blBtn.onclick = () => openOptions(domain, "block");
  }
}

document.getElementById("toggle").addEventListener("change", (e) => {
  chrome.storage.sync.set({ enabled: e.target.checked }).catch(console.error);
});

document.getElementById("options-link").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
