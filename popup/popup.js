document.addEventListener("DOMContentLoaded", () => {
	const addProfileButton = document.getElementById("addProfileButton");
	const settingsButton = document.getElementById("settingsButton"); // Get reference to settings button

	// Check the current tab URL when the popup opens
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		const currentTab = tabs[0];
		if (currentTab?.url?.startsWith("https://www.linkedin.com/in/")) {
			addProfileButton.disabled = false;
		}
	});

	// Handle Add Profile button click
	addProfileButton.addEventListener("click", () => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			const currentTab = tabs[0];
			if (currentTab?.url) {
				const profileUrl = currentTab.url;
				const profileIdMatch = profileUrl.match(
					/linkedin\.com\/in\/([^\/\?]+)/,
				);
				const profileId = profileIdMatch ? profileIdMatch[1] : profileUrl;

				chrome.storage.local.get({ trackedProfiles: [] }, (data) => {
					const trackedProfiles = data.trackedProfiles;
					// Store profile ID - In Step 4, we decided to store just the ID.
					// Let's align with that decision here for consistency.
					// const profileData = { id: profileId, url: profileUrl }; // Old approach

					// Avoid duplicates based on profile ID
					if (!trackedProfiles.includes(profileId)) {
						// Check if the ID string exists
						trackedProfiles.push(profileId); // Store only the ID
						chrome.storage.local.set({ trackedProfiles }, () => {
							console.log(`Profile ${profileId} added.`);
							addProfileButton.textContent = "Profile Added!";
							addProfileButton.disabled = true;
							setTimeout(() => window.close(), 1000);
						});
					} else {
						console.log(`Profile ${profileId} is already tracked.`);
						addProfileButton.textContent = "Already Tracked";
						addProfileButton.disabled = true;
						setTimeout(() => window.close(), 1000);
					}
				});
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
