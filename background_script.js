// Background script
"use strict";

// Constants
const BROWSER_ACTION_POPUP_HTML = "browser_action/browser_action.html";

// Run the update check
async function runChecker(useCache = false, scheduled = true) {
  if (DEV_MODE)
    console.debug(
      `background_script runChecker(): checking for updates, useCache: ${useCache}`,
    );
  setBrowserStatus("unknown");
  const isLatest = await updateChecker.isLatest(useCache);
  const latestVersion = await updateChecker.latestVersion;
  const resultError = await updateChecker.error;
  const resultCause = await updateChecker.error?.cause;
  if (isLatest === true) {
    setBrowserStatus("ok");
  } else if (isLatest !== true && resultCause) {
    setBrowserStatus("error");
  } else if (isLatest === null) {
    setBrowserStatus("error");
  } else if (isLatest === false) {
    setBrowserStatus("warning");
  }
  if (scheduled && isLatest !== true) sendNotification();
  return {
    isLatest: isLatest,
    latestVersion: latestVersion,
    error: resultError,
    errorCause: resultCause,
  };
}

// Initialize, loading settings, set defaults, start background processes
async function init(status) {
  const defaultSettings = {
    alert_type: "both",
    alarm_schedule: "720",
  };

  const clearStates = ["is_latest", "is_running"];
  clearStates.forEach(async (key) => {
    await browser.storage.local.remove(key);
  });

  try {
    // Load settings
    const storedSettings = await browser.storage.sync.get(
      Object.keys(defaultSettings),
    );

    const updatesNeeded = {};
    let hasInvalidValues = false;

    // Validate settings
    for (const [key, defaultValue] of Object.entries(defaultSettings)) {
      const currentValue = storedSettings[key];

      const isValid = (() => {
        switch (key) {
          case "alert_type":
            return ["both", "disabled", "tab", "notif"].includes(currentValue);
          case "alarm_schedule":
            return (
              typeof currentValue === "string" &&
              /^\d+$/.test(currentValue) &&
              parseInt(currentValue, 10) >= 240
            );
          default:
            return false;
        }
      })();

      if (!isValid) {
        updatesNeeded[key] = defaultValue;
        hasInvalidValues = true;
      }
    }

    if (hasInvalidValues) {
      console.error(
        "background_script init(): resetting default options",
        updatesNeeded,
      );
      await browser.storage.sync.set(updatesNeeded);
    }

    // Local storage permits manual toggle
    const key = "dev_mode";
    if (status?.temporary) {
      await browser.storage.local.set({
        [key]: {
          enabled: status.temporary,
        },
      });
    } else {
      try {
        const result = await browser.storage.local.get(key);
        typeof result[key]?.enabled === "boolean";
      } catch {
        await browser.storage.local.set({
          [key]: {
            enabled: false,
          },
        });
      }
    }

    runChecker();
    await alarmScheduler.update();
  } catch (error) {
    console.error(
      "background_script init(): failed to initialize extension settings:",
      error,
    );
  }
}

// Tab handler
async function openTab() {
  const popupTab = browser.runtime.getURL(BROWSER_ACTION_POPUP_HTML);

  try {
    // Look for existing tab across all windows
    const tabs = await browser.tabs.query({ url: popupTab });

    if (tabs.length > 0) {
      const tab = tabs[0];
      // Focus both the tab and its window
      await browser.windows.update(tab.windowId, { focused: true });
      await browser.tabs.update(tab.id, { active: true });
    } else {
      // Create new tab in current window
      await browser.tabs.create({
        active: true,
        url: popupTab,
      });
    }
  } catch (error) {
    console.error(
      "background_script onClicked listener: failed to handle browser action:",
      error,
    );
  }
}

// Conditionally send a notification
async function sendNotification() {
  let result = {};

  // Attempt to retrieve configuration from managed storage first (e.g., enterprise policy)
  try {
    result = await browser.storage.managed.get();
  } catch {
    if (DEV_MODE)
      console.debug(
        "background_script sendNotification(): management not detected",
      );
  }

  // Fallback to sync storage if no valid config found
  if (!result || Object.keys(result).length === 0) {
    try {
      result = await browser.storage.sync.get();
    } catch (error) {
      console.warn(
        "background_script sendNotification(): failed to load sync storage:",
        error,
      );
    }
  }

  const alertType = result?.alert_type;

  // Open a new tab
  if (alertType === "tab" || alertType === "both") {
    await openTab();
  }

  // Send desktop notification
  if (alertType === "notif" || alertType === "both") {
    let content = browser.i18n.getMessage("notificationContentUpdate", [
      updateChecker.browserName,
      updateChecker.browserVersion,
      updateChecker.latestVersion,
    ]);
    let iconUrl = browser.runtime.getURL("images/status-warn.svg");

    // Handle errors during version check
    if (updateChecker.error) {
      let message = "notificationContentErr";
      if (updateChecker.error.cause === "unsupported") {
        // Force notifications and disable alarm for unsupported browsers
        message = "notificationContentUnsupported";
        console.error("background_script sendNotification(): disabling alarm");
        await browser.storage.sync.set({
          alert_type: "both",
          alarm_schedule: "0",
        });
        await alarmScheduler.update();
      }
      content = browser.i18n.getMessage(message);
      iconUrl = browser.runtime.getURL("images/status-error.svg");
    }

    await browser.notifications.create({
      type: "basic",
      iconUrl,
      title: browser.i18n.getMessage("extensionName"),
      message: content,
    });
  }
}

// Run
browser.runtime.onStartup.addListener(init);
browser.runtime.onInstalled.addListener(init);

// Listen for click
browser.browserAction.onClicked.addListener(openTab);

// Schedule alarm to poll for updates
browser.alarms.onAlarm.addListener(runChecker);

// Menus
browser.menus.create({
  id: "open_options",
  title: browser.i18n.getMessage("menuOpenSettings"),
  icons: { 128: "images/status-ok.svg" },
  contexts: ["browser_action"],
});

browser.menus.onClicked.addListener((info) => {
  switch (info.menuItemId) {
    case "open_options":
      browser.runtime.openOptionsPage();
      break;
  }
});

function updateMenuItem(id, title) {
  browser.menus.update(id, {
    title: title,
  });
  browser.menus.refresh();
}

browser.menus.onShown.addListener((info) => {
  const id = "open_options";
  if (!info.menuIds.includes(id)) {
    return;
  }
  updateMenuItem(id, browser.i18n.getMessage("menuOpenSettings"));
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "runChecker") {
    if (DEV_MODE)
      console.debug(
        "background_script runChecker activated by sender:",
        sender,
      );
    async function sendRunCheckResponse(result, sendResponse) {
      try {
        sendResponse({
          isLatest: result.isLatest,
          latestVersion: result.latestVersion,
          errorCause: result.errorCause,
        });
      } catch (err) {
        if (DEV_MODE)
          console.warn(
            "background_script runChecker: destination disconnected before response could be sent:",
            err,
          );
      }

      try {
        await browser.runtime.sendMessage({
          action: "runCheckerRefresh",
          result: {
            isLatest: result.isLatest,
            latestVersion: result.latestVersion,
            errorCause: result.errorCause,
          },
        });
      } catch (err) {
        if (DEV_MODE)
          console.warn(
            "background_script runChecker: could not send runCheckerRefresh message:",
            err,
          );
      }
    }
    (async () => {
      try {
        if (!sender.tab) {
          // Close tab if needed
          const popupTab = browser.runtime.getURL(BROWSER_ACTION_POPUP_HTML);
          const tabs = await browser.tabs.query({ url: popupTab });
          if (tabs.length > 0) {
            const tab = tabs[0];
            await browser.tabs.remove(tab.id);
          }
        }

        // Run checker function
        const result = await runChecker(message.use_cache === true, false);

        // Send response
        await sendRunCheckResponse(
          {
            isLatest: result.isLatest,
            latestVersion: result.latestVersion,
            errorCause: result.errorCause,
          },
          sendResponse,
        );
      } catch (error) {
        console.error("background_script runChecker activation error:", error);
        await sendRunCheckResponse(
          {
            isLatest: null,
            latestVersion: null,
            error: error,
            errorCause: error.cause,
          },
          sendResponse,
        );
      }
    })();
  }
  return true;
});
