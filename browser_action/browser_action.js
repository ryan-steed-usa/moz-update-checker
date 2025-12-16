// BrowserAction script
"use strict";

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
  await updatePage({});

  // Fire runChecker
  await browser.runtime.sendMessage({
    action: "runChecker",
    use_cache: useCache,
  });
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

async function updatePage(response) {
  // Temporary status
  hideElements("[id^='img_']");
  hideElement("error_status");
  showElement("img_unknown");
  showLatestVersion("UNKNOWN");

  const isLatest = response.isLatest;
  const latestVersion = response.latestVersion;
  const lastChecked = response.lastChecked;
  const errorCause = response.errorCause;
  const infoDetails = document.getElementById("info_details");

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
    setTextContent(
      "last_checked",
      `${browser.i18n.getMessage("lastChecked")} ${dateChecked}`,
    );
  }

  if (isLatest === true) {
    hideElement("img_unknown");
    showElement("img_ok");
  } else if (isLatest !== true && errorCause) {
    hideElement("img_unknown");
    showElement("img_error");
    showElement("error_status");
    showLatestVersion("ERROR");
    if (errorCause === "unsupported")
      setTextContent(
        "error_status",
        browser.i18n.getMessage("unsupportedBrowser"),
      );
  } else if (isLatest === null) {
    hideElement("img_unknown");
    showElement("img_error");
    showElement("error_status");
    showLatestVersion("ERROR");
  } else if (isLatest === false) {
    hideElement("img_unknown");
    showElement("img_warning");

    // Open details when update detected
    if (infoDetails) infoDetails.open = true;
  }
}

function showLatestVersion(latestVersion) {
  if (typeof latestVersion === "string") {
    setTextContent("latest_version", latestVersion);
  } else {
    setTextContent("latest_version", "UNKNOWN");
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
