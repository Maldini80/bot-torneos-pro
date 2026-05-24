// scratch/test_lineup_eligibility.js
import { AssertionError } from 'assert';

const FORMATIONS = {
    '4-4-2': {
        POR: [{ label: 'POR' }],
        DFC: [
            { label: 'DFC L' },
            { label: 'DFC CL' },
            { label: 'DFC CR' },
            { label: 'DFC R' }
        ],
        MC: [
            { label: 'MC L' },
            { label: 'MC CL' },
            { label: 'MC CR' },
            { label: 'MC R' }
        ],
        DC: [
            { label: 'DC L' },
            { label: 'DC R' }
        ]
    },
    '4-3-3': {
        POR: [{ label: 'POR' }],
        DFC: [
            { label: 'DFC L' },
            { label: 'DFC CL' },
            { label: 'DFC CR' },
            { label: 'DFC R' }
        ],
        MC: [
            { label: 'MC L' },
            { label: 'MC C' },
            { label: 'MC R' }
        ],
        DC: [
            { label: 'EI' },
            { label: 'DC' },
            { label: 'ED' }
        ]
    },
    '3-5-2': {
        POR: [{ label: 'POR' }],
        DFC: [
            { label: 'DFC L' },
            { label: 'DFC C' },
            { label: 'DFC R' }
        ],
        MC: [
            { label: 'MI' },
            { label: 'MCD L' },
            { label: 'MCO' },
            { label: 'MCD R' },
            { label: 'MD' }
        ],
        DC: [
            { label: 'DC L' },
            { label: 'DC R' }
        ]
    },
    '4-5-1': {
        POR: [{ label: 'POR' }],
        DFC: [
            { label: 'DFC L' },
            { label: 'DFC CL' },
            { label: 'DFC CR' },
            { label: 'DFC R' }
        ],
        MC: [
            { label: 'MI' },
            { label: 'MC L' },
            { label: 'MCO' },
            { label: 'MC R' },
            { label: 'MD' }
        ],
        DC: [
            { label: 'DC' }
        ]
    },
    '5-3-2': {
        POR: [{ label: 'POR' }],
        DFC: [
            { label: 'LI' },
            { label: 'DFC L' },
            { label: 'DFC C' },
            { label: 'DFC R' },
            { label: 'LD' }
        ],
        MC: [
            { label: 'MC L' },
            { label: 'MC C' },
            { label: 'MC R' }
        ],
        DC: [
            { label: 'DC L' },
            { label: 'DC R' }
        ]
    },
    '3-1-4-2': {
        POR: [{ label: 'POR' }],
        DFC: [
            { label: 'DFC L' },
            { label: 'DFC C' },
            { label: 'DFC R' }
        ],
        MC: [
            { label: 'MCD' },
            { label: 'MI' },
            { label: 'MC L' },
            { label: 'MC R' },
            { label: 'MD' }
        ],
        DC: [
            { label: 'DC L' },
            { label: 'DC R' }
        ]
    },
    '3-4-3': {
        POR: [{ label: 'POR' }],
        DFC: [
            { label: 'DFC L' },
            { label: 'DFC C' },
            { label: 'DFC R' }
        ],
        MC: [
            { label: 'MI' },
            { label: 'MC L' },
            { label: 'MC R' },
            { label: 'MD' }
        ],
        DC: [
            { label: 'EI' },
            { label: 'DC' },
            { label: 'ED' }
        ]
    }
};

function isCentralDefender(pos) {
    return pos === 'DFC';
}

function isLateral(pos) {
    return ['LD', 'LI', 'LTD', 'LTI', 'CARR', 'CAD', 'CAI', 'DFD', 'DFI'].includes(pos);
}

function isMidfielder(pos) {
    return ['MC', 'MCD', 'MCO', 'MD', 'MI'].includes(pos);
}

function isForward(pos) {
    return ['DC', 'ED', 'EI', 'MP'].includes(pos);
}

function isGoalkeeper(pos) {
    return ['POR', 'GK'].includes(pos);
}

function isPlayerEligibleForSlot(playerPosition, slotKey, formation, slotIndex) {
    if (!playerPosition || !slotKey || !formation) return false;
    const pos = playerPosition.toUpperCase();
    const slot = slotKey.toUpperCase();
    
    if (slot === 'POR') {
        return isGoalkeeper(pos);
    }
    
    if (slot === 'DFC') {
        if (!isCentralDefender(pos) && !isLateral(pos)) {
            return false;
        }
        if (['3-5-2', '3-1-4-2', '3-4-3'].includes(formation)) {
            return isCentralDefender(pos);
        }
        if (['4-4-2', '4-3-3', '4-5-1'].includes(formation)) {
            if (slotIndex === 1 || slotIndex === 2) {
                return isCentralDefender(pos);
            }
            return true;
        }
        if (formation === '5-3-2') {
            if (slotIndex === 1 || slotIndex === 2 || slotIndex === 3) {
                return isCentralDefender(pos);
            }
            return true;
        }
        return true;
    }
    
    const layout = FORMATIONS[formation];
    const slotConfig = layout?.[slotKey]?.[slotIndex];
    if (!slotConfig) return false;
    const label = slotConfig.label.toUpperCase();
    
    if (slot === 'MC') {
        if (label === 'MI' || label === 'MD') {
            return isLateral(pos) || ['MI', 'MD'].includes(pos);
        } else {
            return isMidfielder(pos);
        }
    }
    
    if (slot === 'DC') {
        if (label === 'EI' || label === 'ED') {
            return isLateral(pos) || isForward(pos);
        } else {
            return isForward(pos);
        }
    }
    
    return false;
}

function assert(condition, message) {
    if (!condition) {
        throw new AssertionError({ message });
    }
}

// Test cases
try {
    // 1. Goalkeepers
    assert(isPlayerEligibleForSlot('POR', 'POR', '4-3-3', 0) === true, "GK should play in POR");
    assert(isPlayerEligibleForSlot('GK', 'POR', '4-3-3', 0) === true, "GK should play in POR");
    assert(isPlayerEligibleForSlot('DFC', 'POR', '4-3-3', 0) === false, "DFC should not play in POR");

    // 2. Line of 3 DFC (no laterals allowed in any index)
    assert(isPlayerEligibleForSlot('DFC', 'DFC', '3-1-4-2', 0) === true, "DFC in 3-1-4-2 index 0");
    assert(isPlayerEligibleForSlot('DFC', 'DFC', '3-1-4-2', 1) === true, "DFC in 3-1-4-2 index 1");
    assert(isPlayerEligibleForSlot('DFC', 'DFC', '3-1-4-2', 2) === true, "DFC in 3-1-4-2 index 2");
    assert(isPlayerEligibleForSlot('CARR', 'DFC', '3-1-4-2', 0) === false, "Lateral in 3-1-4-2 index 0 (should be false)");
    assert(isPlayerEligibleForSlot('CARR', 'DFC', '3-1-4-2', 1) === false, "Lateral in 3-1-4-2 index 1 (should be false)");
    assert(isPlayerEligibleForSlot('CARR', 'DFC', '3-1-4-2', 2) === false, "Lateral in 3-1-4-2 index 2 (should be false)");

    // 3. Line of 4 DFC (laterals allowed only on outer slots, i.e., index 0 and 3)
    assert(isPlayerEligibleForSlot('CARR', 'DFC', '4-3-3', 0) === true, "Lateral allowed in 4-3-3 index 0");
    assert(isPlayerEligibleForSlot('CARR', 'DFC', '4-3-3', 3) === true, "Lateral allowed in 4-3-3 index 3");
    assert(isPlayerEligibleForSlot('CARR', 'DFC', '4-3-3', 1) === false, "Lateral not allowed in 4-3-3 index 1 (central)");
    assert(isPlayerEligibleForSlot('CARR', 'DFC', '4-3-3', 2) === false, "Lateral not allowed in 4-3-3 index 2 (central)");
    assert(isPlayerEligibleForSlot('DFC', 'DFC', '4-3-3', 1) === true, "DFC allowed in 4-3-3 index 1");

    // 4. Line of 5 DFC (laterals allowed only on index 0 and 4)
    assert(isPlayerEligibleForSlot('CARR', 'DFC', '5-3-2', 0) === true, "Lateral allowed in 5-3-2 index 0");
    assert(isPlayerEligibleForSlot('CARR', 'DFC', '5-3-2', 4) === true, "Lateral allowed in 5-3-2 index 4");
    assert(isPlayerEligibleForSlot('CARR', 'DFC', '5-3-2', 1) === false, "Lateral not allowed in 5-3-2 index 1");
    assert(isPlayerEligibleForSlot('CARR', 'DFC', '5-3-2', 2) === false, "Lateral not allowed in 5-3-2 index 2");
    assert(isPlayerEligibleForSlot('CARR', 'DFC', '5-3-2', 3) === false, "Lateral not allowed in 5-3-2 index 3");

    // 5. MC slot
    assert(isPlayerEligibleForSlot('MC', 'MC', '3-1-4-2', 0) === true, "MC allowed in MC");
    assert(isPlayerEligibleForSlot('CARR', 'MC', '3-1-4-2', 0) === false, "Lateral in MC (MCD slot index 0) not allowed");
    assert(isPlayerEligibleForSlot('CARR', 'MC', '3-1-4-2', 1) === true, "Lateral in MI (slot index 1) allowed");
    assert(isPlayerEligibleForSlot('CARR', 'MC', '3-1-4-2', 4) === true, "Lateral in MD (slot index 4) allowed");
    assert(isPlayerEligibleForSlot('CARR', 'MC', '3-1-4-2', 2) === false, "Lateral in MC L (slot index 2) not allowed");

    // 6. DC slot
    assert(isPlayerEligibleForSlot('DC', 'DC', '4-3-3', 1) === true, "DC allowed in DC slot");
    assert(isPlayerEligibleForSlot('CARR', 'DC', '4-3-3', 1) === false, "Lateral not allowed in central DC slot");
    assert(isPlayerEligibleForSlot('CARR', 'DC', '4-3-3', 0) === true, "Lateral allowed in EI slot (index 0)");
    assert(isPlayerEligibleForSlot('CARR', 'DC', '4-3-3', 2) === true, "Lateral allowed in ED slot (index 2)");

    console.log("All lineage tests passed successfully!");
} catch (e) {
    console.error("Test failed:", e.message);
    process.exit(1);
}
