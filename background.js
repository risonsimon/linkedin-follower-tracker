console.log("Background service worker started.");

// Global variable to store the tab ID where the sync was initiated
let syncInitiatorTabId = null;

// Function to inject the follower fetching script into a tab
async function injectFollowerScript(tabId) {
	console.log(`Injecting fetchFollowers.js into tab ${tabId}`);
	try {
		const results = await chrome.scripting.executeScript({
			target: { tabId: tabId },
			files: ["content_scripts/fetchFollowers.js"],
		});
		console.log(`Script injected successfully into tab ${tabId}`, results);
	} catch (err) {
		console.error(`Failed to inject script into tab ${tabId}:`, err);
		// Tab might have been closed or navigated away, or permissions issue
		// Close the tab anyway to prevent orphaned tabs
		try {
			await chrome.tabs.remove(tabId);
			console.log(`Closed tab ${tabId} after injection failure.`);
		} catch (closeErr) {
			console.error(
				`Failed to close tab ${tabId} after injection error:`,
				closeErr,
			);
		}
	}
}

// Function to open a profile, wait for loading, and inject the script
async function syncProfile(profileId) {
	const profileUrl = `https://www.linkedin.com/in/${profileId}/`;
	console.log(`Starting sync for profile: ${profileId} (${profileUrl})`);

	let tabId = null;
	try {
		// Create tab in the background
		const tab = await chrome.tabs.create({ url: profileUrl, active: false });
		tabId = tab.id;
		console.log(`Created background tab ${tabId} for ${profileId}`);

		// Wait for the tab to complete loading
		await new Promise((resolve, reject) => {
			const listener = (updatedTabId, changeInfo, updatedTab) => {
				// Check if the update is for our tab and it's complete
				if (updatedTabId === tabId && changeInfo.status === "complete") {
					// Remove the listener to prevent memory leaks
					chrome.tabs.onUpdated.removeListener(listener);
					console.log(`Tab ${tabId} finished loading.`);
					resolve();
				} else if (
					updatedTabId === tabId &&
					(changeInfo.status === "error" ||
						updatedTab.url?.startsWith("chrome://"))
				) {
					// Handle cases where the tab fails to load (e.g., network error, invalid URL redirection)
					chrome.tabs.onUpdated.removeListener(listener);
					console.error(
						`Tab ${tabId} failed to load or navigated to an error page.`,
					);
					reject(new Error(`Tab ${tabId} failed to load.`));
				}
			};

			// Add the listener
			chrome.tabs.onUpdated.addListener(listener);

			// Set a timeout in case the tab never loads
			setTimeout(() => {
				chrome.tabs.onUpdated.removeListener(listener); // Clean up listener
				reject(new Error(`Timeout waiting for tab ${tabId} to load.`));
			}, 60000); // 60-second timeout
		});

		// Inject the content script
		await injectFollowerScript(tabId);
		// Note: Tab closing will be handled in Step 8 after receiving data
	} catch (err) {
		console.error(`Error processing profile ${profileId}:`, err);
		// Ensure the tab is closed if any error occurred during the process
		if (tabId) {
			try {
				await chrome.tabs.remove(tabId);
				console.log(`Closed tab ${tabId} due to error during processing.`);
			} catch (closeErr) {
				console.error(`Failed to close tab ${tabId} after error:`, closeErr);
			}
		}
	}
}

// Function to send messages to the injector script
async function sendSyncStatusUpdate(status, details = {}) {
	if (syncInitiatorTabId) {
		try {
			await chrome.tabs.sendMessage(syncInitiatorTabId, {
				action: "syncStatusUpdate",
				status,
				details,
			});
			console.log(
				`Sent sync status update '${status}' to tab ${syncInitiatorTabId}`,
			);
		} catch (error) {
			console.warn(
				`Could not send sync status update to tab ${syncInitiatorTabId}:`,
				error.message,
			);
			// Tab might have been closed, reset the initiator tab ID
			syncInitiatorTabId = null;
		}
	}
}

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log(
		"Message received in background:",
		message,
		"from sender:",
		sender,
	);

	if (message.action === "startSync") {
		console.log("Received startSync command.");
		// Indicate that we will send a response asynchronously
		// sendResponse({ status: "Sync started" }); // Optional: acknowledge immediately

		// Store the initiating tab's ID
		syncInitiatorTabId = sender.tab?.id;
		console.log(`Sync initiated from tab: ${syncInitiatorTabId}`);

		// Send initial status update
		sendSyncStatusUpdate("syncStart");

		// Retrieve tracked profiles and start the sync process
		chrome.storage.local.get("trackedProfiles", async (data) => {
			const profiles = data.trackedProfiles || [];
			console.log(`Found ${profiles.length} profiles to sync:`, profiles);

			// Initialize sync state
			const syncState = {
				expectedCount: profiles.length,
				successCount: 0,
				errorCount: 0,
			};
			await chrome.storage.local.set({ syncState: syncState });

			if (profiles.length === 0) {
				console.log("No profiles to sync.");
				checkSyncCompletion(syncState); // Send completion message immediately
				return;
			}

			// Process profiles sequentially
			console.log("Starting sequential profile sync...");
			let successCount = 0;
			let errorCount = 0;
			for (let i = 0; i < profiles.length; i++) {
				const profileId = profiles[i];
				sendSyncStatusUpdate("syncProgress", {
					current: i + 1,
					total: profiles.length,
					profileId,
				});
				try {
					await syncProfile(profileId);
					// We'll increment success count when the 'followerCount' message comes back
					successCount++;
				} catch (error) {
					console.error(
						`Sync failed for profile ${profileId} during orchestration:`,
						error,
					);
					errorCount++; // Increment error count if syncProfile itself throws an unhandled error
				}
				// Optional delay between profiles if needed
				// await new Promise(resolve => setTimeout(resolve, 1000));
			}
			console.log("Finished initiating sync for all profiles.");
			// Note: Final 'syncComplete' message is now sent after processing all followerCount/fetchError messages
			// We need a way to track completion. Let's add a counter.
		});

		// Return true to indicate you wish to send a response asynchronously
		return true;
	}

	// Handle followerCount message
	if (message.action === "followerCount") {
		console.log(
			`Received followerCount for profile ${message.profileId}: ${message.count}`,
		);

		const { profileId, count } = message;
		const timestamp = Date.now();

		const tabIdToClose = sender.tab?.id;
		if (!tabIdToClose) {
			console.error(
				"Received followerCount message without a valid sender tab ID.",
			);
		}

		// Retrieve current history, update it, and save back
		chrome.storage.local.get(["followerHistory", "syncState"], (data) => {
			const history = data.followerHistory || {};
			const profileHistory = history[profileId] || [];

			profileHistory.push({ timestamp, count });
			profileHistory.sort((a, b) => a.timestamp - b.timestamp);
			history[profileId] = profileHistory;

			const syncState = data.syncState || {
				expectedCount: 0,
				successCount: 0,
				errorCount: 0,
			};
			syncState.successCount++;

			chrome.storage.local.set(
				{ followerHistory: history, syncState: syncState },
				() => {
					if (chrome.runtime.lastError) {
						console.error(
							`Error saving follower history for ${profileId}:`,
							chrome.runtime.lastError,
						);
					} else {
						console.log(`Successfully saved follower count for ${profileId}.`);
					}

					checkSyncCompletion(syncState);

					if (tabIdToClose) {
						closeTab(
							tabIdToClose,
							`after processing follower count for ${profileId}`,
						);
					}
				},
			);
		});

		return true; // Indicate async response
	}

	// Handle fetchError message
	if (message.action === "fetchError") {
		const { profileId, error } = message;
		console.warn(
			`Received fetchError for profile ${profileId || "(unknown ID)"}: ${error}`,
		);

		const tabIdToClose = sender.tab?.id;
		if (!tabIdToClose) {
			console.error(
				"Received fetchError message without a valid sender tab ID.",
			);
		}

		// Update sync state (increment error count)
		chrome.storage.local.get("syncState", (data) => {
			const syncState = data.syncState || {
				expectedCount: 0,
				successCount: 0,
				errorCount: 0,
			};
			syncState.errorCount++;
			chrome.storage.local.set({ syncState: syncState }, () => {
				if (chrome.runtime.lastError) {
					console.error(
						"Error updating sync state after fetchError:",
						chrome.runtime.lastError,
					);
				}
				checkSyncCompletion(syncState);

				// Close the tab even if there was an error
				if (tabIdToClose) {
					closeTab(tabIdToClose, `after receiving fetchError for ${profileId}`);
				}
			});
		});

		return true; // Indicate async response
	}

	console.log(`Unhandled message action: ${message.action}`);
	return false;
});

// Function to close a tab and log errors
function closeTab(tabId, reason) {
	chrome.tabs.remove(tabId, () => {
		if (chrome.runtime.lastError) {
			console.error(
				`Error closing tab ${tabId} (${reason}):`,
				chrome.runtime.lastError.message,
			);
		} else {
			console.log(`Closed tab ${tabId} (${reason}).`);
		}
	});
}

// Function to check if sync is complete and send final message
function checkSyncCompletion(syncState) {
	const { expectedCount, successCount, errorCount } = syncState;
	if (successCount + errorCount >= expectedCount) {
		console.log(
			`Sync complete. Success: ${successCount}, Errors: ${errorCount}, Total: ${expectedCount}`,
		);
		sendSyncStatusUpdate("syncComplete", {
			totalProfiles: expectedCount,
			successCount: successCount,
			errorCount: errorCount,
		});
		// Reset sync state
		chrome.storage.local.remove("syncState");
		// Reset initiator tab ID after completion
		syncInitiatorTabId = null;
	}
}

// Optional: Listener for when the extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
	console.log("LinkedIn Follower Tracker installed/updated.");
	// Perform any initial setup if needed
});
