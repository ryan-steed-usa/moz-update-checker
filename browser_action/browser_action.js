// BrowserAction script
"use strict";

// Functions
const getElement = (id) => document.getElementById(id);

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

function changeImage(element, imageId) {
  if (element) {
    element.alt = `${imageId.toLowerCase()}`;
    element.src = `../${ICON_PATHS[imageId]}`;
  }
}

function configureInfoDetails(element) {
  if (element) {
    element.open = false;
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

  showTooltip(getElement("img_tooltip"));

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
  configureInfoDetails(getElement("info_details"));

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

function setTextContent(element, text) {
  if (element) {
    element.textContent = text || "";
  }
}

async function showBrowserInfo(latestVersion) {
  try {
    const { name, version } = await browser.runtime.getBrowserInfo();
    const isESR = latestVersion?.includes("esr");
    setTextContent(getElement("browser_version"), version);

    if (SUPPORTED_BROWSERS.includes(name)) {
      showElement(name);
    }
    if (isESR) {
      showElement(getElement("ESR"));
    }
  } catch (error) {
    console.error(
      "browser_action showBrowserInfo(): failed to get browser info:",
      error,
    );
  }
}

function showLatestVersion(latestVersion) {
  if (typeof latestVersion === "string") {
    setTextContent(getElement("latest_version"), latestVersion);
  } else {
    setTextContent(getElement("latest_version"), "UNKNOWN");
  }
}

function startEventListeners() {
  // Open settings page
  const settingsButton = getElement("open_settings_page");
  if (settingsButton) {
    settingsButton.addEventListener("click", openSettingsPage);
  }
  // Refresh result
  const imageButton = getElement("status_image");
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
      configureInfoDetails(getElement("info_details"));
      updatePage(message.result);
    }
    return true;
  });
}

function showTooltip(element) {
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
    hideElement(getElement("error_status"));
    showElement(getElement("loading_spinner"));
    changeImage(getElement("status_image"), "img");
    showLatestVersion("UNKNOWN");
  }

  const isLatest = response.isLatest;
  const isRunning = response.isRunning;
  const latestVersion = response.latestVersion;
  const lastChecked = response.lastChecked;
  const errorCause = response.errorCause;
  const infoDetails = getElement("info_details");

  if (isRunning) {
    showElement(getElement("loading_spinner"));
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
    setTextContent(getElement("checked_tooltip"), dateChecked);
    setTextContent(
      getElement("last_checked"),
      `${browser.i18n.getMessage("lastChecked")} ${relativeDateChecked}`,
    );
    showTooltip(getElement("img_tooltip"));
  }

  if (isLatest === true) {
    hideElement(getElement("loading_spinner"));
    changeImage(getElement("status_image"), "ok");
  } else if (isLatest !== true && errorCause && isRunning !== true) {
    hideElement(getElement("loading_spinner"));
    changeImage(getElement("status_image"), "error");
    showElement(getElement("error_status"));
    showLatestVersion("ERROR");
    if (errorCause === "unsupported")
      setTextContent(
        getElement("error_status"),
        browser.i18n.getMessage("unsupportedBrowser"),
      );
  } else if (isLatest === null) {
    hideElement(getElement("loading_spinner"));
    changeImage(getElement("status_image"), "error");
    showElement(getElement("error_status"));
    showLatestVersion("ERROR");
  } else if (isLatest === false) {
    hideElement(getElement("loading_spinner"));
    changeImage(getElement("status_image"), "warn");

    // Open details when update detected
    if (infoDetails) infoDetails.open = true;
  } else {
    changeImage(getElement("status_image"), "unknown");
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
