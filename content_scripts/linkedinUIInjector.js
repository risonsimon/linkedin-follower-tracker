console.log("LinkedIn UI Injector content script loaded.");

function findHeaderAndInjectButton() {
	// Try to find a relatively stable element in the LinkedIn header.
	// This selector might need adjustment if LinkedIn changes its structure.
	const headerElement = document.querySelector(".global-nav__primary-items");

	if (headerElement && !document.getElementById("syncFollowersButton")) {
		console.log("Header element found. Injecting button.");
		const syncButton = document.createElement("button");
		syncButton.id = "syncFollowersButton";
		syncButton.textContent = "Sync Follower Counts";

		// Basic styling - can be refined
		syncButton.style.marginLeft = "10px";
		syncButton.style.padding = "5px 10px";
		syncButton.style.cursor = "pointer";
		syncButton.style.border = "1px solid #0a66c2";
		syncButton.style.backgroundColor = "#e6f2ff";
		syncButton.style.color = "#0a66c2";
		syncButton.style.borderRadius = "4px";
		syncButton.style.fontWeight = "600";

		syncButton.addEventListener("click", () => {
			console.log("Sync button clicked.");
			// Provide visual feedback immediately
			syncButton.textContent = "Syncing...";
			syncButton.disabled = true;
			chrome.runtime.sendMessage({ action: "startSync" }, (response) => {
				// Background script will now send status updates
				console.log("Message sent to background script.", response);

				if (chrome.runtime.lastError) {
					console.error("Error sending message:", chrome.runtime.lastError);
					// Handle error, reset button state immediately
					syncButton.textContent = "Sync Error";
					// Optionally re-enable after a delay or based on error type
					setTimeout(() => {
						syncButton.textContent = "Sync Follower Counts";
						syncButton.disabled = false;
					}, 3000); // Keep error state visible for a bit
				}
				// No immediate reset here anymore. Wait for background messages.
			});
		});

		// Append as the last item in the primary items list
		headerElement.appendChild(syncButton);
		console.log("Sync button injected.");
	} else if (!headerElement) {
		console.log("Header element not found. Button not injected.");
	} else {
		console.log("Sync button already exists.");
	}
}

// Listen for status updates from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === "syncStatusUpdate") {
		console.log("Received status update:", message.status, message.details);
		const syncButton = document.getElementById("syncFollowersButton");
		if (syncButton) {
			switch (message.status) {
				case "syncStart":
					syncButton.textContent = "Syncing (0%)...";
					syncButton.disabled = true;
					break;
				case "syncProgress": {
					const percent =
						message.details.total > 0
							? Math.round(
									(message.details.current / message.details.total) * 100,
								)
							: 0;
					syncButton.textContent = `Syncing (${percent}%)...`;
					syncButton.disabled = true;
					break;
				}
				case "syncComplete":
					syncButton.textContent = "Sync Complete!";
					syncButton.disabled = false;
					// Revert back to original text after a short delay
					setTimeout(() => {
						syncButton.textContent = "Sync Follower Counts";
					}, 2000);
					break;
				case "syncError": // Optional: Handle specific error status if added in background.js
					syncButton.textContent = "Sync Error";
					syncButton.disabled = false;
					setTimeout(() => {
						syncButton.textContent = "Sync Follower Counts";
					}, 3000);
					break;
				default:
					// Optional: Handle unexpected statuses or reset if needed
					console.warn("Unhandled sync status:", message.status);
					syncButton.textContent = "Sync Follower Counts";
					syncButton.disabled = false;
					break;
			}
		}
	}
});

// LinkedIn uses dynamic loading, so we need to be robust about when we inject.
// We can try injecting immediately and also use a MutationObserver or interval
// to handle cases where the header loads later.

// Initial attempt
findHeaderAndInjectButton();

// Use MutationObserver to detect when the target element appears
const observer = new MutationObserver((mutationsList, observer) => {
	for (const mutation of mutationsList) {
		if (mutation.type === "childList") {
			// Check if the header element is now available
			if (
				document.querySelector(".global-nav__primary-items") &&
				!document.getElementById("syncFollowersButton")
			) {
				console.log("Header appeared after initial load. Injecting button.");
				findHeaderAndInjectButton();
				// Once injected, we might not need the observer anymore
				// observer.disconnect();
				// Keep observing in case of SPA navigation removing/re-adding the header
			}
		}
	}
});

// Start observing the body for child list changes
observer.observe(document.body, { childList: true, subtree: true });

// As a fallback, also run periodically in case MutationObserver fails
// or the element is added without triggering the observer correctly.
const intervalId = setInterval(() => {
	if (!document.getElementById("syncFollowersButton")) {
		// console.log("Interval check: Injecting button.");
		findHeaderAndInjectButton();
	} else {
		// Button exists, clear interval
		// console.log("Interval check: Button exists, clearing interval.");
		clearInterval(intervalId);
	}
}, 3000); // Check every 3 seconds

// Stop the interval after some time to avoid unnecessary checks
setTimeout(() => {
	clearInterval(intervalId);
	console.log("Stopped periodic check for header element.");
}, 30000); // Stop after 30 seconds
