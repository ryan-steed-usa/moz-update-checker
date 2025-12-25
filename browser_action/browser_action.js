// BrowserAction script
"use strict";

// Functions
function calculateRelativeTime(timestamp) {
  if (typeof timestamp === "number") {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    let relativeTime;
    if (diffDay > 0)
      relativeTime = `${diffDay} ${browser.i18n.getMessage(`relativeDay${diffDay > 1 ? "s" : ""}`)} ${browser.i18n.getMessage("relativeAgo")}`;
    else if (diffHr > 0)
      relativeTime = `${diffHr} ${browser.i18n.getMessage(`relativeHour${diffHr > 1 ? "s" : ""}`)} ${browser.i18n.getMessage("relativeAgo")}`;
    else if (diffMin > 0)
      relativeTime = `${diffMin} ${browser.i18n.getMessage(`relativeMinute${diffMin > 1 ? "s" : ""}`)} ${browser.i18n.getMessage("relativeAgo")}`;
    else relativeTime = browser.i18n.getMessage("relativeNow");

    return relativeTime;
  }
}

function changeImage(imageId) {
  const element = document.getElementById("status_image");
  if (element) {
    element.alt = `${imageId.toLowerCase()}`;
    element.src = `../${ICON_PATHS[imageId]}`;
  }
}

function configureInfoDetails() {
  const infoDetails = document.getElementById("info_details");
  if (infoDetails) {
    infoDetails.open = false;
  }
}

function hideElement(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.add("hidden");
  }
}

async function init() {
  const cached = await browser.storage.local.get("is_latest");
  const running = await browser.storage.local.get("is_running");
  if (cached.is_latest) {
    updatePage({
      useCache: true,
      isLatest: cached.is_latest.result,
      isRunning: running.expires === "number" ? true : false,
      latestVersion: cached.is_latest.latest,
      lastChecked: cached.is_latest.timestamp,
    });
  }

  showTooltip("#img_tooltip.tooltip_text");

  await refreshResult(true);
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

  // Set unknown status
  if (!useCache) {
    await updatePage({});
  }

  // Fire runChecker
  await browser.runtime.sendMessage({
    action: "runChecker",
    use_cache: useCache,
  });
}

function setTextContent(elementId, text) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text || "";
  }
}

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

function showElement(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.remove("hidden");
  }
}

function showLatestVersion(latestVersion) {
  if (typeof latestVersion === "string") {
    setTextContent("latest_version", latestVersion);
  } else {
    setTextContent("latest_version", "UNKNOWN");
  }
}

function startEventListeners() {
  // Open settings page
  const settingsButton = document.getElementById("open_settings_page");
  if (settingsButton) {
    settingsButton.addEventListener("click", openSettingsPage);
  }
  // Refresh result
  const imageButton = document.getElementById("status_image");
  if (imageButton) {
    imageButton.addEventListener("click", async () => {
      await refreshResult(false);
    });
  }
  // Listen for response
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === "runCheckerRefresh") {
      if (DEV_MODE)
        console.debug(
          "browser_action event listener received runCheckerRefresh message:",
          message,
        );
      configureInfoDetails();
      updatePage(message.result);
    }
    return true;
  });
}

function showTooltip(selector) {
  const element = document.querySelector(selector);
  if (element) {
    // show tooltip
    element.classList.add("show-tooltip");
    // close tooltip after 2 seconds automatically
    setTimeout(() => {
      element.classList.remove("show-tooltip");
    }, 1000);
  }
}

async function updatePage(response) {
  const useCache = response.useCache;
  if (!useCache) {
    // Temporary status
    hideElement("error_status");
    showElement("loading_spinner");
    changeImage("img");
    showLatestVersion("UNKNOWN");
  }

  const isLatest = response.isLatest;
  const isRunning = response.isRunning;
  const latestVersion = response.latestVersion;
  const lastChecked = response.lastChecked;
  const errorCause = response.errorCause;
  const infoDetails = document.getElementById("info_details");

  if (isRunning) {
    showElement("loading_spinner");
  }

  if (DEV_MODE)
    console.debug(
      "browser_action updatePage(): runChecker response:",
      response,
    );
  if (DEV_MODE && errorCause)
    console.debug(
      "browser_action updatePage(): runChecker errorCause:",
      errorCause,
    );

  // Show browser information
  showBrowserInfo(latestVersion);

  // Show version information
  showLatestVersion(latestVersion);

  if (typeof lastChecked === "number") {
    const dateChecked = new Date(lastChecked).toLocaleString();
    const relativeDateChecked = calculateRelativeTime(lastChecked);
    setTextContent("checked_tooltip", dateChecked);
    setTextContent(
      "last_checked",
      `${browser.i18n.getMessage("lastChecked")} ${relativeDateChecked}`,
    );
    showTooltip("#img_tooltip.tooltip_text");
  }

  if (isLatest === true) {
    hideElement("loading_spinner");
    changeImage("ok");
  } else if (isLatest !== true && errorCause && isRunning !== true) {
    hideElement("loading_spinner");
    changeImage("error");
    showElement("error_status");
    showLatestVersion("ERROR");
    if (errorCause === "unsupported")
      setTextContent(
        "error_status",
        browser.i18n.getMessage("unsupportedBrowser"),
      );
    if (errorCause === "timedout")
      setTextContent(
        "error_status",
        browser.i18n.getMessage("notificationContentErrTimedOut"),
      );
  } else if (isLatest === null) {
    hideElement("loading_spinner");
    changeImage("error");
    showElement("error_status");
    showLatestVersion("ERROR");
  } else if (isLatest === false) {
    hideElement("loading_spinner");
    changeImage("warn");

    // Open details when update detected
    if (infoDetails) infoDetails.open = true;
  } else {
    changeImage("unknown");
    showLatestVersion("UNKNOWN");
  }
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
