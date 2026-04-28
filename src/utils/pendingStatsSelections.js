// src/utils/pendingStatsSelections.js
// In-memory store for time slot selections between select menu and modal interactions
const pendingSelections = new Map();

// Auto-clean entries older than 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of pendingSelections) {
        if (now - val.timestamp > 5 * 60 * 1000) pendingSelections.delete(key);
    }
}, 60 * 1000);

module.exports = { pendingSelections };
