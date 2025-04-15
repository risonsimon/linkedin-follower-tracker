// Variable to hold the chart instance
let statsChartInstance = null;
// Store profile data globally to avoid re-fetching
let currentFollowerHistory = {};

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
	const checkboxes = document.querySelectorAll(".profile-toggle");
	const visibleProfileIds = [];
	for (const cb of checkboxes) {
		if (cb.checked) {
			visibleProfileIds.push(cb.dataset.profileId);
		}
	}

	const datasets = [];
	const allTimestamps = new Set();

	let index = 0;
	for (const profileId of visibleProfileIds) {
		const history = currentFollowerHistory[profileId] || [];
		if (history.length === 0) continue;

		// Sort history by timestamp just in case
		history.sort((a, b) => a.timestamp - b.timestamp);

		for (const point of history) {
			allTimestamps.add(point.timestamp);
		}

		const dataPoints = history.map((point) => ({
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

	// Prepare labels (sorted timestamps)
	const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

	const ctx = document.getElementById("statsChart").getContext("2d");

	// Destroy previous chart instance if it exists
	if (statsChartInstance) {
		statsChartInstance.destroy();
	}

	// Check if there's any data to display
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
						unit: "day", // Adjust time unit as needed (e.g., 'hour', 'week')
						tooltipFormat: "MMM d, yyyy HH:mm", // Format for tooltip
					},
					title: {
						display: true,
						text: "Date",
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
					callbacks: {
						label: (context) => {
							const label = context.dataset.label || "";
							const point = context.raw;
							const count = point.y;

							// Find the previous data point for the same profile
							const historyForProfile =
								currentFollowerHistory[point.profileId] || [];
							const currentHistoryIndex = historyForProfile.findIndex(
								(p) => p.timestamp === point.x,
							);
							const previousHistoryPoint =
								currentHistoryIndex > 0
									? historyForProfile[currentHistoryIndex - 1]
									: null;

							const deltaInfo = calculateDelta(
								{ count: point.y },
								previousHistoryPoint
									? { count: previousHistoryPoint.count }
									: null,
							);

							return `${label}: ${count} followers ${deltaInfo.text}`;
						},
					},
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
	for (const profileId of visibleProfileIds) {
		const history = currentFollowerHistory[profileId] || [];
		// console.log(`renderDataTable: History for ${profileId}:`, history); // Optional DEBUG
		for (const point of history) {
			allDataPoints.push({ ...point, profileId });
		}
	}

	// Sort all data points by timestamp, descending (most recent first)
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

	// Process sorted data to easily find previous point for delta calculation
	const processedData = {};
	for (const profileId of visibleProfileIds) {
		processedData[profileId] = (currentFollowerHistory[profileId] || []).sort(
			(a, b) => a.timestamp - b.timestamp,
		);
	}

	for (const point of allDataPoints) {
		const row = tbody.insertRow();

		// Profile ID
		let cell = row.insertCell();
		cell.textContent = point.profileId;

		// Timestamp
		cell = row.insertCell();
		cell.textContent = new Date(point.timestamp).toLocaleString(); // Format timestamp

		// Follower Count
		cell = row.insertCell();
		cell.textContent = point.count;

		// Change calculation
		cell = row.insertCell();
		const profileHistory = processedData[point.profileId] || [];
		const currentHistoryIndex = profileHistory.findIndex(
			(p) => p.timestamp === point.timestamp,
		);
		const previousHistoryPoint =
			currentHistoryIndex > 0 ? profileHistory[currentHistoryIndex - 1] : null;

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
document.addEventListener("DOMContentLoaded", loadProfiles);

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
