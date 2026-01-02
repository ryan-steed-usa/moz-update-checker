// Shared functions
"use strict";

// Dynamic debug
let DEV_MODE = false;

(async () => {
  try {
    // Local storage permits manual toggle
    const key = "dev_mode";
    const result = await browser.storage.local.get(key);
    DEV_MODE = result[key]?.enabled ?? false;
  } catch {
    DEV_MODE = false;
  }
})();

// Constant variables
const ALARM_DEFAULT_MINUTES = 480; // 8 hours
const ALARM_MINIMUM_MINUTES = DEV_MODE ? 1 : 240; // 4 hour minimum unless dev mode
const ALARM_NAME = "moz-update-checker";
const MOZ_UPDATE_CHECK_APIS = {
  Firefox: "https://product-details.mozilla.org/1.0/firefox_versions.json",
  LibreWolf: "https://gitlab.com/api/v4/projects/44042130/releases.json",
  IceCat:
    "https://api.github.com/repos/ryan-steed-usa/gnu-icecat-mirror/releases/latest",
};

// Firefox support is implied
const SUPPORTED_BROWSERS = ["LibreWolf", "IceCat"];

const ICON_PATHS = {
  ok: "images/status-ok.svg",
  error: "images/status-error.svg",
  warn: "images/status-warn.svg",
  unknown: "images/status-unknown.svg",
};

// Constant functions
const alarmScheduler = {
  // Updates or creates a recurring alarm to poll for updates
  update: async function (refresh = false) {
    try {
      // Fetch stored schedule value
      const response = await browser.storage.sync.get("alarm_schedule");

      let alarmScheduleValue = ALARM_DEFAULT_MINUTES;

      // Use stored value if present and valid
      if (
        typeof response.alarm_schedule !== "undefined" &&
        response.alarm_schedule !== null
      ) {
        alarmScheduleValue = response.alarm_schedule;
      } else {
        console.warn("alarmScheduler(): alarm_schedule not set in storage.");
      }

      let alarmMinutes = parseInt(alarmScheduleValue, 10);

      // Validate parsed number
      if (isNaN(alarmMinutes) || alarmMinutes < 0) {
        console.warn(
          "alarmScheduler(): invalid value:",
          alarmScheduleValue,
          "using default:",
          ALARM_DEFAULT_MINUTES,
        );
        alarmMinutes = ALARM_DEFAULT_MINUTES;
      }

      // Check if the alarm already exists with correct settings
      const existingAlarm = await browser.alarms.get(ALARM_NAME);

      if (
        existingAlarm &&
        existingAlarm.periodInMinutes === alarmMinutes &&
        !refresh
      ) {
        if (DEV_MODE)
          console.debug("alarmScheduler(): schedule already exists, skipping.");
        return;
      }

      // Clear only our specific alarm
      if (DEV_MODE) console.debug("alarmScheduler(): clearing alarm");
      await browser.alarms.clear(ALARM_NAME);

      if (alarmMinutes !== 0) {
        browser.alarms.create(ALARM_NAME, { periodInMinutes: alarmMinutes });
        const scheduledTime = await browser.alarms
          .get(ALARM_NAME)
          .then((alarm) => alarm.scheduledTime);
        if (DEV_MODE)
          console.debug(
            `alarmScheduler(): created alarm '${ALARM_NAME}', refresh: ${refresh}, with period: ${alarmMinutes} minutes, next run ${scheduledTime}`,
            new Date(scheduledTime),
          );
      }
    } catch (error) {
      console.error("alarmScheduler(): error updating alarm schedule:", error);
    }
  },
};

const getIconConfig = (iconPath) => {
  const sizes = [16, 24, 32, 48, 64, 96, 128];
  const pathConfig = {};
  sizes.forEach((size) => {
    pathConfig[size] = iconPath;
  });
  return { path: pathConfig };
};

const hideElement = (element) => {
  if (element) {
    element.classList.add("hidden");
  }
};

const i18nTranslator = async () => {
  // Translate i18n elements
  const elements = document.querySelectorAll(
    "[i18nKey],[i18nTitleKey],[i18nBrowserKey],[i18nVersionKey]",
  );
  const { name } = await browser.runtime.getBrowserInfo();
  const browserName = name;
  const version = await browser.runtime.getManifest().version;

  // Loop and translate all matching elements
  elements.forEach((element) => {
    const key = element.getAttribute("i18nKey");
    const browserKey = element.getAttribute("i18nBrowserKey");
    const versionKey = element.getAttribute("i18nVersionKey");
    const titleKey = element.getAttribute("i18nTitleKey");

    if (key) {
      const message = browser.i18n.getMessage(key);
      if (message !== undefined) {
        element.textContent = message;
      }
    }
    if (browserKey) {
      const message = browser.i18n.getMessage(browserKey, browserName);
      if (message !== undefined) {
        element.textContent = message;
      }
    }
    if (versionKey) {
      const message = browser.i18n.getMessage(versionKey, ` (v${version})`);
      if (message !== undefined) {
        element.textContent = message;
      }
    }
    if (titleKey) {
      const title = browser.i18n.getMessage(titleKey);
      if (title !== undefined) {
        element.title = title;
      }
    }
  });
};

const setBrowserStatus = async (status) => {
  try {
    const iconPath = ICON_PATHS[status] || ICON_PATHS.unknown;
    const iconConfig = getIconConfig(`../${iconPath}`);
    const extensionTitle = browser.i18n.getMessage(
      "extensionNameInfo",
      `: ${status.toUpperCase()}`,
    );

    await browser.browserAction.setIcon(iconConfig);
    await browser.browserAction.setTitle({ title: extensionTitle });

    return true;
  } catch (error) {
    console.error("setBrowserStatus(): failed to set browser status:", error);
    return false;
  }
};

const showElement = (element) => {
  if (element) {
    element.classList.remove("hidden");
  }
};

const updateChecker = {
  browserName: null,
  browserVersion: null,
  error: null,
  lastChecked: null,
  latestVersion: null,

  // Compares two semantic version strings with optional release suffix
  compareVersions: function (browserVersion, latestVersion) {
    // Validate input
    if (
      typeof browserVersion !== "string" ||
      browserVersion === "" ||
      typeof latestVersion !== "string" ||
      latestVersion === ""
    ) {
      if (DEV_MODE)
        console.debug(
          "updateChecker.compareVersions(): inputs must be non-empty strings",
        );
      return null;
    }

    // Chomp
    browserVersion = browserVersion.trim();
    latestVersion = latestVersion.trim();

    // Split into base version and suffix
    const parsePart = (v) => {
      const parts = v.split("-");
      const base = parts[0].startsWith("v")
        ? parts[0].replace("v", "")
        : parts[0];
      const suffix = parts.length > 1 ? parts.slice(1).join("-") : null;

      // Split base into numbers
      const numbers = base.split(".").map((part) => {
        const num = parseInt(part, 10);
        return isNaN(num) ? -1 : num;
      });

      return { numbers, suffix };
    };

    const { numbers: bNums, suffix: bSuffix } = parsePart(browserVersion);
    const { numbers: lNums, suffix: lSuffix } = parsePart(latestVersion);

    if (DEV_MODE)
      console.debug(
        `updateChecker.compareVersions(): browserVersion: ${browserVersion}, base: ${bNums}, suffix: ${bSuffix}`,
      );
    if (DEV_MODE)
      console.debug(
        `updateChecker.compareVersions(): latestVersion: ${latestVersion}, base: ${lNums}, suffix: ${lSuffix}`,
      );

    // Pad zeros
    const maxLength = Math.max(bNums.length, lNums.length);
    while (bNums.length < maxLength) bNums.push(0);
    while (lNums.length < maxLength) lNums.push(0);

    // Compare semantic version
    for (let i = 0; i < maxLength; i++) {
      if (bNums[i] > lNums[i]) return 1;
      if (bNums[i] < lNums[i]) return -1;
    }

    // Return if non-suffix semantic version matches
    if (bSuffix === null && lSuffix === null) {
      return 0;
    }

    // Compare suffix
    if (lSuffix !== null && lSuffix.startsWith("gnu")) return 1; // IceCat
    if (bSuffix === null) return -1;
    if (lSuffix === null) return 1;
    const bSuffixNum = parseInt(bSuffix, 10);
    const lSuffixNum = parseInt(lSuffix, 10);

    // Attempt to handle non-numeric suffix
    if (isNaN(bSuffixNum) || isNaN(lSuffixNum)) {
      return lSuffix.localeCompare(bSuffix);
    }

    if (bSuffixNum > lSuffixNum) return 1;
    if (bSuffixNum < lSuffixNum) return -1;

    // Return values:
    // 0  = equal
    // 1  = browser version greater than latest version
    // -1 = browser version less than latest version
    return 0;
  },

  // Attempt to detect Firefox release
  detectFirefoxRelease: function (browserVersion, latestObject) {
    // Helper function to strip esr string
    const stripESR = (v) => v?.split("esr")[0];

    // Validate input
    if (typeof browserVersion !== "string" || browserVersion === "") {
      if (DEV_MODE)
        console.debug(
          "updateChecker.detectFirefoxRelease(): browserVersion  input must be non-empty string",
        );
      return null;
    }
    if (
      typeof latestObject !== "object" ||
      latestObject === null ||
      Object.keys(latestObject).length === 0
    ) {
      if (DEV_MODE)
        console.debug(
          "updateChecker.detectFirefoxRelease(): latestObject input must be non-empty object",
        );
      return null;
    }

    const latestVersion = latestObject["LATEST_FIREFOX_VERSION"];
    const esrVersion = stripESR(latestObject["FIREFOX_ESR"]);
    const esr115Version = stripESR(latestObject["FIREFOX_ESR115"]);

    // Compare browser version with LATEST and both ESR versions
    const cmpLatest = this.compareVersions(browserVersion, latestVersion);
    const cmpESR = this.compareVersions(browserVersion, esrVersion);
    const cmpESR115 = this.compareVersions(browserVersion, esr115Version);

    if (cmpLatest <= 0 && cmpESR > 0) {
      if (DEV_MODE)
        console.debug(
          "updateChecker.detectFirefoxRelease(): Firefox LATEST detected",
        );
      return latestObject["LATEST_FIREFOX_VERSION"];
    } else if (cmpESR <= 0 && cmpESR115 > 0) {
      if (DEV_MODE)
        console.debug(
          "updateChecker.detectFirefoxRelease(): Firefox ESR detected",
        );
      return latestObject["FIREFOX_ESR"];
    } else if (cmpESR115 <= 0) {
      if (DEV_MODE)
        console.debug(
          "updateChecker.detectFirefoxRelease(): Firefox ESR115 detected",
        );
      return latestObject["FIREFOX_ESR115"];
    } else {
      throw new Error(
        "updateChecker.detectFirefoxRelease(): cannot detect supported Firefox version",
        { cause: "unsupported" },
      );
    }
  },

  // Fetches the latest release with timeout, caching (with default 5 minute TTL), and retry support
  // Uses local storage for cross-context persistence
  fetchLatestVersion: async function (
    browserName,
    url,
    timeoutMs = 30000,
    maxRetries = 2,
    ttlMs = 5 * 60 * 1000,
  ) {
    // Local storage cache
    const key = `version_cache_${browserName}`;
    const result = await browser.storage.local.get(key);
    const cachedEntry = result[key];

    const now = Date.now();

    // Lock
    await this.isRunning(true);

    if (this.useCache && cachedEntry && now - cachedEntry.timestamp < ttlMs) {
      if (DEV_MODE)
        console.debug(
          `updateChecker.fetchLatestVersion(): returning cached ${browserName} version for: ${url} with ${ttlMs} expiring ${cachedEntry.timestamp}:`,
          new Date(cachedEntry.timestamp),
        );
      await this.isRunning(false);
      return cachedEntry.data;
    }

    let attempt = 0;

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
          controller.abort();
          reject(new Error("Timeout"));
        }, timeoutMs),
      );

      try {
        if (DEV_MODE)
          console.debug(
            `updateChecker.fetchLatestVersion(): fetching ${browserName} version from ${url}, attempt ${attempt + 1}`,
          );
        const response = await Promise.race([
          fetch(url, { cache: "no-cache", signal: controller.signal }),
          timeoutPromise,
        ]);

        if (!response.ok) {
          console.warn(
            `updateChecker.fetchLatestVersion(): HTTP error! status: ${response.status} for ${browserName} URL: ${url}`,
          );
          attempt++;
          continue;
        }

        const responseData = await response.json();

        // Save to storage cache
        await browser.storage.local.set({
          [key]: {
            data: responseData,
            timestamp: now,
          },
        });

        await this.isRunning(false);
        return responseData || null;
      } catch (error) {
        attempt++;
        console.warn(
          `updateChecker.fetchLatestVersion(): ${browserName} attempt ${attempt} failed:`,
          error,
        );

        if (attempt > maxRetries) {
          this.error = error;
          console.error(
            `updateChecker.fetchLatestVersion(): ${browserName} max retries exceeded.`,
            error,
          );
          await this.isRunning(false);
        }

        // Add exponential backoff with jitter
        const backoffDelay = Math.pow(2, attempt) * 1000 + Math.random() * 1000; // Add jitter
        if (DEV_MODE)
          console.debug(
            `updateChecker.fetchLatestVersion(): ${browserName} retrying in ${backoffDelay / 1000}s...`,
          );
        await new Promise((r) => setTimeout(r, backoffDelay));
      }
    }

    await this.isRunning(false);
    return null;
  },

  // Main method to check if the browser is up-to-date
  isLatest: async function (useCache = false) {
    // Local storage
    const key = "is_latest";
    const result = await browser.storage.local.get(key);
    const stateEntry = result[key];
    const now = Date.now();

    if (!useCache && stateEntry) await browser.storage.local.remove(key);

    try {
      // Get browser version
      const running = await this.isRunning();
      const { name, version } = await browser.runtime.getBrowserInfo();
      this.browserName = name;
      this.browserVersion = version;

      // Check if running
      if (running) return undefined;

      // Handle browser url
      const url = MOZ_UPDATE_CHECK_APIS[this.browserName]
        ? MOZ_UPDATE_CHECK_APIS[this.browserName]
        : "unsupported";
      if (url === "unsupported")
        throw new Error(`Unsupported browser: ${this.browserName}`, {
          cause: url,
        });

      if (DEV_MODE)
        console.debug(
          `updateChecker.isLatest(): detected browser: ${this.browserName} url: ${url}, useCache: ${useCache}`,
        );
      if (DEV_MODE && useCache && stateEntry)
        console.debug(
          `updateChecker.isLatest(): using cached responses, latest: ${stateEntry.latest}, result: ${stateEntry.result}, timestamp: ${stateEntry.timestamp}`,
        );

      // Fetch latest version
      const latestResponse = useCache
        ? null
        : await this.fetchLatestVersion(this.browserName, url);

      if (!latestResponse && !useCache) {
        this.isRunning(false);
        return null;
      }

      if (DEV_MODE)
        console.debug(
          "updateChecker.isLatest(): latestResponse: ",
          latestResponse,
        );

      if (useCache && typeof stateEntry?.latest === "string") {
        this.latestVersion = stateEntry.latest;
        this.lastChecked = stateEntry.timestamp;
      } else {
        this.lastChecked = now;
        switch (this.browserName) {
          case "Firefox":
            this.latestVersion = this.detectFirefoxRelease(
              this.browserVersion,
              latestResponse,
            );
            break;
          case "LibreWolf":
            this.latestVersion = latestResponse[0]?.name;
            break;
          case "IceCat":
            this.latestVersion = latestResponse?.tag_name;
            break;
        }
      }

      // Compare versions
      const comparison =
        useCache && stateEntry
          ? null
          : this.compareVersions(this.browserVersion, this.latestVersion);
      const result =
        useCache && stateEntry
          ? stateEntry.result
          : comparison === null
            ? null
            : comparison >= 0;

      if (!useCache) {
        if (DEV_MODE)
          console.debug(
            `updateChecker.isLatest(): comparison: ${comparison}, result: ${result}`,
          );

        // Store state
        await browser.storage.local.set({
          [key]: {
            latest: this.latestVersion,
            result: result,
            timestamp: this.lastChecked,
          },
        });
      }

      return result;
    } catch (error) {
      this.error = error;
      this.isRunning(false);
      console.error("updateChecker.isLatest():", error);
      return null;
    }
  },

  // Store and check status to share with extension and tab contexts
  isRunning: async function (setRunning = null, expiresMs = 2 * 60 * 1000) {
    // Local storage
    const key = "is_running";
    const result = await browser.storage.local.get(key);
    const stateEntry = result[key];

    const now = Date.now();

    // Store state
    if (setRunning === true) {
      const expires = now + expiresMs;
      if (DEV_MODE)
        console.debug(
          `updateChecker.isRunning(): set running, expires ${expires}:`,
          new Date(expires),
        );
      await browser.storage.local.set({
        [key]: {
          expires: expires,
        },
      });
      return true;
    }

    if (setRunning === false) {
      if (DEV_MODE) console.debug("updateChecker.isRunning(): clear running");
      if (stateEntry) await browser.storage.local.remove(key);
      return false;
    }

    if (stateEntry && stateEntry.expires > now) {
      if (DEV_MODE)
        console.debug(
          `updateChecker.isRunning(): still running, expires ${stateEntry.expires}:`,
          new Date(stateEntry.expires),
        );
      return true;
    }

    return false;
  },
};
