// Options script
"use strict";

// Constants
const ELEMENT_IDS = {
  FORM: "options_form",
  ALERT_TYPE: "alert_type",
  ALARM_SCHEDULE: "alarm_schedule",
  SUBMIT_BUTTON: "submit_button",
  MANAGED_OPTIONS: "managed_options",
  OPTION_1MINUTE: "option1Minute",
  PORTABLE_APPS: "toggle_portableapps",
};

const STORAGE_KEYS = {
  ALERT_TYPE: "alert_type",
  ALARM_SCHEDULE: "alarm_schedule",
  PORTABLE_APPS: "enable_portableapps",
};

// Functions
const getElement = (id) => document.getElementById(id);

async function applySettings(settings) {
  const alertTypeElement = getElement(ELEMENT_IDS.ALERT_TYPE);
  const alarmScheduleElement = getElement(ELEMENT_IDS.ALARM_SCHEDULE);
  const togglePortableApps = getElement(ELEMENT_IDS.PORTABLE_APPS);

  if (alertTypeElement) {
    alertTypeElement.value = settings[STORAGE_KEYS.ALERT_TYPE] || "";
  }

  if (alarmScheduleElement) {
    alarmScheduleElement.value = settings[STORAGE_KEYS.ALARM_SCHEDULE] || "";
  }

  if (togglePortableApps) {
    togglePortableApps.checked = settings[STORAGE_KEYS.PORTABLE_APPS] || false;
  }
}

function disableElement(element) {
  if (element) element.disabled = true;
}

function enableElement(element) {
  if (element) element.disabled = false;
}

async function loadManagedSettings() {
  try {
    const settings = await browser.storage.managed.get();
    return Object.keys(settings).length > 0 ? settings : null;
  } catch {
    return null;
  }
}

async function loadSettings() {
  try {
    return await browser.storage.sync.get();
  } catch (error) {
    console.error(
      "options loadSettings(): failed to load sync settings:",
      error,
    );
    return {};
  }
}

async function restoreSettings() {
  try {
    // Check for managed settings
    const managedSettings = await loadManagedSettings();

    if (managedSettings) {
      await applySettings(managedSettings);

      // Show managed warning
      showElement(getElement(ELEMENT_IDS.MANAGED_OPTIONS));

      // Prevent edit
      disableElement(getElement(ELEMENT_IDS.ALERT_TYPE));
      disableElement(getElement(ELEMENT_IDS.ALARM_SCHEDULE));
      disableElement(getElement(ELEMENT_IDS.PORTABLE_APPS));
    } else {
      // Read sync settings
      hideElement(getElement(ELEMENT_IDS.MANAGED_OPTIONS));

      // IceCat isn't offered by PortableApps.com
      const { name } = await browser.runtime.getBrowserInfo();
      if (name !== "IceCat") {
        if (DEV_MODE) {
          console.debug(
            "options restoreSettings(): showing PortableApps option",
          );
        }
        showElement(getElement("portableapps_row"));
      }

      // Debug option
      if (DEV_MODE) {
        console.debug(
          `options restoreSettings(): enabling debug option: ${ELEMENT_IDS.OPTION_1MINUTE}`,
        );
        showElement(getElement(ELEMENT_IDS.OPTION_1MINUTE));
      }

      const syncSettings = await loadSettings();
      await applySettings(syncSettings);

      // Enable edit
      enableElement(getElement(ELEMENT_IDS.ALERT_TYPE));
      enableElement(getElement(ELEMENT_IDS.ALARM_SCHEDULE));
      enableElement(getElement(ELEMENT_IDS.PORTABLE_APPS));
    }

    // Update buttons
    await settingsOnChange();
  } catch (error) {
    console.error("options restoreSettings(): error restoring options:", error);
  }
}

async function requestPortableAppsPermission() {
  // Optionally handle PortableApps SourceForge RSS permission
  const togglePortableAppsElement = getElement(ELEMENT_IDS.PORTABLE_APPS);
  let result = togglePortableAppsElement?.checked;
  if (togglePortableAppsElement.checked) {
    const response = await browser.permissions.request(
      PERMISSION_PORTABLE_APPS,
    );
    if (response) {
      if (DEV_MODE) {
        console.debug(
          "options requestPortableAppsPermission(): granted PortableApps permission",
        );
      }
    } else {
      if (DEV_MODE) {
        console.debug(
          "options requestPortableAppsPermission(): user refused PortableApps permission",
        );
      }
      togglePortableAppsElement.checked = false;
      result = false;
    }
  } else {
    await browser.permissions.remove(PERMISSION_PORTABLE_APPS);
    if (DEV_MODE) {
      console.debug(
        "options requestPortableAppsPermission(): revoked PortableApps permission",
      );
    }
  }
  return result;
}

async function saveSettings(e) {
  e.preventDefault();

  const alertType = getElement(ELEMENT_IDS.ALERT_TYPE)?.value;
  const alarmSchedule = getElement(ELEMENT_IDS.ALARM_SCHEDULE)?.value;
  const togglePortableApps = await requestPortableAppsPermission();

  if (
    alertType === undefined ||
    alarmSchedule === undefined ||
    typeof togglePortableApps !== "boolean"
  ) {
    console.error("options saveSettings(): failed to get form values");
    return;
  }

  const settings = {
    [STORAGE_KEYS.ALERT_TYPE]: alertType,
    [STORAGE_KEYS.ALARM_SCHEDULE]: alarmSchedule,
    [STORAGE_KEYS.PORTABLE_APPS]: togglePortableApps,
  };

  const success = await storeSettings(settings);
  if (success) {
    disableElement(getElement(ELEMENT_IDS.SUBMIT_BUTTON));
    await alarmScheduler.update();
  }
}

async function settingsOnChange() {
  try {
    const currentSettings = await loadSettings();
    const alertTypeElement = getElement(ELEMENT_IDS.ALERT_TYPE);
    const alarmScheduleElement = getElement(ELEMENT_IDS.ALARM_SCHEDULE);
    const togglePortableAppsElement = getElement(ELEMENT_IDS.PORTABLE_APPS);
    const submitButton = getElement(ELEMENT_IDS.SUBMIT_BUTTON);

    if (
      !alertTypeElement ||
      !alarmScheduleElement ||
      !togglePortableAppsElement ||
      !submitButton
    ) {
      return;
    }

    const hasChanges =
      alertTypeElement.value !==
        (currentSettings[STORAGE_KEYS.ALERT_TYPE] || "") ||
      alarmScheduleElement.value !==
        (currentSettings[STORAGE_KEYS.ALARM_SCHEDULE] || "") ||
      togglePortableAppsElement.checked !==
        (currentSettings[STORAGE_KEYS.PORTABLE_APPS] || false);

    if (hasChanges) {
      enableElement(submitButton);
    } else {
      disableElement(submitButton);
    }
  } catch (error) {
    console.error(
      "options settingsOnChange(): error in settingsOnChange:",
      error,
    );
  }
}

async function storeSettings(settings) {
  try {
    await browser.storage.sync.set(settings);
    return true;
  } catch (error) {
    console.error("options storeSettings(): failed to save settings:", error);
    return false;
  }
}

// Main events
document.addEventListener("DOMContentLoaded", () => {
  restoreSettings();

  const form = getElement(ELEMENT_IDS.FORM);
  const alertType = getElement(ELEMENT_IDS.ALERT_TYPE);
  const alarmSchedule = getElement(ELEMENT_IDS.ALARM_SCHEDULE);
  const togglePortableApps = getElement(ELEMENT_IDS.PORTABLE_APPS);

  if (form) {
    form.addEventListener("submit", saveSettings);
    form.addEventListener("reset", settingsOnChange);
  }

  if (alertType) {
    alertType.addEventListener("change", settingsOnChange);
  }

  if (alarmSchedule) {
    alarmSchedule.addEventListener("change", settingsOnChange);
  }

  if (togglePortableApps) {
    togglePortableApps.addEventListener("change", settingsOnChange);
  }
});
