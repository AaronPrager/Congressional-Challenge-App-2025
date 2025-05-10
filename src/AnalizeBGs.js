import wixData from 'wix-data';
import wixUsers from 'wix-users';
import { fetch } from 'wix-fetch';
import { getUserName } from 'public/shared.js'
let lowBG;
let highBG;
let cachedUrl;
let A1C;

$w.onReady(function () {
    $w('#bgTable').hide();
    $w('#bgChartFrame').hide(); // hide the chart at start

    const userId = wixUsers.currentUser.id;

    getUserName(userId)
        .then(nick => {
            console.log("NICKK: ", nick);
            $w('#welcomeText').text = `Welcome, ${nick}!`;
        });

    // Load user preferences
    wixData.query("UserPreferences")
        .eq("userId", userId)
        .find()
        .then((results) => {
            if (results.items.length > 0) {
                const prefs = results.items[0];
                console.log("Data: ", prefs);
                lowBG = prefs.lowbg;
                highBG = prefs.highbg;
                cachedUrl = prefs.nightscouturl;
                console.log("User ID: ", userId);
                console.log("Loaded lowBG:", lowBG);
                console.log("Loaded highBG:", highBG);
                console.log("Loaded url:", cachedUrl);
            }

            $w('#nightscoutUrlInput').value = cachedUrl;

        });

    $w('#fetchButton').onClick(async () => {
        const nightscoutUrl = $w('#nightscoutUrlInput').value;
        const rangeValue = Number($w('#rangeDropdown').value);

        if (!nightscoutUrl) {
            console.log('Please enter a Nightscout URL.');
            return;
        }
        if (!rangeValue) {
            console.log('Please select a range.');
            return;
        }

        const baseUrl = nightscoutUrl.replace(/\/$/, '');

        // Rolling time window: last X days (24h per day)
        const now = new Date();
        const rangeStart = new Date(now.getTime() - (rangeValue * 24 * 60 * 60 * 1000));

        const rangeStartISO = rangeStart.toISOString();
        const rangeEndISO = now.toISOString();

        console.log(`Starting fetch for rolling range: ${rangeStartISO} to ${rangeEndISO}`);

        // Fetch all data within the range
        const allEntries = await fetchAllNightscoutData(baseUrl, rangeStartISO, rangeEndISO);

        if (allEntries.length === 0) {
            console.log('No data found for the selected range.');
            return;
        }

        console.log(`Total entries fetched: ${allEntries.length}`);

        // Build table rows
        const rows = allEntries.map((entry, index) => {
            const currentBG = entry.sgv;
            const nextEntry = allEntries[index + 1];
            let change = 'N/A';

            if (nextEntry) {
                const nextBG = nextEntry.sgv;
                const diff = currentBG - nextBG;
                change = (diff >= 0 ? '+' : '') + diff;
            }

            return {
                bg: currentBG,
                time: new Date(entry.dateString).toLocaleString(),
                change: change,
                arrow: getArrowSymbol(entry.direction)
            };
        });

        // Fill the table and show it
        $w('#bgTable').rows = rows;
        $w('#bgTable').show();

        // Prepare datasets for graph (group by LOCAL date)
        const groupedByDate = {};
        const flatPoints = [];

        allEntries.forEach(entry => {
            const dateObj = new Date(entry.dateString);

            // ✅ LOCAL date string: YYYY-MM-DD
            const datePart = dateObj.getFullYear() + '-' +
                String(dateObj.getMonth() + 1).padStart(2, '0') + '-' +
                String(dateObj.getDate()).padStart(2, '0');

            const hours = dateObj.getHours();
            const minutes = dateObj.getMinutes();
            const hourValue = hours + minutes / 60; // Convert to float hour (e.g., 9.5)

            const point = {
                x: hourValue, // numeric hour for X
                y: entry.sgv,
                customDate: datePart // for tooltip use
            };

            flatPoints.push(point); // Add to full list

            if (!groupedByDate[datePart]) {
                groupedByDate[datePart] = [];
            }

            groupedByDate[datePart].push(point);
        });

        // Sort each dataset by hour ascending
        const datasets = Object.keys(groupedByDate).map((dateStr) => {
            const sortedData = groupedByDate[dateStr].sort((a, b) => a.x - b.x);

            return {
                label: dateStr,
                data: sortedData,
                fill: false
            };
        });

        // Add average line
        const hourlyAnalysis = analyzePatterns(flatPoints);

        const avgDataset = {
            label: 'Hourly Avg BG',
            data: hourlyAnalysis
                .filter(point => point.y !== null)
                .map(point => ({
                    x: point.x,
                    y: point.y,
                    customDate: 'Avg'
                })),
            showLine: true,
            borderWidth: 3,
            tension: 0.2,
            pointRadius: 0
        };

        // Add to datasets
        datasets.push(avgDataset);

        const dataToSend = {
            datasets: datasets,
            lowBG: lowBG,
            highBG: highBG
        };

        // Post the data to the graph iframe
        console.log('Posting data to iframe:', dataToSend);
        $w('#bgChartFrame').postMessage(dataToSend);
        $w('#bgChartFrame').show(); // make sure graph is visible
        // Generate insights and show them
        const insights = generateQuickInsights(hourlyAnalysis, flatPoints, lowBG, highBG);
        console.log("A1c", A1C);

        $w('#A1CResult').text = `Predicted A1c: ${A1C} %`;

        $w('#A1CResult').show;
        $w('#A1CBox').show;

        $w('#insightsText').text = insights;
        $w('#insightsText').show();
        $w('#insightsBox').show();
    });
});

// Pagination helper
async function fetchAllNightscoutData(baseUrl, startISO, endISO) {
    let allResults = [];
    let skip = 0;
    let batchSize = 1000;
    let keepGoing = true;
    let lastBatchFirstDate = null;

    while (keepGoing) {
        const url = `${baseUrl}/api/v1/entries.json?find[dateString][$gte]=${startISO}&find[dateString][$lte]=${endISO}&count=${batchSize}&skip=${skip}`;
        console.log(`Fetching: ${url}`);

        try {
            const response = await fetch(url, { method: 'get' });
            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            const data = await response.json();

            console.log(`Fetched ${data.length} entries (skip=${skip})`);

            if (data.length === 0) {
                keepGoing = false;
            } else {
                const firstDateThisBatch = data[0].dateString;
                if (firstDateThisBatch === lastBatchFirstDate) {
                    console.log('Duplicate batch detected, stopping.');
                    keepGoing = false;
                } else {
                    allResults = allResults.concat(data);
                    lastBatchFirstDate = firstDateThisBatch;
                    if (data.length < batchSize) {
                        keepGoing = false;
                    } else {
                        skip += batchSize;
                    }
                }
            }
        } catch (err) {
            console.error(`Error: ${err.message}`);
            keepGoing = false;
        }
    }

    console.log(`Fetched total: ${allResults.length}`);
    return allResults;
}

// Helper for arrows
function getArrowSymbol(direction) {
    switch (direction) {
    case 'DoubleUp':
        return '⇈';
    case 'SingleUp':
        return '↑';
    case 'FortyFiveUp':
        return '↗';
    case 'Flat':
        return '→';
    case 'FortyFiveDown':
        return '↘';
    case 'SingleDown':
        return '↓';
    case 'DoubleDown':
        return '⇊';
    default:
        return direction || '-';
    }
}

// 🔥 NEW: Pattern analysis function
function analyzePatterns(dataPoints) {
    const hourlyBuckets = {};

    dataPoints.forEach(point => {
        const hour = Math.floor(point.x);
        if (!hourlyBuckets[hour]) {
            hourlyBuckets[hour] = { sum: 0, count: 0, values: [] };
        }
        hourlyBuckets[hour].sum += point.y;
        hourlyBuckets[hour].count += 1;
        hourlyBuckets[hour].values.push(point.y);
    });

    const analysisResults = [];

    for (let hour = 0; hour < 24; hour++) {
        if (hourlyBuckets[hour]) {
            const bucket = hourlyBuckets[hour];
            const avg = bucket.sum / bucket.count;

            console.log(`Hour ${hour}: Avg=${avg.toFixed(1)}`);

            analysisResults.push({
                x: hour,
                y: avg
            });
        } else {
            analysisResults.push({
                x: hour,
                y: null
            });
        }
    }

    return analysisResults;
}

function generateQuickInsights(hourlyAnalysis, flatPoints, lowBG, highBG) {
    // Time-in-range (unchanged)
    const totalPoints = flatPoints.length;
    let inRange = 0,
        lowCount = 0,
        highCount = 0;
    flatPoints.forEach(p => {
        if (p.y < lowBG) lowCount++;
        else if (p.y > highBG) highCount++;
        else inRange++;
    });
    const tirPercent = ((inRange / totalPoints) * 100).toFixed(1);
    const lowPercent = ((lowCount / totalPoints) * 100).toFixed(1);
    const highPercent = ((highCount / totalPoints) * 100).toFixed(1);

    // Hourly highs/lows (unchanged)
    const validHours = hourlyAnalysis.filter(h => h.y !== null);
    const maxHour = validHours.reduce((a, b) => a.y > b.y ? a : b, validHours[0]);
    const minHour = validHours.reduce((a, b) => a.y < b.y ? a : b, validHours[0]);

    // Overall variability (unchanged)
    const allValues = flatPoints.map(p => p.y);
    const meanAll = allValues.reduce((a, b) => a + b, 0) / allValues.length;
    const sdAll = calculateSD(allValues);
    const cvAll = (sdAll / meanAll * 100);
    // const estimatedA1c = (meanAll + 46.7) / 28.7;
    A1C = calculateA1C(meanAll);

    return `
🔍 Quick Insights:

✔️ Time in Range: ${tirPercent}% (Low: ${lowPercent}%, High: ${highPercent}%)
✔️ Highest avg: ${maxHour.y.toFixed(1)} at ${maxHour.x}:00
✔️ Lowest avg: ${minHour.y.toFixed(1)} at ${minHour.x}:00
✔️ Variability: SD = ${sdAll.toFixed(1)} mg/dL, CV = ${cvAll.toFixed(1)}%
✔️ Predicted A1c: ${A1C} %
    `;
}

function calculateA1C(meanAll) {
    const a1c = (meanAll + 46.7) / 28.7;
    return a1c.toFixed(2);

}

function calculateSD(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sqDiffs = values.map(v => (v - mean) ** 2);
    const avgSqDiff = sqDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSqDiff);
}
