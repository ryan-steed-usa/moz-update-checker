// Options script
"use strict";

// Constants
const ELEMENT_IDS = {
  FORM: "options_form",
  ALERT_TYPE: "alert_type",
  ALARM_SCHEDULE: "alarm_schedule",
  SUBMIT_BUTTON: "submit_button",
  MANAGED_OPTIONS: "managed_options",
};

const STORAGE_KEYS = {
  ALERT_TYPE: "alert_type",
  ALARM_SCHEDULE: "alarm_schedule",
};

// Functions
const getElement = (id) => document.getElementById(id);

async function applySettings(settings) {
  const alertTypeElement = getElement(ELEMENT_IDS.ALERT_TYPE);
  const alarmScheduleElement = getElement(ELEMENT_IDS.ALARM_SCHEDULE);

  if (alertTypeElement) {
    alertTypeElement.value = settings[STORAGE_KEYS.ALERT_TYPE] || "";
  }

  if (alarmScheduleElement) {
    alarmScheduleElement.value = settings[STORAGE_KEYS.ALARM_SCHEDULE] || "";
  }
}

function disableElement(element) {
  if (element) element.disabled = true;
}

function enableElement(element) {
  if (element) element.disabled = false;
}

function hideElement(element) {
  if (element) element.style.display = "none";
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
    } else {
      // Read sync settings
      hideElement(getElement(ELEMENT_IDS.MANAGED_OPTIONS));

      const syncSettings = await loadSettings();
      await applySettings(syncSettings);

      // Enable edit
      enableElement(getElement(ELEMENT_IDS.ALERT_TYPE));
      enableElement(getElement(ELEMENT_IDS.ALARM_SCHEDULE));
    }

    // Update buttons
    await settingsOnChange();
  } catch (error) {
    console.error("options restoreSettings(): error restoring options:", error);
  }
}

async function saveSettings(e) {
  e.preventDefault();

  const alertType = getElement(ELEMENT_IDS.ALERT_TYPE)?.value;
  const alarmSchedule = getElement(ELEMENT_IDS.ALARM_SCHEDULE)?.value;

  if (alertType === undefined || alarmSchedule === undefined) {
    console.error("options saveSettings(): failed to get form values");
    return;
  }

  const settings = {
    [STORAGE_KEYS.ALERT_TYPE]: alertType,
    [STORAGE_KEYS.ALARM_SCHEDULE]: alarmSchedule,
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
    const submitButton = getElement(ELEMENT_IDS.SUBMIT_BUTTON);

    if (!alertTypeElement || !alarmScheduleElement || !submitButton) {
      return;
    }

    const hasChanges =
      alertTypeElement.value !==
        (currentSettings[STORAGE_KEYS.ALERT_TYPE] || "") ||
      alarmScheduleElement.value !==
        (currentSettings[STORAGE_KEYS.ALARM_SCHEDULE] || "");

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

function showElement(element) {
  if (element) element.style.display = "block";
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
document.addEventListener("DOMContentLoaded", restoreSettings);

document.addEventListener("DOMContentLoaded", () => {
  const form = getElement(ELEMENT_IDS.FORM);
  const alertType = getElement(ELEMENT_IDS.ALERT_TYPE);
  const alarmSchedule = getElement(ELEMENT_IDS.ALARM_SCHEDULE);

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
});
