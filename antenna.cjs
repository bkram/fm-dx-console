// (c) Bkram 2024
// Antenna management helper functions

let antNames = [];

function setAntNames(names) {
    if (Array.isArray(names)) {
        antNames = names.slice();
    } else {
        antNames = [];
    }
}

function getAntNames() {
    return antNames.slice();
}

function getAntLabel(index) {
    if (antNames[index] !== undefined) return antNames[index];
    if (index !== undefined && index !== null) return String(index);
    return 'N/A';
}

function cycleAntenna(currentIndex, countOverride) {
    const count =
        countOverride && countOverride > 0
            ? countOverride
            : antNames.length > 0
            ? antNames.length
            : 1;
    const idx = parseInt(currentIndex, 10) || 0;
    return count > 0 ? (idx + 1) % count : 0;
}

module.exports = { setAntNames, getAntNames, getAntLabel, cycleAntenna };
