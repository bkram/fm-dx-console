const PTY_NAMES = [
    "None", "News", "Current Affairs", "Info", "Sport", "Education", "Drama", "Culture",
    "Science", "Varied", "Pop M", "Rock M", "Easy Listening", "Light Classical",
    "Serious Classical", "Other Music", "Weather", "Finance", "Children's", "Social Affairs",
    "Religion", "Phone-in", "Travel", "Leisure", "Jazz Music", "Country Music",
    "National Music", "Oldies Music", "Folk Music", "Documentary", "Alarm Test", "Alarm"
];

const RDS_G2_MAP = {
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

const ODA_MAP = {
    "CD46": "TMC", "4BD7": "Radiotext+", "0093": "DAB Cross-Referencing",
    "CD9E": "EWS", "C737": "UMC", "E1C1": "Action Code",
    "CD47": "TMC", "48D8": "Radiotext+", "4BD8": "Radiotext+"
};

const RT_PLUS_LABELS = {
    1: "Title", 2: "Album", 3: "Track Number", 4: "Artist", 5: "Composition",
    6: "Movement", 7: "Conductor", 8: "Composer", 9: "Band", 10: "Comment",
    11: "Genre", 12: "News", 13: "Local News", 14: "Stockmarket", 15: "Sport",
    16: "Lottery", 17: "Horoscope", 18: "Daily Diversion", 19: "Health Info",
    20: "Event", 21: "Scene", 22: "Cinema", 23: "Stupidity Machine",
    24: "Date & Time", 25: "Weather", 26: "Traffic Info", 27: "Alarm",
    28: "Advertisement", 29: "Website/URL", 30: "Other",
    31: "Station Name (Short)", 32: "Station Name (Long)", 33: "Current program",
    34: "Next program", 35: "Part", 36: "Host", 37: "Editorial Staff",
    38: "Frequency", 39: "Homepage", 40: "Sub-channel"
};

function decodeRdsByte(b) {
    if (RDS_G2_MAP[b]) return RDS_G2_MAP[b];
    if (b < 0x20) return String.fromCharCode(b);
    if (b >= 0x20 && b <= 0x7F) return String.fromCharCode(b);
    return String.fromCharCode(b);
}

function renderRdsBuffer(chars) {
    if (!chars || !Array.isArray(chars)) return '';
    return chars.map(c => {
        const b = c ? c.charCodeAt(0) : 0x20;
        if (b === 0) return ' ';
        if (b === 0x0D) return '[0x0D]';
        return decodeRdsByte(b);
    }).join('');
}

function pad(n) {
    return n.toString().padStart(2, '0');
}

function convertMjd(mjd) {
    if (mjd === 0) return null;
    const yp = Math.floor((mjd - 15078.2) / 365.25);
    const mp = Math.floor((mjd - 14956.1 - Math.floor(yp * 365.25)) / 30.6001);
    const term1 = Math.floor(yp * 365.25);
    const term2 = Math.floor(mp * 30.6001);
    const day = Number(mjd) - 14956 - Number(term1) - Number(term2);
    const k = (mp === 14 || mp === 15) ? 1 : 0;
    const year = 1900 + yp + k;
    const month = Number(mp) - 1 - Number(k) * 12;
    return { day: day, month: month, year: year };
}

function decodeAf(code) {
    if (code >= 1 && code <= 204) {
        return (87.5 + (code * 0.1)).toFixed(1);
    }
    return null;
}

function createRdsDecoder() {
    const state = {
        psBuffer: new Array(8).fill(' '),
        psMask: new Array(8).fill(false),
        lpsBuffer: new Array(32).fill(' '),
        ptynBuffer: new Array(8).fill(' '),
        
        rtBuffer0: new Array(64).fill(' '),
        rtBuffer1: new Array(64).fill(' '),
        rtMask0: new Array(64).fill(false),
        rtMask1: new Array(64).fill(false),
        rtCandidateString: "",
        rtStableSince: 0,
        
        afSet: [],
        afListHead: null,
        lastGroup0A3: null,
        afBMap: new Map(),
        currentMethodBGroup: null,
        afType: 'Unknown',
        
        currentPi: "----",
        piCandidate: "----",
        piCounter: 0,
        piEstablishmentTime: 0,
        
        ecc: '',
        lic: '',
        pin: '',
        localTime: '',
        utcTime: '',
        
        pty: 0,
        ptynAbFlag: false,
        tp: false,
        ta: false,
        ms: false,
        
        diStereo: false,
        diArtificialHead: false,
        diCompressed: false,
        diDynamicPty: false,
        
        abFlag: false,
        
        rtPlusOdaGroup: null,
        rtPlusTags: new Map(),
        rtPlusItemRunning: false,
        rtPlusItemToggle: false,
        
        hasOda: false,
        odaApp: null,
        odaList: [],
        hasRtPlus: false,
        hasEon: false,
        hasTmc: false,
        hasEws: false,
        ewsId: "",
        
        eonData: {},
        
        tmcServiceInfo: { ltn: 0, sid: 0, afi: false, mode: 0, providerName: "[Identifying...]" },
        tmcBuffer: [],
        tmcProviderBuffer: new Array(16).fill(' '),
        
        groupCounts: {},
        groupTotal: 0,
        
        graceCounter: 10,
        isDirty: false,
        
        psCandidateString: "        ",
        psStableSince: 0,
        psValidationBuffer: "        ",
        ptynCandidateString: "        ",
        ptynStableSince: 0,
        
        berHistory: [],
        BER_WINDOW_SIZE: 40,
        
        dabTargetGroup: null,
        dabExtraInfo: "",
        
        lastUpdate: Date.now()
    };

    function resetState() {
        state.psBuffer.fill(' ');
        state.psMask.fill(false);
        state.lpsBuffer.fill(' ');
        state.ptynBuffer.fill(' ');
        state.rtBuffer0.fill(' ');
        state.rtBuffer1.fill(' ');
        state.rtMask0.fill(false);
        state.rtMask1.fill(false);
        state.rtCandidateString = "";
        state.rtStableSince = 0;
        
        state.afSet = [];
        state.afListHead = null;
        state.afBMap.clear();
        state.currentMethodBGroup = null;
        state.afType = 'Unknown';
        
        state.eonData = {};
        state.tmcBuffer = [];
        state.tmcProviderBuffer.fill(' ');
        state.rtPlusTags.clear();
        state.rtPlusItemRunning = false;
        state.rtPlusItemToggle = false;
        
        state.hasOda = false;
        state.odaApp = null;
        state.odaList = [];
        state.hasRtPlus = false;
        state.hasEon = false;
        state.hasTmc = false;
        state.hasEws = false;
        state.ewsId = "";
        
        state.ecc = '';
        state.lic = '';
        state.pin = '';
        state.localTime = '';
        state.utcTime = '';
        
        state.pty = 0;
        state.ptynAbFlag = false;
        state.tp = false;
        state.ta = false;
        state.ms = false;
        state.diStereo = false;
        state.diArtificialHead = false;
        state.diCompressed = false;
        state.diDynamicPty = false;
        state.abFlag = false;
        
        state.rtPlusOdaGroup = null;
        state.lastGroup0A3 = null;
        
        state.groupCounts = {};
        state.groupTotal = 0;
        
        state.piEstablishmentTime = Date.now();
        state.psCandidateString = "        ";
        state.psStableSince = 0;
        state.psValidationBuffer = "        ";
        state.ptynCandidateString = "        ";
        state.ptynStableSince = 0;
        
        state.graceCounter = 10;
        state.berHistory = [];
        state.dabTargetGroup = null;
        state.dabExtraInfo = "";
    }

    function decodeGroup(g1, g2, g3, g4) {
        state.isDirty = true;
        state.lastUpdate = Date.now();
        
        const piHex = g1.toString(16).toUpperCase().padStart(4, '0');
        
        if (piHex === state.piCandidate) {
            state.piCounter++;
        } else {
            state.piCandidate = piHex;
            state.piCounter = 1;
        }
        
        if (state.piCounter >= 4 || (state.currentPi === "----" && state.piCounter >= 1)) {
            if (state.piCandidate !== state.currentPi) {
                state.currentPi = state.piCandidate;
                resetState();
            }
        }
        
        const groupTypeVal = (g2 >> 11) & 0x1F;
        const typeNum = groupTypeVal >> 1;
        const versionBit = groupTypeVal & 1;
        const groupStr = `${typeNum}${versionBit === 0 ? 'A' : 'B'}`;
        
        state.groupCounts[groupStr] = (state.groupCounts[groupStr] || 0) + 1;
        state.groupTotal++;
        
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
            
            if (isGroupA) {
                if (state.lastGroup0A3 !== g3) {
                    state.lastGroup0A3 = g3;
                    
                    const af1 = (g3 >> 8) & 0xFF;
                    const af2 = g3 & 0xFF;
                    const isAfHeader = (v) => v >= 225 && v <= 249;
                    const isAfFreq = (v) => v >= 1 && v <= 204;
                    
                    const processMethodAFreq = (f) => {
                        if (f && !state.afSet.includes(f)) {
                            state.afSet.push(f);
                        }
                    };
                    
                    if (isAfHeader(af1)) {
                        const headFreq = decodeAf(af2);
                        if (headFreq) {
                            processMethodAFreq(headFreq);
                            state.afListHead = headFreq;
                            const headIdx = state.afSet.indexOf(headFreq);
                            if (headIdx > 0) {
                                state.afSet.splice(headIdx, 1);
                                state.afSet.unshift(headFreq);
                            }
                            const count = Number(af1) - 224;
                            state.currentMethodBGroup = headFreq;
                            if (!state.afBMap.has(headFreq)) {
                                state.afBMap.set(headFreq, {
                                    expected: count,
                                    afs: new Set(),
                                    matchCount: 0,
                                    pairCount: 0
                                });
                            } else {
                                state.afBMap.get(headFreq).expected = count;
                            }
                        }
                    } else {
                        const f1 = decodeAf(af1);
                        const f2 = decodeAf(af2);
                        if (f1) processMethodAFreq(f1);
                        if (f2) processMethodAFreq(f2);
                    }
                    
                    if (isAfFreq(af1) && isAfFreq(af2)) {
                        const f1 = decodeAf(af1);
                        const f2 = decodeAf(af2);
                        if (f1 && f2 && state.currentMethodBGroup && state.afBMap.has(state.currentMethodBGroup)) {
                            const entry = state.afBMap.get(state.currentMethodBGroup);
                            entry.afs.add(f1);
                            entry.afs.add(f2);
                            entry.pairCount++;
                            if (f1 === state.currentMethodBGroup || f2 === state.currentMethodBGroup) {
                                entry.matchCount++;
                            }
                        }
                    }
                    
                    const validCandidates = Array.from(state.afBMap.values()).filter((entry) => {
                        return entry.expected > 0 && 
                               (entry.afs.size >= entry.expected * 0.75 || 
                                (entry.expected <= 2 && entry.afs.size === entry.expected) || 
                                (entry.expected > 5 && entry.afs.size > 4));
                    });
                    
                    state.afType = (validCandidates.length > 1 || 
                                   (validCandidates.length === 1 && validCandidates[0].pairCount > 0 && 
                                    (validCandidates[0].matchCount / validCandidates[0].pairCount > 0.35))) ? 'B' : 'A';
                }
            }
        }
        
        else if (groupTypeVal === 2 || groupTypeVal === 3) {
            if (groupTypeVal === 2) {
                const variant = (g3 >> 12) & 0x0F;
                if (variant === 0) {
                    state.ecc = (g3 & 0xFF).toString(16).toUpperCase().padStart(2, '0');
                } else if (variant === 3) {
                    state.lic = (g3 & 0xFF).toString(16).toUpperCase().padStart(2, '0');
                } else if (variant === 7) {
                    state.hasEws = true;
                    state.ewsId = (g3 & 0xFF).toString(16).toUpperCase().padStart(2, '0');
                }
            }
            if (((g4 >> 11) & 0x1F) !== 0) {
                const day = (g4 >> 11) & 0x1F;
                const hour = (g4 >> 6) & 0x1F;
                const min = g4 & 0x3F;
                state.pin = `${day}. ${pad(hour)}:${pad(min)}`;
            }
        }
        
        else if (groupTypeVal === 4 || groupTypeVal === 5) {
            const textAbFlag = !!((g2 >> 4) & 0x01);
            if (state.abFlag !== textAbFlag) {
                state.abFlag = textAbFlag;
                state.rtPlusTags.forEach((tag) => { tag.isCached = true; });
                if (textAbFlag) {
                    state.rtMask1.fill(false);
                    state.rtBuffer1.fill(' ');
                } else {
                    state.rtMask0.fill(false);
                    state.rtBuffer0.fill(' ');
                }
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
        
        else if (groupTypeVal === 6) {
            state.hasOda = true;
            const aid = g4.toString(16).toUpperCase().padStart(4, '0');
            const targetGroup = `${(g2 & 0x1F) >> 1}${(g2 & 0x01) ? 'B' : 'A'}`;
            const odaName = ODA_MAP[aid] || "Unknown ODA";
            
            const newOda = { name: odaName, aid: aid, group: targetGroup };
            state.odaApp = newOda;
            
            const eIdx = state.odaList.findIndex((o) => o.aid === aid);
            if (eIdx !== -1) {
                state.odaList[eIdx] = newOda;
            } else {
                state.odaList.unshift(newOda);
                if (state.odaList.length > 5) state.odaList.pop();
            }
            
            if (g4 === 0x4BD7 || g4 === 0x4BD8) {
                state.rtPlusOdaGroup = (g2 & 0x1F);
            }
            
            if (aid === '0093') {
                state.dabTargetGroup = targetGroup;
            }
        }
        
        else if (state.rtPlusOdaGroup !== null && groupTypeVal === state.rtPlusOdaGroup) {
            state.hasRtPlus = true;
            const g2Spare = g2 & 0x07;
            state.rtPlusItemToggle = !!((g2 >> 4) & 0x01);
            state.rtPlusItemRunning = !!((g2 >> 3) & 0x01);
            
            const processTag = (id, start, len) => {
                if (id === 0) return;
                const rtStr = renderRdsBuffer(state.abFlag ? state.rtBuffer1 : state.rtBuffer0);
                const length = len + 1;
                if (start < rtStr.length) {
                    let text = rtStr.substring(start, start + length).replace(/[\x00-\x1F]/g, '').trim();
                    if (text.length > 0) {
                        state.rtPlusTags.set(id, {
                            contentType: id,
                            start: start,
                            length: len,
                            text: text,
                            isCached: false,
                            timestamp: Date.now()
                        });
                    }
                }
            };
            
            const t1Id = (g2Spare << 3) | ((g3 >> 13) & 0x07);
            if (t1Id !== 0 && ((g3 >> 7) & 0x3F) + ((g3 >> 1) & 0x3F) < 70) {
                processTag(t1Id, (g3 >> 7) & 0x3F, (g3 >> 1) & 0x3F);
            }
            
            const t2Id = ((g3 & 0x01) << 5) | ((g4 >> 11) & 0x1F);
            if (t2Id !== 0 && ((g4 >> 5) & 0x3F) + (g4 & 0x1F) < 70) {
                processTag(t2Id, (g4 >> 5) & 0x3F, g4 & 0x1F);
            }
            
            if (state.rtPlusTags.size > 6) {
                const sortedTags = Array.from(state.rtPlusTags.values()).sort((a, b) => a.timestamp - b.timestamp);
                while (state.rtPlusTags.size > 6) {
                    const oldestKey = sortedTags.shift()?.contentType;
                    if (oldestKey !== undefined) {
                        state.rtPlusTags.delete(oldestKey);
                    }
                }
            }
        }
        
        else if (groupTypeVal === 8) {
            const mjd = ((g2 & 0x03) << 15) | ((g3 >> 1));
            const date = convertMjd(mjd);
            if (date) {
                const g4TR = ((g3 & 0x01) << 15) | (g4 >>> 1);
                const h = (g4TR >>> 11) & 0x1F;
                const m = (g4TR >> 5) & 0x3F;
                state.utcTime = `${pad(date.day)}/${pad(date.month)}/${date.year} ${pad(h)}:${pad(m)}`;
                const lDate = new Date(Date.UTC(date.year, date.month - 1, date.day, h, m) + (g4 & 0x1F) * 30 * 60 * 1000 * (((g4 >> 5) & 0x01) === 1 ? -1 : 1));
                state.localTime = `${pad(lDate.getUTCDate())}/${pad(lDate.getUTCMonth() + 1)}/${lDate.getUTCFullYear()} ${pad(lDate.getUTCHours())}:${pad(lDate.getUTCMinutes())}`;
            }
        }
        
        else if (groupTypeVal === 10) {
            const newFlag = !!((g2 >> 4) & 0x01);
            if (state.ptynAbFlag !== newFlag) {
                state.ptynAbFlag = newFlag;
                state.ptynBuffer.fill(' ');
            }
            const address = g2 & 0x0F;
            state.ptynBuffer[address * 2] = String.fromCharCode((g3 >> 8) & 0xFF);
            state.ptynBuffer[address * 2 + 1] = String.fromCharCode(g3 & 0xFF);
            state.ptynBuffer[address * 2 + 2] = String.fromCharCode((g4 >> 8) & 0xFF);
            state.ptynBuffer[address * 2 + 3] = String.fromCharCode(g4 & 0xFF);
        }
        
        else if (groupTypeVal === 14 || groupTypeVal === 15) {
            state.hasEon = true;
            const eonPi = g4.toString(16).toUpperCase().padStart(4, '0');
            
            if (!state.eonData[eonPi]) {
                state.eonData[eonPi] = {
                    pi: eonPi,
                    ps: '        ',
                    psBuffer: new Array(8).fill(' '),
                    tp: false,
                    ta: false,
                    pty: 0,
                    pin: '',
                    linkageInfo: '',
                    af: [],
                    mappedFreqs: [],
                    lastUpdate: Date.now()
                };
            }
            
            const network = state.eonData[eonPi];
            network.lastUpdate = Date.now();
            network.tp = !!((g2 >> 4) & 0x01);
            
            const variant = g2 & 0x0F;
            if (variant >= 0 && variant <= 3) {
                network.psBuffer[variant * 2] = String.fromCharCode((g3 >> 8) & 0xFF);
                network.psBuffer[variant * 2 + 1] = String.fromCharCode(g3 & 0xFF);
                network.ps = renderRdsBuffer(network.psBuffer);
            } else if (variant === 4) {
                const f1 = decodeAf((g3 >> 8) & 0xFF);
                const f2 = decodeAf(g3 & 0xFF);
                if (f1 && !network.af.includes(f1)) network.af.push(f1);
                if (f2 && !network.af.includes(f2)) network.af.push(f2);
                network.af.sort((a,b) => parseFloat(a) - parseFloat(b));
            } else if (variant >= 5 && variant <= 9) {
                const fMain = decodeAf(g3 >> 8);
                const fMapped = decodeAf(g3 & 0xFF);
                if (fMain && fMapped) {
                    const mapStr = `${fMain} -> ${fMapped}`;
                    if (!network.mappedFreqs.includes(mapStr)) {
                        network.mappedFreqs.push(mapStr);
                        if (network.mappedFreqs.length > 10) network.mappedFreqs.shift();
                    }
                }
            } else if (variant === 12) {
                network.linkageInfo = g3.toString(16).toUpperCase().padStart(4, '0');
            } else if (variant === 13) {
                network.pty = (g3 >> 11) & 0x1F;
                network.ta = !!(g3 & 0x01);
            } else if (variant === 14) {
                if (((g3 >> 11) & 0x1F) !== 0) {
                    network.pin = `${(g3 >> 11) & 0x1F}. ${pad((g3 >> 6) & 0x1F)}:${pad(g3 & 0x3F)}`;
                }
            }
        }
        
        else if (groupTypeVal === 16) {
            state.hasTmc = true;
        }
        
        else if (groupTypeVal === 20) {
            const newFlag = !!((g2 >> 4) & 0x01);
            if (state.ptynAbFlag !== newFlag) {
                state.ptynAbFlag = newFlag;
                state.ptynBuffer.fill(' ');
            }
            const address = g2 & 0x01;
            state.ptynBuffer[address * 4] = String.fromCharCode((g3 >> 8) & 0xFF);
            state.ptynBuffer[address * 4 + 1] = String.fromCharCode(g3 & 0xFF);
            state.ptynBuffer[address * 4 + 2] = String.fromCharCode((g4 >> 8) & 0xFF);
            state.ptynBuffer[address * 4 + 3] = String.fromCharCode(g4 & 0xFF);
        }
        
        else if (groupTypeVal === 30) {
            const address = g2 & 0x0F;
            const idx = address * 4;
            if (idx < 32) {
                state.lpsBuffer[idx] = String.fromCharCode((g3 >> 8) & 0xFF);
                state.lpsBuffer[idx + 1] = String.fromCharCode(g3 & 0xFF);
                state.lpsBuffer[idx + 2] = String.fromCharCode((g4 >> 8) & 0xFF);
                state.lpsBuffer[idx + 3] = String.fromCharCode(g4 & 0xFF);
            }
        }
    }

    function parseMessage(data) {
        if (!data || typeof data !== 'string') return;
        
        const cleanData = data.replace(/G:\s*/g, '').trim();
        const lines = cleanData.split(/\r?\n/);
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.length < 8) continue;
            
            const cleanLine = trimmed.replace(/^G:\s*/, '');
            if (cleanLine.length < 8) continue;
            
            const hexOnly = cleanLine.replace(/\s/g, '');
            if (hexOnly.length < 16) continue;
            
            const hasError = hexOnly.includes('-');
            
            const g1 = parseInt(hexOnly.substring(0, 4), 16);
            const g2 = parseInt(hexOnly.substring(4, 8), 16);
            const g3 = parseInt(hexOnly.substring(8, 12), 16);
            const g4 = parseInt(hexOnly.substring(12, 16), 16);
            
            if (!isNaN(g1) && !isNaN(g2) && !isNaN(g3) && !isNaN(g4) && !hasError) {
                decodeGroup(g1, g2, g3, g4);
                updateBer(false);
            } else {
                updateBer(true);
            }
        }
    }

    function updateBer(isError) {
        state.berHistory.push(isError ? 1 : 0);
        if (state.berHistory.length > state.BER_WINDOW_SIZE) {
            state.berHistory.shift();
        }
    }

    function updateStability() {
        const now = Date.now();
        
        const currentPs = renderRdsBuffer(state.psBuffer);
        if (currentPs !== state.psCandidateString) {
            state.psCandidateString = currentPs;
            state.psStableSince = now;
        }
        
        const currentPtyn = renderRdsBuffer(state.ptynBuffer);
        if (currentPtyn !== state.ptynCandidateString) {
            state.ptynCandidateString = currentPtyn;
            state.ptynStableSince = now;
        }
        
        const cRtBuf = state.abFlag ? state.rtBuffer1 : state.rtBuffer0;
        const isRtComplete = state.abFlag ? state.rtMask1.every(Boolean) : state.rtMask0.every(Boolean);
        const rawRt = renderRdsBuffer(cRtBuf);
        
        if (isRtComplete) {
            if (rawRt !== state.rtCandidateString) {
                state.rtCandidateString = rawRt;
                state.rtStableSince = now;
            }
        }
    }

    function getPs() {
        return renderRdsBuffer(state.psBuffer);
    }

    function getLongPs() {
        return renderRdsBuffer(state.lpsBuffer);
    }

    function getRt() {
        return renderRdsBuffer(state.abFlag ? state.rtBuffer1 : state.rtBuffer0);
    }

    function getRtA() {
        return renderRdsBuffer(state.rtBuffer0);
    }

    function getRtB() {
        return renderRdsBuffer(state.rtBuffer1);
    }

    function getPtyn() {
        return renderRdsBuffer(state.ptynBuffer);
    }

    function getPtyName() {
        return PTY_NAMES[state.pty] || 'Unknown';
    }

    function getPsStable() {
        updateStability();
        const now = Date.now();
        return state.psStableSince > 0 && (now - state.psStableSince) >= 2000;
    }

    function getLongPsStable() {
        const current = renderRdsBuffer(state.lpsBuffer);
        return current && current.trim().length > 0;
    }

    function getRtAbFlag() {
        return state.abFlag;
    }

    function getRtStable() {
        updateStability();
        const now = Date.now();
        return state.rtStableSince > 0 && (now - state.rtStableSince) >= 2000;
    }

    function getAfList() {
        if (state.afType === 'B' && state.afListHead) {
            const head = state.afListHead;
            const others = state.afSet.filter(f => f !== head);
            return [head, ...others];
        }
        return state.afSet;
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

    function getEonData() {
        return state.eonData;
    }

    function getOdaList() {
        return state.odaList;
    }

    function getTmcData() {
        return state.hasTmc ? { serviceInfo: state.tmcServiceInfo, messages: state.tmcBuffer } : null;
    }

    function getRtPlusData() {
        if (!state.hasRtPlus) return [];
        return Array.from(state.rtPlusTags.values()).sort((a, b) => a.contentType - b.contentType);
    }

    function getBer() {
        const now = Date.now();
        const gracePeriodActive = state.piEstablishmentTime > 0 && (now - state.piEstablishmentTime) < 3000;
        if (state.currentPi === "----" || gracePeriodActive || state.berHistory.length === 0) {
            return -1;
        }
        const errors = state.berHistory.reduce((a, b) => a + b, 0);
        return (errors / state.berHistory.length) * 100;
    }

    function getStableFlags() {
        const now = Date.now();
        const gracePeriodActive = state.piEstablishmentTime > 0 && (now - state.piEstablishmentTime) < 3000;
        
        const psStable = state.psStableSince > 0 && (now - state.psStableSince) >= 2000;
        const ptynStable = state.ptynStableSince > 0 && (now - state.ptynStableSince) >= 2000;
        const rtStable = state.rtStableSince > 0 && (now - state.rtStableSince) >= 2000;
        
        return {
            tpStable: !gracePeriodActive,
            taStable: !gracePeriodActive,
            msStable: !gracePeriodActive,
            diStereoStable: !gracePeriodActive,
            diAhStable: !gracePeriodActive,
            diCompStable: !gracePeriodActive,
            diDptyStable: !gracePeriodActive,
            psStable,
            ptynStable,
            rtStable
        };
    }

    return {
        parseMessage,
        getPs,
        getLongPs,
        getRt,
        getRtA,
        getRtB,
        getPtyn,
        getPtyName,
        getAfList,
        getGroupStats,
        getState,
        getPsStable,
        getLongPsStable,
        getRtAbFlag,
        getRtStable,
        getEonData,
        getOdaList,
        getTmcData,
        getRtPlusData,
        getStableFlags,
        getBer
    };
}

module.exports = { createRdsDecoder, PTY_NAMES };
