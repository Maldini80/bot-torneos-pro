// src/utils/pendingStatsSelections.js
// Singleton via globalThis — garantiza que todas las importaciones (ESM + CJS) usen el mismo Map
if (!globalThis.__pendingStatsSelections) {
    globalThis.__pendingStatsSelections = new Map();
    
    // Auto-clean entries older than 5 minutes
    setInterval(() => {
        const now = Date.now();
        for (const [key, val] of globalThis.__pendingStatsSelections) {
            if (now - val.timestamp > 5 * 60 * 1000) globalThis.__pendingStatsSelections.delete(key);
        }
    }, 60 * 1000);
}

export const pendingSelections = globalThis.__pendingStatsSelections;
