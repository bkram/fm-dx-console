const PTY_NAMES = [
    "None", "News", "Current Affairs", "Info", "Sport", "Education", "Drama", "Culture",
    "Science", "Varied", "Pop M", "Rock M", "Easy Listening", "Light Classical",
    "Serious Classical", "Other Music", "Weather", "Finance", "Children's", "Social Affairs",
    "Religion", "Phone-in", "Travel", "Leisure", "Jazz Music", "Country Music",
    "National Music", "Oldies Music", "Folk Music", "Documentary", "Alarm Test", "Alarm"
];

const RDS_CHAR_MAP = {
    0x80: 'á', 0x81: 'à', 0x82: 'é', 0x83: 'è', 0x84: 'í', 0x85: 'ì', 0x86: 'ó', 0x87: 'ò',
    0x88: 'ú', 0x89: 'ù', 0x8A: 'Ñ', 0x8B: 'Ç', 0x8C: 'Ş', 0x8D: 'ß', 0x8E: '¡', 0x8F: 'Ĳ',
    0x90: 'â', 0x91: 'ä', 0x92: 'ê', 0x93: 'ë', 0x94: 'î', 0x95: 'ï', 0x96: 'ô', 0x97: 'ö',
    0x98: 'û', 0x99: 'ü', 0x9A: 'ñ', 0x9B: 'ç', 0x9C: 'ş', 0x9D: 'ğ', 0x9E: 'ı', 0x9F: 'ĳ',
    0xA0: 'ª', 0xA1: 'α', 0xA2: '©', 0xA3: '‰', 0xA4: 'Ğ', 0xA5: 'ě', 0xA6: 'Ň', 0xA7: 'ő',
    0xA8: 'π', 0xA9: '€', 0xAA: '£', 0xAB: '$', 0xAC: '←', 0xAD: '↑', 0xAE: '→', 0xAF: '↓',
    0xB0: '⁰', 0xB1: '¹', 0xB2: '²', 0xB3: '³', 0xB4: '±', 0xB5: 'İ', 0xB6: 'ń', 0xB7: 'ű',
    0xB8: 'μ', 0xB9: '¿', 0xBA: '÷', 0xBB: '°', 0xBC: '¼', 0xBD: '½', 0xBE: '¾', 0xBF: '§',
    0xC0: 'Á', 0xC1: 'À', 0xC2: 'É', 0xC3: 'È', 0xC4: 'Í', 0xC5: 'Ì', 0xC6: 'Ó', 0xC7: 'Ò',
    0xC8: 'Ú', 0xC9: 'Ù', 0xCA: 'Ř', 0xCB: 'Č', 0xCC: 'Š', 0xCD: 'Ž', 0xCE: 'Đ', 0xCF: 'Ŀ',
    0xD0: 'Â', 0xD1: 'Ä', 0xD2: 'Ê', 0xD3: 'Ë', 0xD4: 'Î', 0xD5: 'Ï', 0xD6: 'Ô', 0xD7: 'Ö',
    0xD8: 'Û', 0xD9: 'Ü', 0xDA: 'ř', 0xDB: 'č', 0xDC: 'š', 0xDD: 'ž', 0xDE: 'đ', 0xDF: 'ŀ',
    0xE0: 'Ã', 0xE1: 'Å', 0xE2: 'Æ', 0xE3: 'Œ', 0xE4: 'ŷ', 0xE5: 'Ý', 0xE6: 'Õ', 0xE7: 'Ø',
    0xE8: 'Þ', 0xE9: 'Ŋ', 0xEA: 'Ŕ', 0xEB: 'Ć', 0xEC: 'Ś', 0xED: 'Ź', 0xEE: 'Ŧ', 0xEF: 'ð',
    0xF0: 'ã', 0xF1: 'å', 0xF2: 'æ', 0xF3: 'œ', 0xF4: 'ŵ', 0xF5: 'ý', 0xF6: 'õ', 0xF7: 'ø',
    0xF8: 'þ', 0xF9: 'ŋ', 0xFA: 'ŕ', 0xFB: 'ć', 0xFC: 'ś', 0xFD: 'ź', 0xFE: 'ŧ', 0xFF: 'ÿ'
};

function decodeRdsChar(byte) {
    if (byte >= 0x20 && byte <= 0x7F) {
        return String.fromCharCode(byte);
    }
    return RDS_CHAR_MAP[byte] || '?';
}

function decodeRdsBuffer(chars, length = 64) {
    let result = '';
    for (let i = 0; i < Math.min(chars.length, length); i++) {
        const c = chars[i];
        if (c && c !== ' ') {
            result += decodeRdsChar(c.charCodeAt(0));
        } else {
            result += ' ';
        }
    }
    return result.trim();
}

function createRdsDecoder() {
    const state = {
        pi: '----',
        piCounter: 0,
        piCandidate: '----',
        
        psBuffer: new Array(8).fill(' '),
        psMask: new Array(8).fill(false),
        
        rtBuffer0: new Array(64).fill(' '),
        rtBuffer1: new Array(64).fill(' '),
        rtMask0: new Array(64).fill(false),
        rtMask1: new Array(64).fill(false),
        
        ptynBuffer: new Array(8).fill(' '),
        
        longPsBuffer: new Array(32).fill(' '),
        longPsMask: new Array(32).fill(false),
        
        afList: [],
        afListHead: null,
        afType: 'Unknown',
        afBMap: new Map(),
        
        ecc: '',
        lic: '',
        pin: '',
        
        localTime: '',
        utcTime: '',
        
        pty: 0,
        tp: false,
        ta: false,
        ms: false,
        
        diStereo: false,
        diArtificialHead: false,
        diCompressed: false,
        diDynamicPty: false,
        
        abFlag: false,
        
        groupCounts: {},
        groupTotal: 0,
        
        hasRtPlus: false,
        hasEon: false,
        hasTmc: false,
        hasOda: false,
        
        rtPlusTags: [],
        
        eonData: {},
        
        tmcMessages: [],
        
        odaList: [],
        
        rawGroups: [],
        
        rtHistory: [],
        psHistory: [],
        
        lastUpdate: Date.now()
    };

    function decodeAf(code) {
        if (code >= 1 && code <= 204) {
            return (87.5 + (code * 0.1)).toFixed(1);
        }
        return null;
    }

    function isAfHeader(code) {
        return code >= 225 && code <= 249;
    }

    function decodeGroup(g1, g2, g3, g4) {
        state.lastUpdate = Date.now();
        state.groupTotal++;
        
        const groupTypeVal = (g2 >> 11) & 0x1F;
        const typeNum = groupTypeVal >> 1;
        const versionBit = groupTypeVal & 1;
        const groupStr = `${typeNum}${versionBit === 0 ? 'A' : 'B'}`;
        
        state.groupCounts[groupStr] = (state.groupCounts[groupStr] || 0) + 1;
        
        state.rawGroups.push({ type: groupStr, blocks: [g1, g2, g3, g4], time: new Date().toISOString() });
        if (state.rawGroups.length > 200) state.rawGroups.shift();
        
        const piHex = g1.toString(16).toUpperCase().padStart(4, '0');
        if (piHex === state.piCandidate) {
            state.piCounter++;
        } else {
            state.piCandidate = piHex;
            state.piCounter = 1;
        }
        
        if (state.piCounter >= 4 || (state.pi === '----' && state.piCounter >= 1)) {
            if (state.piCandidate !== state.pi) {
                state.pi = state.piCandidate;
                state.psBuffer.fill(' ');
                state.psMask.fill(false);
                state.rtBuffer0.fill(' ');
                state.rtBuffer1.fill(' ');
                state.rtMask0.fill(false);
                state.rtMask1.fill(false);
                state.longPsBuffer.fill(' ');
                state.longPsMask.fill(false);
                state.afList = [];
                state.afListHead = null;
                state.afType = 'Unknown';
                state.afBMap.clear();
                state.ecc = '';
                state.lic = '';
                state.pin = '';
                state.hasRtPlus = false;
                state.hasEon = false;
                state.hasTmc = false;
                state.hasOda = false;
                state.rtPlusTags = [];
                state.eonData = {};
                state.tmcMessages = [];
                state.odaList = [];
                state.groupCounts = {};
                state.groupTotal = 0;
            }
        }
        
        const tp = !!((g2 >> 10) & 0x01);
        const pty = (g2 >> 5) & 0x1F;
        
        state.tp = tp;
        state.pty = pty;
        
        const ta = !!((g2 >> 4) & 0x01);
        const ms = !!((g2 >> 3) & 0x01);
        
        state.ta = ta;
        state.ms = ms;
        
        if (groupTypeVal === 0 || groupTypeVal === 1) {
            const isGroupA = groupTypeVal === 0;
            const diBit = (g2 >> 2) & 0x01;
            const address = g2 & 0x03;
            
            if (address === 0) state.diDynamicPty = !!diBit;
            if (address === 1) state.diCompressed = !!diBit;
            if (address === 2) state.diArtificialHead = !!diBit;
            if (address === 3) state.diStereo = !!diBit;
            
            state.psBuffer[address * 2] = String.fromCharCode((g4 >> 8) & 0xFF);
            state.psBuffer[address * 2 + 1] = String.fromCharCode(g4 & 0xFF);
            state.psMask[address * 2] = true;
            state.psMask[address * 2 + 1] = true;
            
            if (isGroupA && address === 0) {
                const af1 = (g3 >> 8) & 0xFF;
                const af2 = g3 & 0xFF;
                
                if (isAfHeader(af1)) {
                    const headFreq = decodeAf(af2);
                    if (headFreq) {
                        state.afListHead = headFreq;
                        state.afType = 'B';
                        state.afBMap.set(headFreq, { expected: af1 - 224, afs: new Set(), matched: 0 });
                    }
                } else {
                    const f1 = decodeAf(af1);
                    const f2 = decodeAf(af2);
                    if (f1 && !state.afList.includes(f1)) state.afList.push(f1);
                    if (f2 && !state.afList.includes(f2)) state.afList.push(f2);
                    if (f1 || f2) state.afType = 'A';
                }
                
                if (isAfHeader(af1) && state.afBMap.has(state.afListHead)) {
                    const entry = state.afBMap.get(state.afListHead);
                    const f1 = decodeAf(af1);
                    const f2 = decodeAf(af2);
                    if (f1) entry.afs.add(f1);
                    if (f2) entry.afs.add(f2);
                }
            }
        }
        
        else if (groupTypeVal === 2 || groupTypeVal === 3) {
            const variant = (g3 >> 12) & 0x0F;
            
            if (variant === 0) {
                state.ecc = (g3 & 0xFF).toString(16).toUpperCase().padStart(2, '0');
            } else if (variant === 3) {
                state.lic = (g3 & 0xFF).toString(16).toUpperCase().padStart(2, '0');
            }
            
            if (((g4 >> 11) & 0x1F) !== 0) {
                const day = (g4 >> 11) & 0x1F;
                const hour = (g4 >> 6) & 0x1F;
                const min = g4 & 0x3F;
                state.pin = `${day}. ${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            }
        }
        
        else if (groupTypeVal === 4 || groupTypeVal === 5) {
            const textAbFlag = !!((g2 >> 4) & 0x01);
            if (state.abFlag !== textAbFlag) {
                state.abFlag = textAbFlag;
                if (textAbFlag) state.rtMask1.fill(false);
                else state.rtMask0.fill(false);
            }
            
            const isGroup2A = groupTypeVal === 4;
            const address = g2 & 0x0F;
            
            const target = textAbFlag ? state.rtBuffer1 : state.rtBuffer0;
            const mask = textAbFlag ? state.rtMask1 : state.rtMask0;
            
            if (isGroup2A) {
                const idx = address * 4;
                if (idx < 64) {
                    target[idx] = String.fromCharCode((g3 >> 8) & 0xFF); mask[idx] = true;
                    target[idx+1] = String.fromCharCode(g3 & 0xFF); mask[idx+1] = true;
                    target[idx+2] = String.fromCharCode((g4 >> 8) & 0xFF); mask[idx+2] = true;
                    target[idx+3] = String.fromCharCode(g4 & 0xFF); mask[idx+3] = true;
                }
            } else {
                const idx = address * 2;
                if (idx < 64) {
                    target[idx] = String.fromCharCode((g4 >> 8) & 0xFF); mask[idx] = true;
                    target[idx+1] = String.fromCharCode(g4 & 0xFF); mask[idx+1] = true;
                }
            }
        }
        
        else if (groupTypeVal === 10) {
            const address = g2 & 0x0F;
            state.ptynBuffer[address * 2] = String.fromCharCode((g3 >> 8) & 0xFF);
            state.ptynBuffer[address * 2 + 1] = String.fromCharCode(g3 & 0xFF);
        }
        
        else if (groupTypeVal === 14 || groupTypeVal === 15) {
            state.hasEon = true;
            const eonPi = g4.toString(16).toUpperCase().padStart(4, '0');
            
            if (!state.eonData[eonPi]) {
                state.eonData[eonPi] = { ps: '', psBuffer: new Array(8).fill(' '), tp: false, ta: false, pty: 0, af: [] };
            }
            
            const network = state.eonData[eonPi];
            network.tp = !!((g2 >> 4) & 0x01);
            
            const variant = g2 & 0x0F;
            if (variant >= 0 && variant <= 3) {
                network.psBuffer[variant * 2] = String.fromCharCode((g3 >> 8) & 0xFF);
                network.psBuffer[variant * 2 + 1] = String.fromCharCode(g3 & 0xFF);
                network.ps = decodeRdsBuffer(network.psBuffer, 8);
            } else if (variant === 4) {
                const f1 = decodeAf((g3 >> 8) & 0xFF);
                const f2 = decodeAf(g3 & 0xFF);
                if (f1 && !network.af.includes(f1)) network.af.push(f1);
                if (f2 && !network.af.includes(f2)) network.af.push(f2);
            } else if (variant === 13) {
                network.pty = (g3 >> 11) & 0x1F;
                network.ta = !!(g3 & 0x01);
            }
        }
        
        else if (groupTypeVal === 6 || groupTypeVal === 7) {
            state.hasOda = true;
            const aid = g4.toString(16).toUpperCase().padStart(4, '0');
            const targetGroup = `${(g2 & 0x1F) >> 1}${(g2 & 0x01) ? 'B' : 'A'}`;
            
            const existing = state.odaList.find(o => o.aid === aid);
            if (!existing) {
                state.odaList.push({ aid, group: targetGroup });
                if (state.odaList.length > 5) state.odaList.shift();
            }
            
            if (aid === '4A7A' || aid === '4A7B') {
                state.hasRtPlus = true;
            }
        }
        
        else if (groupTypeVal === 16 || groupTypeVal === 17) {
            state.hasTmc = true;
        }
        
        else if (groupTypeVal === 30) {
            const address = g2 & 0x0F;
            if (address < 16) {
                state.longPsBuffer[address * 2] = String.fromCharCode((g4 >> 8) & 0xFF);
                state.longPsBuffer[address * 2 + 1] = String.fromCharCode(g4 & 0xFF);
                state.longPsMask[address * 2] = true;
                state.longPsMask[address * 2 + 1] = true;
            }
        }
    }

    function parseMessage(data) {
        if (!data || typeof data !== 'string') return;
        
        // Remove "G:" prefix and any whitespace/newlines
        const cleanData = data.replace(/G:\s*/g, '').trim();
        
        const lines = cleanData.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.length < 8) continue;
            
            // Remove any "G:" prefix from individual lines
            const cleanLine = trimmed.replace(/^G:\s*/, '');
            if (cleanLine.length < 8) continue;
            
            // Remove all whitespace
            const hexOnly = cleanLine.replace(/\s/g, '');
            if (hexOnly.length < 16) continue;
            
            // Parse as big-endian: each 4 hex chars = 2 bytes = 1 group word
            // Format: g1g2g3g4 (16 hex chars = 4 words)
            const g1 = parseInt(hexOnly.substring(0, 4), 16);
            const g2 = parseInt(hexOnly.substring(4, 8), 16);
            const g3 = parseInt(hexOnly.substring(8, 12), 16);
            const g4 = parseInt(hexOnly.substring(12, 16), 16);
            
            if (!isNaN(g1) && !isNaN(g2) && !isNaN(g3) && !isNaN(g4)) {
                // Swap bytes in g3 and g4 for little-endian
                const g3le = ((g3 & 0xFF) << 8) | ((g3 >> 8) & 0xFF);
                const g4le = ((g4 & 0xFF) << 8) | ((g4 >> 8) & 0xFF);
                decodeGroup(g1, g2, g3le, g4le);
            }
        }
    }

    function getPs() {
        return decodeRdsBuffer(state.psBuffer, 8);
    }

    function getLongPs() {
        return decodeRdsBuffer(state.longPsBuffer, 32);
    }

    function getRt() {
        const buffer = state.abFlag ? state.rtBuffer1 : state.rtBuffer0;
        return decodeRdsBuffer(buffer, 64);
    }

    function getPtyn() {
        return decodeRdsBuffer(state.ptynBuffer, 8);
    }

    function getPtyName() {
        return PTY_NAMES[state.pty] || 'Unknown';
    }

    function getAfList() {
        if (state.afType === 'B' && state.afListHead) {
            const head = state.afListHead;
            const others = state.afList.filter(f => f !== head);
            return [head, ...others];
        }
        return state.afList;
    }

    function getGroupStats() {
        const validTotal = Math.max(1, state.groupTotal);
        const sorted = Object.entries(state.groupCounts)
            .sort((a, b) => {
                const numA = parseInt(a[0]);
                const numB = parseInt(b[0]);
                if (numA !== numB) return numA - numB;
                return a[0].localeCompare(b[0]);
            });
        
        return sorted.map(([group, count]) => ({
            group,
            count,
            percent: ((count / validTotal) * 100).toFixed(1)
        }));
    }

    function getState() {
        return state;
    }

    return {
        parseMessage,
        getPs,
        getLongPs,
        getRt,
        getPtyn,
        getPtyName,
        getAfList,
        getGroupStats,
        getState
    };
}

module.exports = { createRdsDecoder, PTY_NAMES };
