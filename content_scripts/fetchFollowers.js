// Placeholder: Logic to extract the follower count will go here.
// This will likely involve finding a specific element on the page and parsing its text content.

// Placeholder: Logic to extract a unique profile identifier (e.g., from the URL or page content)
// For now, we'll extract it from the current URL
const profileUrl = window.location.href;
const urlParts = profileUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
const profileId = urlParts ? urlParts[1] : "unknownProfile"; // Use the part after /in/ as the ID

// Function to find the follower count on the page
function findFollowerCount() {
	console.log("[Follower Fetcher] Attempting to find follower count..."); // DEBUG
	let count = null;
	const searchTerm = "followers";
	const walker = document.createTreeWalker(
		document.body,
		NodeFilter.SHOW_TEXT,
		null,
		false,
	);

	let currentNode;
	while (true) {
		currentNode = walker.nextNode();
		if (!currentNode) {
			break; // No more nodes
		}
		const nodeText = currentNode.nodeValue;
		console.log(
			`[Follower Fetcher] Checking node: ${nodeText?.trim().substring(0, 50)}`,
		); // DEBUG: Log node text

		if (
			nodeText?.trim() &&
			nodeText.toLowerCase().includes(searchTerm.toLowerCase())
		) {
			const parent = currentNode.parentElement;

			if (parent) {
				const parentText = parent.innerText;
				// Regex: looks for digits (potentially with commas/periods) followed by whitespace, then the search term
				const regex = new RegExp(`([\\d,\\.]+)\\s+${searchTerm}`, "i");
				const match = parentText?.match(regex);

				if (match?.[1]) {
					// Remove commas (and periods if used as thousand separators) before parsing
					const countString = match[1].replace(/[\,\.]/g, "");
					// Parse the cleaned string into an integer
					const potentialCount = Number.parseInt(countString, 10);
					// Check if parsing was successful (result is not NaN)
					if (!Number.isNaN(potentialCount)) {
						count = potentialCount;
						console.log(`[Follower Fetcher] Found potential count: ${count}`); // DEBUG
						break; // Found a valid number, stop searching
					}
				} else {
					// DEBUG
					console.log(
						`[Follower Fetcher] Regex failed for parent: ${parentText?.substring(0, 100)}`,
					); // DEBUG
				} // DEBUG
			}
		}
	}
	if (count === null) {
		// DEBUG
		console.log(
			"[Follower Fetcher] Walker finished, count not found in this attempt.",
		); // DEBUG
	} // DEBUG
	return count;
}

// Function to periodically check for the follower count
function waitForFollowerCount(timeoutMs = 30000, intervalMs = 500) {
	console.log(
		`[Follower Fetcher] Waiting for follower count for ${profileId}...`,
	);
	let elapsedTime = 0;

	const intervalId = setInterval(() => {
		elapsedTime += intervalMs;
		const followerCount = findFollowerCount();

		if (followerCount !== null) {
			clearInterval(intervalId); // Stop polling
			console.log(
				`[Follower Fetcher] Found follower count for ${profileId}: ${followerCount}`,
			);
			// Send success message
			if (profileId !== "unknownProfile") {
				chrome.runtime.sendMessage({
					action: "followerCount",
					profileId: profileId,
					count: followerCount,
				});
			} else {
				// Should not happen if we found a count, but handle defensively
				sendFetchError("Could not determine profile ID after finding count");
			}
		} else if (elapsedTime >= timeoutMs) {
			clearInterval(intervalId); // Stop polling
			console.error(
				`[Follower Fetcher] Timeout waiting for follower count for ${profileId}.`,
			);
			// Send error message
			sendFetchError("Could not find follower count (timeout)");
		}
		// else: continue polling
	}, intervalMs);
}

// Helper function to send fetchError message
function sendFetchError(reason) {
	const errorReason =
		profileId === "unknownProfile" ? "Could not determine profile ID" : reason;
	console.error(
		`[Follower Fetcher] Fetch failed for ${profileId === "unknownProfile" ? window.location.href : profileId}. Reason: ${errorReason}`,
	);
	chrome.runtime.sendMessage({
		action: "fetchError",
		profileId: profileId, // Send 'unknownProfile' if ID extraction failed earlier
		error: errorReason,
	});
}

// --- Main Execution ---

// Check if profile ID was extracted successfully before starting the wait
if (profileId === "unknownProfile") {
	sendFetchError("Could not determine profile ID from URL");
} else {
	// Start waiting for the follower count
	waitForFollowerCount();
}
