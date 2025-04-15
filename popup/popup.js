document.addEventListener("DOMContentLoaded", () => {
	const addProfileButton = document.getElementById("addProfileButton");
	const settingsButton = document.getElementById("settingsButton"); // Get reference to settings button
	let currentProfileId = null; // Store the profile ID of the current tab
	let isCurrentlyTracked = false; // Store the tracking status

	// Function to update button state
	function updateButtonState(profileId, trackedProfiles) {
		isCurrentlyTracked = trackedProfiles.includes(profileId);
		if (isCurrentlyTracked) {
			addProfileButton.textContent = "Remove Profile from Tracker";
		} else {
			addProfileButton.textContent = "Add Profile to Tracker";
		}
		addProfileButton.disabled = false; // Enable the button once status is known
	}

	// Check the current tab URL when the popup opens
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		const currentTab = tabs[0];
		if (currentTab?.url?.startsWith("https://www.linkedin.com/in/")) {
			const profileUrl = currentTab.url;
			const profileIdMatch = profileUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
			currentProfileId = profileIdMatch ? profileIdMatch[1] : null;

			if (currentProfileId) {
				// Get tracked profiles to determine initial button state
				chrome.storage.local.get({ trackedProfiles: [] }, (data) => {
					updateButtonState(currentProfileId, data.trackedProfiles);
				});
			} else {
				addProfileButton.disabled = true; // Disable if URL is profile but no ID found
			}
		} else {
			addProfileButton.disabled = true; // Keep disabled on non-profile pages
		}
	});

	// Handle Add/Remove Profile button click
	addProfileButton.addEventListener("click", () => {
		if (!currentProfileId) return; // Should not happen if button is enabled, but safety check

		chrome.storage.local.get({ trackedProfiles: [] }, (data) => {
			let trackedProfiles = data.trackedProfiles;

			if (isCurrentlyTracked) {
				// Remove the profile
				trackedProfiles = trackedProfiles.filter(
					(id) => id !== currentProfileId,
				);
				chrome.storage.local.set({ trackedProfiles }, () => {
					console.log(`Profile ${currentProfileId} removed.`);
					addProfileButton.textContent = "Profile Removed!";
					addProfileButton.disabled = true;
					setTimeout(() => window.close(), 1000);
				});
			} else {
				// Add the profile (avoid duplicates just in case)
				if (!trackedProfiles.includes(currentProfileId)) {
					trackedProfiles.push(currentProfileId);
					chrome.storage.local.set({ trackedProfiles }, () => {
						console.log(`Profile ${currentProfileId} added.`);
						addProfileButton.textContent = "Profile Added!";
						addProfileButton.disabled = true;
						setTimeout(() => window.close(), 1000);
					});
				} else {
					console.log(
						`Profile ${currentProfileId} was already tracked unexpectedly.`,
					);
					addProfileButton.textContent = "Already Tracked";
					addProfileButton.disabled = true;
					setTimeout(() => window.close(), 1000);
				}
			}
		});
	});

	// Handle Settings button click
	if (settingsButton) {
		settingsButton.addEventListener("click", () => {
			chrome.runtime.openOptionsPage();
		});
	}
});
