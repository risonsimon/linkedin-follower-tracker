# Product Requirements Document: LinkedIn Follower Tracker Chrome Extension

## 1. Introduction

This document outlines the requirements for a Chrome extension designed to track the follower counts of specified LinkedIn profiles. The extension aims to provide a simple way for users to monitor follower growth over time.

## 2. Goals

*   Allow users to easily add LinkedIn profiles to a tracking list directly from the profile page.
*   Provide a central location (options page) to view and manage the list of tracked profiles.
*   Visualize follower count changes over time for tracked profiles.
*   Enable manual triggering of follower count updates.
*   Store all data locally using Chrome's storage API.
*   Adhere to Chrome Manifest V3 standards.

## 3. Features

### 3.1. Popup Interface

*   **Functionality:** Allows adding the currently viewed LinkedIn profile to the tracking list and accessing the extension's settings.
*   **Trigger:** Clicking the extension icon in the Chrome toolbar.
*   **UI:**
    *   A main button labeled "Add Profile to Tracker".
    *   The main button should be **disabled** by default.
    *   The main button becomes **enabled** only when the user is on a valid LinkedIn profile page (URL pattern: `https://www.linkedin.com/in/*`).
    *   A separate settings icon/button (e.g., a gear icon) always visible.
*   **Action (Add Profile Button):** When the enabled button is clicked, the extension extracts the current profile URL/identifier and saves it to `chrome.storage.local`.
*   **Action (Settings Button):** When the settings button is clicked, the extension opens the Options Page (`options.html`) in a new tab using `chrome.runtime.openOptionsPage()`.

### 3.2. Options Page

*   **Access:** Via the settings icon in the extension popup.
*   **Functionality:** Manage tracked profiles and view follower statistics.
*   **UI Components:**
    *   **Tracked Profiles List:**
        *   Displays all currently tracked LinkedIn profiles (e.g., by name or profile URL).
        *   Each entry has a "Remove" button next to it. Clicking removes the profile from tracking and updates `chrome.storage.local`.
        *   Each entry has a checkbox next to it.
    *   **Follower Growth Chart:**
        *   A line chart displaying follower counts over time.
        *   Uses a charting library (e.g., Chart.js).
        *   Displays data only for profiles whose corresponding checkbox in the "Tracked Profiles List" is checked.
        *   **Hover Interaction:** When hovering over a data point on the chart:
            *   Show the exact follower count for that profile on that specific date/time.
            *   Show the change in follower count (delta) compared to the previously recorded data point for that profile.
*   **Data:** Loads profile list and historical follower data from `chrome.storage.local`.

### 3.3. Sync Functionality

*   **Trigger:** A button labeled "Sync Follower Counts" added to the main LinkedIn page header (e.g., next to the search bar or profile icon).
*   **Action (initiated by clicking the sync button):**
    1.  The background script retrieves the list of tracked profile URLs from `chrome.storage.local`.
    2.  For each profile URL:
        *   Opens the profile page in a new, inactive background tab (`chrome.tabs.create({ active: false })`).
        *   Programmatically injects a content script (`fetchFollowers.js`) into the newly opened tab after it loads (`chrome.scripting.executeScript`).
    3.  The injected script (`fetchFollowers.js`) locates the follower count element on the profile page (selector logic to be determined) and extracts the count.
    4.  The injected script sends the follower count and profile identifier back to the background script.
    5.  The background script receives the count and stores it along with the current timestamp and profile identifier in `chrome.storage.local`. The data should be structured to maintain historical trends (e.g., `{ "profileId": [{ timestamp: ..., count: ... }, ...] }`).
    6.  The background script closes the background tab after successfully retrieving or failing to retrieve the count.
*   **Implementation:**
    *   A content script (`linkedinUIInjector.js`) runs on LinkedIn pages to inject the "Sync Follower Counts" button into the header.
    *   The background script (`background.js`) orchestrates the tab opening, script injection, data storage, and tab closing.

## 4. Technical Requirements

*   **Manifest Version:** V3
*   **Permissions:**
    *   `storage`: To save/retrieve tracked profiles and follower history.
    *   `scripting`: To inject content scripts into LinkedIn pages.
    *   `tabs`: To open profile pages in background tabs.
    *   `activeTab`: For the popup to read the current tab's URL.
*   **Data Storage:** `chrome.storage.local`.
*   **Content Scripts:**
    *   One declared in `manifest.json` to inject the UI button.
    *   One programmatically injected by the background script to scrape follower counts.
*   **Background:** Service Worker (`background.js`) to handle sync logic and data storage.
*   **Error Handling:** Gracefully handle scenarios where follower counts cannot be found (e.g., LinkedIn UI changes, private profiles).

## 5. Non-Goals

*   Automatic background syncing (sync is manually triggered).
*   Storing data in the cloud.
*   Advanced analytics beyond follower count trends.
*   Support for browsers other than Chrome.

## 6. Future Considerations (Optional)

*   Allowing users to customize the sync button location.
*   Adding notifications for significant follower changes.
*   Exporting/importing tracked data.
*   Setting custom names/aliases for tracked profiles. 