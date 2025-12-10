// BrowserAction script
"use strict";

// Constants
const TABLE_WIDTH_OFFSET = 120;
const DEFAULT_TABLE_WIDTH = 420;

// Functions
function showElement(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.remove("hidden");
  }
}

function hideElement(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.add("hidden");
  }
}

function hideElements(selector) {
  const elements = document.querySelectorAll(selector);

  // Loop and hide all matching elements
  elements.forEach((element) => {
    element.classList.add("hidden");
  });
}

function setTextContent(elementId, text) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text || "";
  }
}

function resizeTables() {
  try {
    const versionTable = document.getElementById("version_table");
    if (!versionTable) return;

    const width =
      versionTable.offsetWidth + TABLE_WIDTH_OFFSET || DEFAULT_TABLE_WIDTH;
    const elements = ["info_details", "info_table", "footer_table"];

    elements.forEach((elementId) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.style.width = `${width}px`;
      }
    });
  } catch (error) {
    console.error(
      "browser_action resizeTables(): error resizing tables:",
      error,
    );
  }
}

function openSettingsPage() {
  browser.runtime.openOptionsPage().catch((error) => {
    console.error(
      "browser_action openSettingsPage(): failed to open settings page:",
      error,
    );
  });
}

async function refreshResult(useCache = false) {
  // Update UI elements
  configureInfoDetails();

  // Check for updates and wait for completion
  await updateCheck(useCache);

  // Resize tables
  resizeTables();
}

// Main functions
async function showBrowserInfo(latestVersion) {
  try {
    const { name, version } = await browser.runtime.getBrowserInfo();
    const isESR = latestVersion?.includes("esr");
    setTextContent("browser_version", version);

    if (SUPPORTED_BROWSERS.includes(name)) {
      showElement(name);
    }
    if (isESR) {
      showElement("ESR");
    }
  } catch (error) {
    console.error(
      "browser_action showBrowserInfo(): failed to get browser info:",
      error,
    );
  }
}

function configureInfoDetails() {
  const infoDetails = document.getElementById("info_details");
  if (infoDetails) {
    infoDetails.open = false;
  }
}

async function updateCheck(useCache = true) {
  // Temporary status
  hideElements("[id^='img_']");
  showElement("img_unknown");

  const response = await browser.runtime.sendMessage({
    action: "runChecker",
    use_cache: useCache,
  });
  const isLatest = response.success;
  const latestVersion = response.latest;
  const errorCause = response.error;

  if (DEV_MODE)
    console.debug(
      "browser_action updateCheck(): runChecker response:",
      response,
    );
  if (DEV_MODE && errorCause)
    console.debug(
      "browser_action updateCheck(): runChecker errorCause:",
      errorCause,
    );

  // Show browser information
  showBrowserInfo(latestVersion);

  // Show version information
  showLatestVersion(latestVersion);

  if (isLatest === true) {
    hideElement("img_unknown");
    showElement("img_ok");
    return;
  } else if (isLatest !== true && errorCause) {
    hideElement("img_unknown");
    showElement("img_error");
    if (errorCause === "unsupported") showElement("unsupported_browser");
    return;
  } else if (isLatest === null) {
    hideElement("img_unknown");
    showElement("img_error");
    return;
  } else if (isLatest === false) {
    hideElement("img_unknown");
    showElement("img_warning");
  }

  // Open details when update detected
  const infoDetails = document.getElementById("info_details");
  if (infoDetails) {
    infoDetails.open = true;
  }
}

function showLatestVersion(latestVersion) {
  if (typeof latestVersion === "string") {
    setTextContent("latest_version", latestVersion);
  } else {
    setTextContent("latest_version", "ERROR");
  }
}

async function init() {
  await refreshResult(true);
}

// Events
function startEventListeners() {
  // Open settings page
  const settingsButton = document.getElementById("open_settings_page");
  if (settingsButton) {
    settingsButton.addEventListener("click", openSettingsPage);
  }
  // Refresh result
  const refreshButtons = document.querySelectorAll("[id^='img_']");
  refreshButtons.forEach((element) => {
    element.addEventListener("click", async () => {
      await refreshResult(false);
    });
  });
  // Listen for refresh
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "performRefresh") {
      if (DEV_MODE)
        console.debug(`Performing refresh from tab: ${message.from_tab}`);
      (async () => {
        setTimeout(() => {
          window.location.reload();
        });
        sendResponse({ success: true });
      })();
    }
    return true;
  });
}

// Wait for DOM
document.addEventListener("DOMContentLoaded", () => {
  // Translate
  if (typeof i18nTranslator === "function") {
    i18nTranslator();
  }

  // Main
  init().catch((error) => {
    console.error("browser_action init(): failed:", error);
  });

  // Event listeners
  startEventListeners();
});
