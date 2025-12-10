// Shared functions
"use strict";

// Constant variables
const MOZ_UPDATE_CHECK_APIS = {
  Firefox: "https://product-details.mozilla.org/1.0/firefox_versions.json",
  LibreWolf: "https://gitlab.com/api/v4/projects/44042130/releases.json",
  IceCat: "https://gitweb.git.savannah.gnu.org/gitweb/?p=gnuzilla.git;a=atom",
};

// Firefox support is implied
const SUPPORTED_BROWSERS = ["LibreWolf", "IceCat"];

const ICON_PATHS = {
  ok: "images/status-ok.svg",
  error: "images/status-error.svg",
  warning: "images/status-warn.svg",
  unknown: "images/status-unknown.svg",
};

// Constant functions
const getIconConfig = (iconPath) => {
  const sizes = [16, 24, 32, 48, 64, 96, 128];
  const pathConfig = {};
  sizes.forEach((size) => {
    pathConfig[size] = iconPath;
  });
  return { path: pathConfig };
};

const setBrowserIcon = (status) => {
  const iconPath = ICON_PATHS[status] || ICON_PATHS.unknown;
  const iconConfig = getIconConfig(`../${iconPath}`);

  return browser.browserAction.setIcon(iconConfig).catch((error) => {
    console.error("setBrowserIcon(): failed to set browser icon:", error);
  });
};

const DEV_MODE = (() => {
  try {
    const manifest = browser.runtime.getManifest();
    return !manifest.update_url;
  } catch {
    return false;
  }
})();

const alarmScheduler = {
  /*
   * Updates or creates a recurring alarm to poll for updates
   */
  update: async function () {
    try {
      const ALARM_DEFAULT_MINUTES = 720;
      const ALARM_NAME = "moz-update-checker";

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
      const existingAlarms = await browser.alarms.getAll();
      const existingAlarm = existingAlarms.find(
        (alarm) => alarm.name === ALARM_NAME,
      );

      if (existingAlarm && existingAlarm.periodInMinutes === alarmMinutes) {
        if (DEV_MODE)
          console.debug("alarmScheduler(): schedule already exists, skipping.");
        return;
      }

      // Clear only our specific alarm
      if (DEV_MODE) console.debug("alarmScheduler(): clearing alarm");
      await browser.alarms.clear(ALARM_NAME);

      if (alarmMinutes !== 0) {
        if (DEV_MODE)
          console.debug(
            `alarmScheduler(): creating alarm '${ALARM_NAME}' with period: ${alarmMinutes} minutes.`,
          );
        browser.alarms.create(ALARM_NAME, { periodInMinutes: alarmMinutes });
      }
    } catch (error) {
      console.error("alarmScheduler(): error updating alarm schedule:", error);
    }
  },
};

const updateChecker = {
  browserName: null,
  browserVersion: null,
  error: null,
  latestVersion: null,

  // Fetches the latest release with timeout, caching (with default 5 minute TTL), and retry support
  // Uses local storage for cross-context persistence
  fetchLatestVersion: async function (
    browserName,
    url,
    timeoutMs = 30000,
    maxRetries = 3,
    ttlMs = 5 * 60 * 1000,
  ) {
    // Local storage cache
    const key = `version_cache_${browserName}`;
    const result = await browser.storage.local.get(key);
    const cachedEntry = result[key];

    const now = Date.now();

    // Lock
    await this.isRunning(true);

    if (cachedEntry && now - cachedEntry.timestamp < ttlMs) {
      if (DEV_MODE)
        console.debug(
          `updateChecker.fetchLatestVersion(): returning cached ${browserName} version for: ${url}`,
        );
      await this.isRunning(false);
      return cachedEntry.data;
    }

    let attempt = 0;

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      const signal = controller.signal;
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
          fetch(url, { signal }),
          timeoutPromise,
        ]);

        if (!response.ok) {
          console.warn(
            `updateChecker.fetchLatestVersion(): HTTP error! status: ${response.status} for ${browserName} URL: ${url}`,
          );
          attempt++;
          continue;
        }

        const responseData =
          browserName === "IceCat"
            ? await response.text()
            : await response.json();

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
          return null;
        }

        // Backoff delay
        const delay = Math.pow(2, attempt) * 1000;
        if (DEV_MODE)
          console.debug(
            `updateChecker.fetchLatestVersion(): ${browserName} retrying in ${delay / 1000}s...`,
          );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    await this.isRunning(false);
    return null;
  },

  // Compares two semantic version strings with optional release suffix
  compareVersions: function (browserName, latest) {
    // Validate input
    if (
      typeof browserName !== "string" ||
      browserName === "" ||
      typeof latest !== "string" ||
      latest === ""
    ) {
      if (DEV_MODE)
        console.debug(
          "updateChecker.compareVersions(): inputs must be non-empty strings",
        );
      return null;
    }

    // Chomp
    browserName = browserName.trim();
    latest = latest.trim();

    // Split into base version and suffix
    const parsePart = (v) => {
      const parts = v.split("-");
      const base = parts[0];
      const suffix = parts.length > 1 ? parts.slice(1).join("-") : null;

      // Split base into numbers
      const numbers = base.split(".").map((part) => {
        const num = parseInt(part, 10);
        return isNaN(num) ? -1 : num;
      });

      return { numbers, suffix };
    };

    const { numbers: bNums, suffix: bSuffix } = parsePart(browserName);
    const { numbers: lNums, suffix: lSuffix } = parsePart(latest);

    if (DEV_MODE)
      console.debug(
        `updateChecker.compareVersions(): browserName: ${browserName}, base: ${bNums}, suffix: ${bSuffix}`,
      );
    if (DEV_MODE)
      console.debug(
        `updateChecker.compareVersions(): latest: ${latest}, base: ${lNums}, suffix: ${lSuffix}`,
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
  detectFirefoxRelease: function (browserName, latestObject) {
    // Helper function to strip esr string
    const stripESR = (v) => v?.split("esr")[0];

    // Validate input
    if (typeof browserName !== "string" || browserName === "") {
      if (DEV_MODE)
        console.debug(
          "updateChecker.detectFirefoxRelease(): browserName version input must be non-empty string",
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
    const cmpLatest = this.compareVersions(browserName, latestVersion);
    const cmpESR = this.compareVersions(browserName, esrVersion);
    const cmpESR115 = this.compareVersions(browserName, esr115Version);

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

  // Parse git log for latest IceCat release
  parseIceCatVersion: function (xmlText) {
    if (typeof xmlText !== "string" || xmlText === "") {
      if (DEV_MODE)
        console.debug(
          "updateChecker.parseIceCatVersion(): xmlText input must be non-empty string",
        );
      return null;
    }
    const splitBySpace = (s) => s?.split(" ")[2] || "";
    const stripSuffix = (s) => s?.split("-")[0] || s;

    // Simple XML parsing
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    const entries = xmlDoc.getElementsByTagName("entry");
    const versions = [];

    // Read last 10 commit titles
    for (let i = 0; i < Math.min(entries.length, 10); i++) {
      const entry = entries[i];
      const title = entry.getElementsByTagName("title")[0]?.textContent || "";
      const updated =
        entry.getElementsByTagName("updated")[0]?.textContent || "";

      // Update commits seem to adhere to format of: "Update to 140.5.0-2."
      if (title.includes("Update to")) {
        // Extract version string
        const version = splitBySpace(title);
        if (version.includes(".")) {
          versions.push({
            version: stripSuffix(version),
            updated: new Date(updated),
          });
        }
      }
    }

    if (DEV_MODE)
      console.debug("updateChecker.parseIceCatVersion(): versions:", versions);

    if (versions.length === 0) {
      if (DEV_MODE)
        console.debug(
          "updateChecker.parseIceCatVersion(): error parsing IceCat git atom feed",
        );
      return null;
    }

    const mostRecent = versions.reduce(
      (latest, current) => (current.updated > latest.date ? current : latest),
      versions[0],
    );
    return mostRecent.version;
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
      if (DEV_MODE) console.debug("updateChecker.isRunning(): set running");
      await browser.storage.local.set({
        [key]: {
          expires: now + expiresMs,
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
          "updateChecker.isRunning(): still running, expires:",
          new Date(stateEntry.expires),
        );
      return true;
    }

    return false;
  },

  // Main method to check if the browser is up-to-date
  isLatest: async function (useCache = false) {
    // Local storage
    const key = "is_latest";
    const result = await browser.storage.local.get(key);
    const stateEntry = result[key];

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
          `updateChecker.isLatest(): using cached responses, latest: ${stateEntry.latest}, result: ${stateEntry.result}`,
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
      } else {
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
            this.latestVersion = this.parseIceCatVersion(latestResponse);
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
};

const i18nTranslator = async () => {
  // Translate i18n elements
  const elements = document.querySelectorAll("[i18nKey],[i18nTitleKey]");
  const { name } = await browser.runtime.getBrowserInfo();
  const browserName = name;

  // Loop and translate all matching elements
  elements.forEach((element) => {
    const key = element.getAttribute("i18nKey");
    const titleKey = element.getAttribute("i18nTitleKey");

    if (key) {
      const message = browser.i18n.getMessage(key, browserName);
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
