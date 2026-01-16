// Background script
"use strict";

// Constants
const BROWSER_ACTION_POPUP_HTML = "browser_action/browser_action.html";

// Close browser status tab
async function closeBrowserStatusTab() {
  const popupTab = browser.runtime.getURL(BROWSER_ACTION_POPUP_HTML);
  const tabs = await browser.tabs.query({ url: popupTab });
  if (tabs.length > 0) {
    const tab = tabs[0];
    await browser.tabs.remove(tab.id);
  }
}

// Initialize, loading settings, set defaults, start background processes
async function init(status) {
  const defaultSettings = {
    alert_type: "both",
    alarm_schedule: String(ALARM_DEFAULT_MINUTES),
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

    const unsupportedBrowser =
      await browser.storage.local.get("is_unsupported");
    if (DEV_MODE) {
      if (unsupportedBrowser)
        console.debug(
          `background_script init(): unsupportedBrowser: ${unsupportedBrowser.is_unsupported}`,
        );
    }

    // Validate settings
    for (const [key, defaultValue] of Object.entries(defaultSettings)) {
      const currentValue = storedSettings[key];

      const isValid = (async () => {
        switch (key) {
          case "alert_type":
            return ["both", "disabled", "tab", "notif"].includes(currentValue);
          case "alarm_schedule":
            // Reset default if previously disabled due to unsupported status
            if (unsupportedBrowser?.is_unsupported === true) {
              await browser.storage.local.remove("is_unsupported");
              return false;
            }
            return (
              typeof currentValue === "string" &&
              /^\d+$/.test(currentValue) &&
              (parseInt(currentValue, 10) === 0 ||
                parseInt(currentValue, 10) >= ALARM_MINIMUM_MINUTES)
            );
          default:
            return false;
        }
      })();

      if (!(await isValid)) {
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
    const result = await browser.storage.local.get(key);
    if (typeof result[key]?.enabled !== "boolean") {
      await browser.storage.local.set({
        [key]: {
          enabled: status?.temporary ?? false,
        },
      });
    }

    closeBrowserStatusTab();
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
async function openBrowserStatusTab() {
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

// Run the update check
async function runChecker(alarmInfo, useCache = false, scheduled = true) {
  if (DEV_MODE) {
    if (alarmInfo)
      console.debug(
        `background_script runChecker(): AlarmInfo: name: ${alarmInfo.name}, periodInMinutes: ${alarmInfo.periodInMinutes}, scheduledTime: ${alarmInfo.scheduledTime}`,
        new Date(alarmInfo.scheduledTime),
      );
  }

  // Compensate for missed alarms, i.e. due to suspend/sleep states
  let lastChecked = updateChecker.lastChecked;
  if (useCache) {
    const [alarmScheduledTime, periodInSeconds] = await browser.alarms
      .get(ALARM_NAME)
      .then((alarm) => [alarm.scheduledTime, alarm.periodInMinutes * 60])
      .catch(() => [null, null]);
    const now = Date.now();
    if (periodInSeconds !== null && lastChecked !== null) {
      if (DEV_MODE)
        console.debug(
          `background_script runChecker(): alarmScheduledTime: ${alarmScheduledTime}, periodInSeconds: ${periodInSeconds}, lastChecked ${lastChecked}, now: ${now}`,
          new Date(alarmScheduledTime),
          new Date(lastChecked),
          new Date(now),
        );
      if (alarmScheduledTime <= now && now >= lastChecked + periodInSeconds) {
        console.warn(
          "background_script runChecker(): alarm missed, forcing run",
        );
        useCache = false;
      }
    }
  }

  if (DEV_MODE)
    console.debug(
      `background_script runChecker(): useCache: ${useCache}, scheduled: ${scheduled}`,
    );

  // Set unknown status
  if (!useCache) {
    setBrowserStatus("unknown");
    if (!scheduled) await alarmScheduler.update(true);
  }

  const isLatest = await updateChecker.isLatest(useCache);
  const isRunning = await updateChecker.isRunning();
  const browserName = updateChecker.browserName;
  const browserVersion = updateChecker.browserVersion;
  const latestVersion = updateChecker.latestVersion;
  const resultError = updateChecker.error;
  const resultCause = updateChecker.error?.cause;
  lastChecked = updateChecker.lastChecked;

  if (isLatest === true) {
    setBrowserStatus("ok");
  } else if (isLatest !== true && resultCause && isRunning !== true) {
    setBrowserStatus("error");
    lastChecked = null;
  } else if (isLatest === null) {
    setBrowserStatus("error");
    lastChecked = null;
  } else if (isLatest === false) {
    setBrowserStatus("warn");
  } else {
    setBrowserStatus("unknown");
  }

  const result = {
    useCache: useCache,
    isLatest: isLatest,
    isRunning: isRunning,
    browserName: browserName,
    browserVersion: browserVersion,
    lastChecked: lastChecked,
    latestVersion: latestVersion,
    error: resultError,
    errorCause: resultCause,
  };

  if (scheduled && isLatest !== true) sendNotification(result);

  return result;
}

// Conditionally send a notification
async function sendNotification(result) {
  const { name, version } = await browser.runtime.getBrowserInfo();
  let settings = {};

  // Attempt to retrieve configuration from managed storage first (e.g., enterprise policy)
  try {
    settings = await browser.storage.managed.get();
  } catch {
    if (DEV_MODE)
      console.debug(
        "background_script sendNotification(): management not detected",
      );
  }

  // Fallback to sync storage if no valid config found
  if (!settings || Object.keys(settings).length === 0) {
    try {
      settings = await browser.storage.sync.get();
    } catch (error) {
      console.warn(
        "background_script sendNotification(): failed to load sync storage:",
        error,
      );
    }
  }

  const alertType = settings?.alert_type;

  // Open a new tab
  if (alertType === "tab" || alertType === "both") {
    await closeBrowserStatusTab();
    await openBrowserStatusTab();
  }

  // Send desktop notification
  if (alertType === "notif" || alertType === "both") {
    let content = browser.i18n.getMessage("notificationContentUpdate", [
      name,
      version,
      result.latestVersion,
    ]);
    let iconUrl = browser.runtime.getURL(ICON_PATHS["warn"]);

    // Handle errors during version check
    if (result.error) {
      let message = "notificationContentErr";
      if (result.errorCause === "unsupported") {
        // Force notifications and disable alarm for unsupported browsers
        message = "notificationContentUnsupported";
        console.error("background_script sendNotification(): disabling alarm");
        await browser.storage.sync.set({
          alert_type: "both",
          alarm_schedule: "0",
        });
        await alarmScheduler.update();
      }
      if (result.errorCause === "timedout") {
        message = "notificationContentErrTimedOut";
      }
      content = browser.i18n.getMessage(message);
      iconUrl = browser.runtime.getURL(ICON_PATHS["error"]);
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
browser.browserAction.onClicked.addListener(openBrowserStatusTab);

// Schedule alarm to poll for updates
browser.alarms.onAlarm.addListener(runChecker);

// Menus
browser.menus.create({
  id: "open_options",
  title: browser.i18n.getMessage("menuOpenSettings"),
  icons: { 128: ICON_PATHS["unknown"] },
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
      const response = {
        useCache: result.useCache,
        isLatest: result.isLatest,
        isRunning: result.isRunning,
        browserName: result.browserName,
        browserVersion: result.browserVersion,
        lastChecked: result.lastChecked,
        latestVersion: result.latestVersion,
        errorCause: result.errorCause,
      };
      try {
        sendResponse(response);
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
          result: response,
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
          await closeBrowserStatusTab();
        }

        // Run checker function
        const result = await runChecker(
          undefined,
          message.use_cache === true,
          false,
        );

        // Send response
        await sendRunCheckResponse(
          {
            useCache: result.useCache,
            isLatest: result.isLatest,
            isRunning: result.isRunning,
            browserName: result.browserName,
            browserVersion: result.browserVersion,
            lastChecked: result.lastChecked,
            latestVersion: result.latestVersion,
            errorCause: result.errorCause,
          },
          sendResponse,
        );
      } catch (error) {
        console.error("background_script runChecker activation error:", error);
        await sendRunCheckResponse(
          {
            useCache: false,
            isLatest: null,
            isRunning: false,
            browserName: null,
            browserVersion: null,
            lastChecked: null,
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
