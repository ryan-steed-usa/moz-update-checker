// Options script
"use strict";

// Constants
const ELEMENT_IDS = {
  FORM: "options_form",
  ALERT_TYPE: "alert_type",
  ALARM_SCHEDULE: "alarm_schedule",
  FORCE_LIBREWOLF: "toggle_librewolf",
  MANAGED_OPTIONS: "managed_options",
  OPTION_1MINUTE: "option1Minute",
  PORTABLE_APPS: "toggle_portableapps",
  PORTABLE_APPS_VERSION: "portableapps_version_select",
  SUBMIT_BUTTON: "submit_button",
};

const STORAGE_KEYS = {
  ALERT_TYPE: "alert_type",
  ALARM_SCHEDULE: "alarm_schedule",
  FORCE_LIBREWOLF: "force_librewolf",
  PORTABLE_APPS: "enable_portableapps",
  PORTABLE_APPS_VERSION: "portableapps_version",
};

// Functions
const getElement = (id) => document.getElementById(id);

async function applySettings(settings) {
  const alertTypeElement = getElement(ELEMENT_IDS.ALERT_TYPE);
  const alarmScheduleElement = getElement(ELEMENT_IDS.ALARM_SCHEDULE);
  const toggleLibreWolf = getElement(ELEMENT_IDS.FORCE_LIBREWOLF);
  const togglePortableApps = getElement(ELEMENT_IDS.PORTABLE_APPS);
  const portableAppsVersion = getElement(ELEMENT_IDS.PORTABLE_APPS_VERSION);

  if (alertTypeElement) {
    alertTypeElement.value = settings[STORAGE_KEYS.ALERT_TYPE] || "";
  }

  if (alarmScheduleElement) {
    alarmScheduleElement.value = settings[STORAGE_KEYS.ALARM_SCHEDULE] || "";
  }

  if (toggleLibreWolf) {
    toggleLibreWolf.checked = settings[STORAGE_KEYS.FORCE_LIBREWOLF] || false;
  }

  if (togglePortableApps) {
    togglePortableApps.checked = settings[STORAGE_KEYS.PORTABLE_APPS] || false;
  }

  if (portableAppsVersion) {
    portableAppsVersion.value =
      settings[STORAGE_KEYS.PORTABLE_APPS_VERSION] || "";
  }
}

function disableElement(element) {
  if (element) element.disabled = true;
}

function enableElement(element) {
  if (element) element.disabled = false;
}

function isLibreWolf() {
  // LibreWolf only offers a non-ESR branch
  const toggleLibreWolfElement = getElement(ELEMENT_IDS.FORCE_LIBREWOLF);
  if (toggleLibreWolfElement?.checked) {
    if (DEV_MODE)
      console.debug(
        "options restoreSettings(): LibreWolf manually identified, hiding PortableApps version option",
      );
    hideElement(getElement("portableapps_version_row"));
  }
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

async function libreWolfOnChange() {
  // librewolf.dev permission toggle handler
  try {
    // Optionally grant librewolf.dev access permission
    const toggleLibreWolfElement = getElement(ELEMENT_IDS.FORCE_LIBREWOLF);
    let result = toggleLibreWolfElement?.checked;
    if (toggleLibreWolfElement.checked) {
      const response = await browser.permissions.request(
        PERMISSION_LIBREWOLF_DEV,
      );
      if (response) {
        if (DEV_MODE) {
          console.debug(
            "options requestLibreWolfPermission(): granted LibreWolf permission",
          );
        }
      } else {
        if (DEV_MODE) {
          console.debug(
            "options requestLibreWolfPermission(): user refused LibreWolf permission",
          );
        }
        toggleLibreWolfElement.checked = false;
        result = false;
      }
    } else {
      await browser.permissions.remove(PERMISSION_LIBREWOLF_DEV);
      if (DEV_MODE) {
        console.debug(
          "options requestLibreWolfPermission(): revoked LibreWolf permission",
        );
      }
    }
  } catch (error) {
    console.error(
      "options libreWolfOnChange(): failed to update LibreWolf permission:",
      error,
    );
  }
  await settingsOnChange();
}

async function portableAppsOnChange() {
  // PortableApps permission toggle handler
  try {
    // Optionally grant PortableApps SourceForge RSS permission
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
  } catch (error) {
    console.error(
      "options portableAppsOnChange(): failed to update PortableApps permission:",
      error,
    );
  }
  await settingsOnChange();
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
      disableElement(getElement(ELEMENT_IDS.FORCE_LIBREWOLF));
      disableElement(getElement(ELEMENT_IDS.PORTABLE_APPS));
      disableElement(getElement(ELEMENT_IDS.PORTABLE_APPS_VERSION));
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
        showElement(getElement("librewolf_row"));
        showElement(getElement("portableapps_row"));
        showElement(getElement("portableapps_version_row"));
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
      await syncPermissionToggles();

      // Enable edit
      enableElement(getElement(ELEMENT_IDS.ALERT_TYPE));
      enableElement(getElement(ELEMENT_IDS.ALARM_SCHEDULE));
      enableElement(getElement(ELEMENT_IDS.FORCE_LIBREWOLF));
      enableElement(getElement(ELEMENT_IDS.PORTABLE_APPS));
      enableElement(getElement(ELEMENT_IDS.PORTABLE_APPS_VERSION));

      isLibreWolf();
    }

    // Update buttons
    await settingsOnChange();
  } catch (error) {
    console.error("options restoreSettings(): error restoring options:", error);
  }
}

async function syncPermissionToggles() {
  // Validate permission toggles
  try {
    const toggleLibreWolfElement = getElement(ELEMENT_IDS.FORCE_LIBREWOLF);
    const togglePortableAppsElement = getElement(ELEMENT_IDS.PORTABLE_APPS);

    if (toggleLibreWolfElement?.checked) {
      toggleLibreWolfElement.checked = await browser.permissions.contains(
        PERMISSION_LIBREWOLF_DEV,
      );
    }

    if (togglePortableAppsElement?.checked) {
      togglePortableAppsElement.checked = await browser.permissions.contains(
        PERMISSION_PORTABLE_APPS,
      );
    }

    if (DEV_MODE) {
      console.debug(
        "options syncPermissionToggles(): synced permission toggles",
      );
    }
  } catch (error) {
    console.error(
      "options syncPermissionToggles(): failed to sync permission toggles:",
      error,
    );
  }
}

async function saveSettings(e) {
  e.preventDefault();

  const alertType = getElement(ELEMENT_IDS.ALERT_TYPE)?.value;
  const alarmSchedule = getElement(ELEMENT_IDS.ALARM_SCHEDULE)?.value;
  const toggleLibreWolf = getElement(ELEMENT_IDS.FORCE_LIBREWOLF)?.checked;
  const togglePortableApps = getElement(ELEMENT_IDS.PORTABLE_APPS)?.checked;
  const portableAppsVersion = getElement(
    ELEMENT_IDS.PORTABLE_APPS_VERSION,
  )?.value;

  if (
    alertType === undefined ||
    alarmSchedule === undefined ||
    typeof toggleLibreWolf !== "boolean" ||
    typeof togglePortableApps !== "boolean" ||
    portableAppsVersion === undefined
  ) {
    console.error("options saveSettings(): failed to get form values");
    return;
  }

  const settings = {
    [STORAGE_KEYS.ALERT_TYPE]: alertType,
    [STORAGE_KEYS.ALARM_SCHEDULE]: alarmSchedule,
    [STORAGE_KEYS.FORCE_LIBREWOLF]: toggleLibreWolf,
    [STORAGE_KEYS.PORTABLE_APPS]: togglePortableApps,
    [STORAGE_KEYS.PORTABLE_APPS_VERSION]: portableAppsVersion,
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
    const toggleLibreWolfElement = getElement(ELEMENT_IDS.FORCE_LIBREWOLF);
    const togglePortableAppsElement = getElement(ELEMENT_IDS.PORTABLE_APPS);
    const portableAppsVersionElement = getElement(
      ELEMENT_IDS.PORTABLE_APPS_VERSION,
    );
    const submitButton = getElement(ELEMENT_IDS.SUBMIT_BUTTON);

    if (
      !alertTypeElement ||
      !alarmScheduleElement ||
      !toggleLibreWolfElement ||
      !togglePortableAppsElement ||
      !portableAppsVersionElement ||
      !submitButton
    ) {
      return;
    }

    const hasChanges =
      alertTypeElement.value !==
        (currentSettings[STORAGE_KEYS.ALERT_TYPE] || "") ||
      alarmScheduleElement.value !==
        (currentSettings[STORAGE_KEYS.ALARM_SCHEDULE] || "") ||
      toggleLibreWolfElement.checked !==
        (currentSettings[STORAGE_KEYS.FORCE_LIBREWOLF] || false) ||
      togglePortableAppsElement.checked !==
        (currentSettings[STORAGE_KEYS.PORTABLE_APPS] || false) ||
      portableAppsVersionElement.value !==
        (currentSettings[STORAGE_KEYS.PORTABLE_APPS_VERSION] || "");

    if (hasChanges) {
      enableElement(submitButton);
    } else {
      disableElement(submitButton);
    }

    isLibreWolf();
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
  const toggleLibreWolf = getElement(ELEMENT_IDS.FORCE_LIBREWOLF);
  const togglePortableApps = getElement(ELEMENT_IDS.PORTABLE_APPS);
  const portableAppsVersion = getElement(ELEMENT_IDS.PORTABLE_APPS_VERSION);

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

  if (toggleLibreWolf) {
    toggleLibreWolf.addEventListener("change", libreWolfOnChange);
  }

  if (togglePortableApps) {
    togglePortableApps.addEventListener("change", portableAppsOnChange);
  }

  if (portableAppsVersion) {
    portableAppsVersion.addEventListener("change", settingsOnChange);
  }
});
