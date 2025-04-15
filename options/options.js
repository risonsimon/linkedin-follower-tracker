// Variable to hold the chart instance
let statsChartInstance = null;
// Store profile data globally to avoid re-fetching
let currentFollowerHistory = {};
// Store current aggregation level
let currentAggregationLevel = "daily"; // Default to daily

// --- New Function: Aggregate Data ---
function aggregateData(history, level) {
	if (!history || history.length === 0) {
		return [];
	}

	const aggregatedMap = new Map(); // Use a map for easier replacement

	// Ensure history is sorted ascending by timestamp
	history.sort((a, b) => a.timestamp - b.timestamp);

	for (const point of history) {
		const pointDate = new Date(point.timestamp);
		const periodStartDate = new Date(pointDate);

		if (level === "monthly") {
			periodStartDate.setDate(1); // Set to the 1st of the month
		}
		// Always set to the start of the day for the key
		periodStartDate.setHours(0, 0, 0, 0);
		const periodStartKey = periodStartDate.getTime();

		// Store the latest count with the *normalized* timestamp (start of the period)
		aggregatedMap.set(periodStartKey, {
			timestamp: periodStartKey, // Use normalized timestamp
			count: point.count, // Use the count from the latest point in the period
		});
	}

	// Convert map values back to an array, already sorted by key (timestamp)
	const aggregatedHistory = Array.from(aggregatedMap.values());

	return aggregatedHistory;
}
// --- End New Function ---

function loadProfiles() {
	chrome.storage.local.get(["trackedProfiles", "followerHistory"], (result) => {
		const profiles = result.trackedProfiles || [];
		currentFollowerHistory = result.followerHistory || {}; // Store data
		const profilesListDiv = document.getElementById("profilesList");
		profilesListDiv.innerHTML = ""; // Clear existing list

		if (profiles.length === 0) {
			profilesListDiv.textContent = "No profiles tracked yet.";
			// Clear any existing chart if no profiles are tracked
			if (statsChartInstance) {
				statsChartInstance.destroy();
				statsChartInstance = null;
			}
			// Hide chart and table container if no profiles
			const chartContainer = document.getElementById("chartContainer");
			if (chartContainer) chartContainer.style.display = "none";
			const tableContainer = document.getElementById("dataTableContainer");
			if (tableContainer) tableContainer.style.display = "none"; // Hide table too
			return;
		}

		// Show chart and table container if there are profiles
		const chartContainer = document.getElementById("chartContainer");
		if (chartContainer) chartContainer.style.display = "block";
		const tableContainer = document.getElementById("dataTableContainer");
		if (tableContainer) tableContainer.style.display = "block"; // Show table too

		const ul = document.createElement("ul");
		for (const profileId of profiles) {
			const li = document.createElement("li");

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.className = "profile-toggle";
			checkbox.dataset.profileId = profileId;
			checkbox.checked = true; // Default to checked
			// Add event listener for chart and table rendering
			checkbox.addEventListener("change", () => {
				renderChart();
				renderDataTable();
			});

			const label = document.createElement("span");
			// For now, just use the profile ID. We might store more details later.
			label.textContent = ` ${profileId} `;
			label.style.marginLeft = "5px";

			const removeButton = document.createElement("button");
			removeButton.textContent = "Remove";
			removeButton.className = "remove-button";
			removeButton.dataset.profileId = profileId;

			removeButton.addEventListener("click", () => {
				removeProfile(profileId);
			});

			li.appendChild(checkbox);
			li.appendChild(label);
			li.appendChild(removeButton);
			ul.appendChild(li);
		}
		profilesListDiv.appendChild(ul);

		// Call renderChart and renderDataTable after profiles are loaded and list is built
		try {
			// Read initial aggregation level (might have changed before load)
			const selectedRadio = document.querySelector(
				'input[name="aggregation"]:checked',
			);
			currentAggregationLevel = selectedRadio ? selectedRadio.value : "daily";
			renderChart();
		} catch (error) {
			console.error("Error rendering chart:", error);
			// Optionally display an error message in the chart container
			const chartContainer = document.getElementById("chartContainer");
			if (chartContainer) {
				chartContainer.innerHTML = `<p style="color: red;">Could not render chart. Error: ${error.message}</p>`;
			}
		}
		renderDataTable(); // Call table rendering even if chart fails
	});
}

// Function to calculate the delta between two points
function calculateDelta(currentPoint, previousPoint) {
	if (!previousPoint) {
		return { text: "(first data point)", value: 0 };
	}
	const delta = currentPoint.count - previousPoint.count;
	const sign = delta >= 0 ? "+" : "";
	return { text: `(${sign}${delta})`, value: delta };
}

function renderChart() {
	// Get current aggregation level
	const aggregationLevel = currentAggregationLevel;

	const checkboxes = document.querySelectorAll(".profile-toggle");
	const visibleProfileIds = [];
	for (const cb of checkboxes) {
		if (cb.checked) {
			visibleProfileIds.push(cb.dataset.profileId);
		}
	}

	const datasets = [];
	const allTimestamps = new Set(); // Keep track of unique timestamps in aggregated data

	let index = 0;
	for (const profileId of visibleProfileIds) {
		const rawHistory = currentFollowerHistory[profileId] || [];

		// Aggregate the data based on the selected level
		const aggregatedHistory = aggregateData(rawHistory, aggregationLevel);

		if (aggregatedHistory.length === 0) continue;

		// Use aggregated timestamps
		for (const point of aggregatedHistory) {
			allTimestamps.add(point.timestamp);
		}

		// Map aggregated data to chart points
		const dataPoints = aggregatedHistory.map((point) => ({
			x: point.timestamp,
			y: point.count,
			profileId: profileId, // Store profileId with point for tooltip
		}));

		datasets.push({
			label: profileId,
			data: dataPoints,
			fill: false,
			borderColor: `hsl(${(index * 60) % 360}, 70%, 50%)`, // Assign distinct colors
			tension: 0.1,
		});
		index++;
	}

	// Prepare labels (sorted unique timestamps from aggregated data)
	const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

	const ctx = document.getElementById("statsChart").getContext("2d");

	// Destroy previous chart instance if it exists
	if (statsChartInstance) {
		statsChartInstance.destroy();
	}

	// Check if there's any data to display based on aggregation
	if (datasets.length === 0 || sortedTimestamps.length === 0) {
		console.log("No data to display in chart.");
		// Optional: display a message on the canvas or hide it
		const chartContainer = document.getElementById("chartContainer");
		if (chartContainer) chartContainer.style.display = "none";
		return;
	}

	// Ensure chart container is visible if we have data
	const chartContainer = document.getElementById("chartContainer");
	if (chartContainer) chartContainer.style.display = "block";

	// Check if Chart is defined before using it
	if (typeof Chart === "undefined") {
		console.error("Chart.js is not loaded or defined.");
		if (chartContainer)
			chartContainer.innerHTML =
				'<p style="color: red;">Error: Chart library failed to load.</p>';
		return;
	}

	statsChartInstance = new Chart(ctx, {
		type: "line",
		data: {
			datasets: datasets,
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				x: {
					type: "time",
					time: {
						// Adjust unit and tooltip format based on aggregation
						unit: aggregationLevel === "monthly" ? "month" : "day",
						tooltipFormat:
							aggregationLevel === "monthly" ? "MMM yyyy" : "MMM d, yyyy", // Simpler format
					},
					title: {
						display: true,
						text: aggregationLevel === "monthly" ? "Month" : "Date",
					},
				},
				y: {
					beginAtZero: false, // Start axis near the lowest value
					title: {
						display: true,
						text: "Follower Count",
					},
				},
			},
			plugins: {
				tooltip: {
					mode: "index", // Find items across datasets at the same index
					intersect: false, // Trigger tooltip even when not directly over an item
				},
			},
		},
	});
}

function removeProfile(profileIdToRemove) {
	chrome.storage.local.get(["trackedProfiles", "followerHistory"], (result) => {
		const initialProfiles = result.trackedProfiles || [];
		const followerHistory = result.followerHistory || {};

		// Remove the profile from the list
		const updatedProfiles = initialProfiles.filter(
			(id) => id !== profileIdToRemove,
		);

		// Remove the associated historical data
		if (followerHistory[profileIdToRemove]) {
			delete followerHistory[profileIdToRemove];
		}
		currentFollowerHistory = followerHistory; // Update global data

		// Save the updated lists
		chrome.storage.local.set(
			{ trackedProfiles: updatedProfiles, followerHistory: followerHistory },
			() => {
				console.log(`Profile ${profileIdToRemove} removed.`);
				loadProfiles(); // Refresh the list, chart, and table
			},
		);
	});
}

// Fully reconstructed renderDataTable function
function renderDataTable() {
	console.log("renderDataTable: Starting table render...");
	// Get current aggregation level
	const aggregationLevel = currentAggregationLevel;

	const tableContainer = document.getElementById("dataTableContainer");
	if (!tableContainer) {
		console.error("renderDataTable: Could not find table container div");
		return;
	}
	tableContainer.innerHTML = ""; // Clear previous table

	const checkboxes = document.querySelectorAll(".profile-toggle");
	const visibleProfileIds = [];
	for (const cb of checkboxes) {
		if (cb.checked) {
			visibleProfileIds.push(cb.dataset.profileId);
		}
	}
	console.log("renderDataTable: Visible profile IDs:", visibleProfileIds);

	const allDataPoints = [];
	// Store aggregated data per profile for delta calculation
	const processedAggregatedData = {};

	for (const profileId of visibleProfileIds) {
		const rawHistory = currentFollowerHistory[profileId] || [];
		// Aggregate the data based on the selected level
		const aggregatedHistory = aggregateData(rawHistory, aggregationLevel);

		// Store aggregated history for delta calculation later
		processedAggregatedData[profileId] = aggregatedHistory;

		// Add aggregated points to the list for table rows
		for (const point of aggregatedHistory) {
			allDataPoints.push({ ...point, profileId });
		}
	}

	// Sort all aggregated data points by timestamp, descending (most recent first)
	allDataPoints.sort((a, b) => b.timestamp - a.timestamp);

	if (allDataPoints.length === 0) {
		tableContainer.textContent =
			"No follower data available for selected profiles.";
		console.log("renderDataTable: No data points found.");
		return;
	}

	console.log("renderDataTable: Creating table...");
	const table = document.createElement("table");
	table.className = "data-table";

	// Create header row
	const thead = table.createTHead();
	const headerRow = thead.insertRow();
	const headers = ["Profile ID", "Timestamp", "Follower Count", "Change"];
	for (const text of headers) {
		const th = document.createElement("th");
		th.textContent = text;
		headerRow.appendChild(th);
	}

	// Create body rows
	const tbody = table.createTBody();

	for (const point of allDataPoints) {
		const row = tbody.insertRow();

		// Profile ID
		let cell = row.insertCell();
		cell.textContent = point.profileId;

		// Timestamp - Format based on aggregation level
		cell = row.insertCell();
		const displayDate = new Date(point.timestamp);
		cell.textContent =
			aggregationLevel === "monthly"
				? displayDate.toLocaleDateString(undefined, {
						year: "numeric",
						month: "short",
					})
				: displayDate.toLocaleDateString(); // Use locale date string for daily

		// Follower Count
		cell = row.insertCell();
		cell.textContent = point.count;

		// Change calculation - using aggregated data
		cell = row.insertCell();
		const profileAggregatedHistory =
			processedAggregatedData[point.profileId] || [];
		// Find the index of the current point in the *sorted* aggregated history
		const currentHistoryIndex = profileAggregatedHistory.findIndex(
			(p) => p.timestamp === point.timestamp,
		);
		const previousHistoryPoint =
			currentHistoryIndex > 0
				? profileAggregatedHistory[currentHistoryIndex - 1]
				: null;

		const deltaInfo = calculateDelta(
			{ count: point.count },
			previousHistoryPoint ? { count: previousHistoryPoint.count } : null,
		);

		cell.textContent = deltaInfo.text;
		// Apply color styling for change
		if (deltaInfo.value > 0) {
			cell.style.color = "green";
		} else if (deltaInfo.value < 0) {
			cell.style.color = "red";
		}
	}

	tableContainer.appendChild(table);
	console.log("renderDataTable: Table rendered.");
}

// Load profiles when the options page is opened
document.addEventListener("DOMContentLoaded", () => {
	loadProfiles();

	// Add event listeners for aggregation radio buttons
	const radioButtons = document.querySelectorAll('input[name="aggregation"]');
	for (const radio of radioButtons) {
		radio.addEventListener("change", (event) => {
			currentAggregationLevel = event.target.value;
			console.log(`Aggregation level changed to: ${currentAggregationLevel}`);
			// Re-render chart and table with new aggregation
			renderChart();
			renderDataTable();
		});
	}
});

// Add a listener for storage changes to update the chart and table if data changes elsewhere
chrome.storage.onChanged.addListener((changes, namespace) => {
	if (
		namespace === "local" &&
		(changes.followerHistory || changes.trackedProfiles)
	) {
		console.log("Storage changed, reloading profiles, chart and table...");
		loadProfiles(); // This will call renderChart and renderDataTable
	}
});
