# Implementation Steps: LinkedIn Follower Tracker

This document outlines the steps to implement the LinkedIn Follower Tracker Chrome extension, based on the requirements in `prd.md`.

## Proposed File Structure

```
linkedin-follower-tracker/
├── manifest.json
├── prd.md
├── implementation-steps.md
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── popup/
│   ├── popup.html
│   └── popup.js
├── options/
│   ├── options.html
│   ├── options.js
│   └── options.css
│   └── lib/              # For external libraries like Chart.js
│       └── chart.min.js
├── background.js
└── content_scripts/
    ├── linkedinUIInjector.js
    └── fetchFollowers.js
```

## Implementation Steps

1.  **Setup Manifest (`manifest.json`)**
    *   Create the `manifest.json` file.
    *   Define `manifest_version: 3`, `name`, `version`, `description`.
    *   Declare necessary `permissions`: `storage`, `scripting`, `tabs`, `activeTab`.
    *   Define the `action` (popup) pointing to `popup/popup.html`.
    *   Define the `options_page` pointing to `options/options.html`.
    *   Declare the `background` service worker: `background.js`.
    *   Declare the `content_scripts` for `linkedinUIInjector.js` to run on `https://*.linkedin.com/*`.
    *   Specify `icons` (provide placeholder icon files initially).

2.  **Create Basic File Structure**
    *   Create the directories: `icons/`, `popup/`, `options/`, `options/lib/`, `content_scripts/`.
    *   Create empty placeholder files for all `.js`, `.html`, and `.css` files mentioned in the structure.
    *   Add placeholder icon images (e.g., simple colored squares) in the `icons/` directory.

3.  **Implement Popup (`popup/popup.html`, `popup/popup.js`)**
    *   **`popup.html`**: Create the basic HTML structure with a single button (`id="addProfileButton"`) initially disabled.
    *   **`popup.js`**: 
        *   Add an event listener that runs when the popup is opened.
        *   Inside the listener, use `chrome.tabs.query({ active: true, currentWindow: true })` to get the current tab.
        *   Check if the tab's URL matches the LinkedIn profile pattern (`https://www.linkedin.com/in/*`).
        *   If it matches, enable the button.
        *   Add a click listener to the button.
        *   When clicked, get the current tab's URL again.
        *   Extract a unique identifier for the profile (e.g., the username from the URL).
        *   Use `chrome.storage.local.get` to retrieve the current list of tracked profiles.
        *   Add the new profile identifier to the list (avoiding duplicates).
        *   Use `chrome.storage.local.set` to save the updated list.
        *   Optionally, provide user feedback (e.g., change button text, close popup).

4.  **Implement Options Page - Profile List (`options/options.html`, `options/options.js`, `options/options.css`)**
    *   **`options.html`**: Set up the basic HTML structure. Include a `div` to hold the list of profiles (`id="profilesList"`) and a placeholder `div` or `canvas` for the chart (`id="statsChart"`). Link `options.css` and `options.js`.
    *   **`options.js`**: 
        *   Create a function `loadProfiles()`.
        *   Inside `loadProfiles()`, use `chrome.storage.local.get` to retrieve the tracked profiles and historical data.
        *   Clear the current content of the `#profilesList` div.
        *   Iterate through the tracked profiles.
        *   For each profile, create list item elements displaying the profile identifier, a checkbox (`class="profile-toggle"`, `data-profile-id="..."`), and a "Remove" button (`class="remove-button"`, `data-profile-id="..."`).
        *   Append these elements to `#profilesList`.
        *   Add event listeners to the "Remove" buttons: 
            *   On click, get the `data-profile-id`.
            *   Update the stored list (remove the profile) and associated historical data using `chrome.storage.local.set`.
            *   Call `loadProfiles()` again to refresh the list.
        *   Call `loadProfiles()` when the options page loads.
    *   **`options.css`**: Add basic styling for the list and buttons.

5.  **Implement Content Script - UI Injector (`content_scripts/linkedinUIInjector.js`)**
    *   Write code to reliably find a suitable element in the LinkedIn header (this might require inspection on the live site).
    *   Create a button element ("Sync Follower Counts", `id="syncFollowersButton"`).
    *   Append the button to the header element.
    *   Add a click listener to the button.
    *   Inside the listener, use `chrome.runtime.sendMessage({ action: "startSync" })` to notify the background script.

6.  **Implement Background Script - Sync Orchestration (`background.js`)**
    *   Add a listener for messages using `chrome.runtime.onMessage.addListener`.
    *   Check if the message `action` is `"startSync"`.
    *   If it is, retrieve the list of tracked profile URLs/identifiers from `chrome.storage.local.get`.
    *   Define an asynchronous function `syncProfile(profileId)`:
        *   Construct the full profile URL.
        *   Use `chrome.tabs.create({ url: profileUrl, active: false })` to open the tab.
        *   Use `chrome.tabs.onUpdated.addListener` to wait for the tab to complete loading (check `tabId` and `changeInfo.status === 'complete'`).
        *   Once loaded, use `chrome.scripting.executeScript` to inject `content_scripts/fetchFollowers.js` into the tab.
        *   Handle potential errors during tab creation or script injection.
        *   *(Defer handling the result from `fetchFollowers.js` and tab closing until Step 8)*.
    *   Iterate through the retrieved profile identifiers and call `syncProfile` for each. Manage concurrency if needed (e.g., process one at a time or a small batch).

7.  **Implement Content Script - Follower Fetcher (Placeholder) (`content_scripts/fetchFollowers.js`)**
    *   Create the basic structure for this script.
    *   Add placeholder comments indicating where the follower count extraction logic will go.
    *   Add a placeholder `chrome.runtime.sendMessage({ action: "followerCount", profileId: "extractedProfileId", count: "extractedCount" });`.
    *   *(The actual extraction logic will be added later based on user input/analysis)*.

8.  **Implement Background Script - Data Storage & Tab Closing (`background.js`)**
    *   Modify the `chrome.runtime.onMessage.addListener` to also listen for `{ action: "followerCount" }` messages from `fetchFollowers.js`.
    *   When a `followerCount` message is received:
        *   Retrieve the `profileId` and `count` from the message.
        *   Get the current timestamp.
        *   Use `chrome.storage.local.get` to retrieve the historical data for all profiles.
        *   Find the data array for the specific `profileId`.
        *   Append a new object `{ timestamp: Date.now(), count: parsedCount }` to the array.
        *   Use `chrome.storage.local.set` to save the updated historical data.
        *   Use `chrome.tabs.remove(sender.tab.id)` to close the background tab from which the message was sent.
        *   Handle potential errors during storage or tab closing.

9.  **Implement Options Page - Chart (`options/options.html`, `options/options.js`)**
    *   Download `Chart.js` (or use a CDN) and place it in `options/lib/`. Include it in `options.html` via a `<script>` tag.
    *   **`options.js`**: 
        *   Create a function `renderChart()`.
        *   Inside `renderChart()`, get the states of all checkboxes (`.profile-toggle`).
        *   Filter the historical data retrieved in `loadProfiles()` to include only data for checked profiles.
        *   Format the data into the structure required by Chart.js (datasets, labels). Labels should be timestamps (formatted nicely), and each dataset represents a profile.
        *   Initialize a new Chart.js line chart on the `#statsChart` canvas/div, passing the formatted data.
        *   Configure chart options for tooltips (hover effect):
            *   Use tooltip callbacks (`callbacks.label`) to customize the hover text to show the profile name, follower count, and the delta from the previous point in that dataset.
        *   Call `renderChart()` after `loadProfiles()` finishes.
        *   Add event listeners to the checkboxes (`.profile-toggle`): On change, call `renderChart()` again to update the chart based on the new selection.

10. **Refinement and Error Handling**
    *   Implement robust error handling in `fetchFollowers.js` (e.g., if the follower count element isn't found).
    *   Add error handling in `background.js` for failed tab operations or script injections.
    *   Provide user feedback during the sync process (e.g., disable sync button while running, show status in options page).
    *   Refine CSS for popup and options page for better presentation.
    *   Test thoroughly with various LinkedIn profiles and edge cases. 