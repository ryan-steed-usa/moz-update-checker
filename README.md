# Moz Update Checker
<ins>*Moz Update Checker*</ins> is a [**WebExtension Manifest V2**](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/manifest.json/manifest_version) add-on intended to check for [**_Mozilla_**](https://www.mozilla.org) browser updates. Due to the rapidly evolving technological security landscape, browser updates are essential in our modern age. But not all operating systems/configurations permit timely automatic updates and this add-on can especially benefit these circumstances.

## Usage
This extension is particularly useful for [AppImage](https://github.com/AppImage/AppImageKit), [Portable](https://en.wikipedia.org/wiki/Portable_application), [Tarball](), and manually compiled installations. Once installed and when the browser is opened in the future, the current version is compared with the latest available version. If a new version is detected, both a desktop notification and a new tab (by default) will open to display update information.

<img width="383" height="381" alt="image" src="https://github.com/user-attachments/assets/25f682ba-2955-45aa-ba86-d9e65d3c1509" />

Updates will then continue to be checked in the background every 12 hours by default. Results are cached to reduce network activity but clicking the status image can force a refresh. Failed network connections are automatically retried 3 times before reaching a failure state.

<img width="465" height="273" alt="image" src="https://github.com/user-attachments/assets/6d0b6c5b-359b-4c0c-b717-5c20ed9df801" />

The present state is reflected via toolbar icon. Single click of the toolbar icon opens the add-on pop-up view and middle-click opens the tab page. Settings and links are also available as links from these pages.

<img width="206" height="176" alt="image" src="https://github.com/user-attachments/assets/9f4ff473-24c5-4af4-bfc4-1958cc69993c" />

## Options
**Alert type** and **Alert schedule** are both customizable.
| Alert type   | Description                       |
| ------------ | --------------------------------- |
| New Tab      | Opens only a new tab              |
| Notification | Sends only a desktop notification |
| Both         | Opens both types                  |
| Disabled     | Disables all notifications        |

| Alert Schedule | Description                  |
| -------------- | ---------------------------- |
| Frequency      | 4 Hours to 3 Days frequency  |
| Disabled       | Disables the alarm scheduler |


## Browser Support
* [Firefox Latest](https://www.firefox.com/) - *Checks product-details.mozilla.org*
* [Firefox ESR](https://www.firefox.com/browsers/enterprise/) - *ESR support is automatically detected by comparing each release version, this may become problematic in the future*
* [IceCat](https://www.gnu.org/software/gnuzilla/) - *For IceCat we parse the commit atom feed, may also break in the future*
* [LibreWolf](https://librewolf.net/) - *Reads the GitLab API for release builds*

## Privacy
**No data is collected nor stored by the author.** Some information including origin IP address and add-on extension HTTP request headers are required to be transmitted to remote API/Git endpoints in order to poll for release updates. These endpoints include:

- **Firefox**: "https://product-details.mozilla.org/1.0/firefox_versions.json"
- **LibreWolf**: "https://gitlab.com/api/v4/projects/44042130/releases.json"
- **IceCat**: "https://gitweb.git.savannah.gnu.org/gitweb/?p=gnuzilla.git;a=atom"

The author cannot be held liable for the data collection policy instituted by the server administrators of the aforementioned addresses. **Privacy and security are highly valued and important to the author. This extension will always remain transparent and open-source.**

---

### Inspiration
[LibreWolf Update Alerter](https://gitlab.com/sams.channel/librewolf-update-alerter) by [Sam St-Pettersen](https://gitlab.com/sams.channel) and [update-notifier](https://github.com/M-Reimer/update-notifier) by [Manuel Reimer](https://github.com/M-Reimer)

### Credits
Thanks to [**_Mozilla_**](https://www.mozilla.org) for bucking the dominance of Google's Chrome (and advertisement friendly Manifest V3). The SVG status icons are based on the *progress-\** series by [tabler-icons](https://github.com/tabler/tabler-icons), **[MIT License](https://github.com/tabler/tabler-icons?tab=MIT-1-ov-file#readme)** combined with [CoreUI's Cib-mozilla-firefox](https://commons.wikimedia.org/wiki/File:Cib-mozilla-firefox_(CoreUI_Icons_v1.0.0).svg), **CC BY 4.0 <https://creativecommons.org/licenses/by/4.0>, via Wikimedia Commons**. [LICENSE](https://github.com/coreui/coreui-icons/blob/v2/LICENSE) *(modified to change the size and color)*.

### Notes
_Generative "AI" is/was not used to "Vibe code" this project but (local) open-source and open-weight LLMs are employed for knowledge and summarization, mostly for commit_ logs.
