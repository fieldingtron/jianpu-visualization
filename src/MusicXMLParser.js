
// Map fifths to Key Root and Index (from App.jsx SCALE_TYPES)
// SCALE_TYPES: 
// 0: C, 1: G, 2: D, 3: A, 4: E, 5: B, 6: F#, 7: Db(C#), 8: Ab, 9: Eb, 10: Bb, 11: F
const FIFTHS_TO_KEY = {
    0: { root: 'C', index: 0 },
    1: { root: 'G', index: 1 },
    2: { root: 'D', index: 2 },
    3: { root: 'A', index: 3 },
    4: { root: 'E', index: 4 },
    5: { root: 'B', index: 5 },
    // Enharmonic edges (simple map)
    6: { root: 'F#', index: 6 },
    '-1': { root: 'F', index: 11 },
    '-2': { root: 'Bb', index: 10 },
    '-3': { root: 'Eb', index: 9 },
    '-4': { root: 'Ab', index: 8 },
    '-5': { root: 'Db', index: 7 },
    7: { root: 'C#', index: 7 },
    '-6': { root: 'Gb', index: 6 }
};

// Map Note Type to Jianpu Suffix
const TYPE_TO_SUFFIX = {
    'eighth': '_',
    '16th': '=',
    'quarter': '',
    'half': '-',
    'whole': '---'
};

export const parseMusicXML = (xmlText, forcedKeyIndex = null) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    // 1. Detect Key or Use Forced
    let keyIndex = 0; // Default C

    if (forcedKeyIndex !== null && forcedKeyIndex !== undefined) {
        keyIndex = forcedKeyIndex;
    } else {
        const fifthsNode = xmlDoc.querySelector('fifths');
        if (fifthsNode) {
            const fifths = parseInt(fifthsNode.textContent);
            if (FIFTHS_TO_KEY[fifths]) {
                keyIndex = FIFTHS_TO_KEY[fifths].index;
            }
        }
    }

    // 2. Parse Notes
    // We'll iterate through one part (usually P1). 
    // If multiple parts, we taking the first one for melody.
    const part = xmlDoc.querySelector('part');
    if (!part) return { error: "No <part> found in XML" };

    const notes = part.querySelectorAll('note');
    let jianpuString = "";

    // Track previous note for finding interval if needed, or simple absolute mapping?
    // We already have keyIndex, so we know the Root.
    // We can use the App's logic: (Midi - RootMidi) -> Degree.
    // But we don't have Tone.js here strictly, but we can do basic math.
    // Root offsets from C:
    // C=0, C#=1, D=2, Eb=3, E=4, F=5, F#=6, G=7, Ab=8, A=9, Bb=10, B=11
    const KEY_ROOT_OFFSETS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]; // Based on SCALE_TYPES order 0-11

    // Actually, simpler:
    // SCALE_TYPES order: C(0), G(1), D(2), A(3), E(4), B(5), F#(6), Db(7), Ab(8), Eb(9), Bb(10), F(11)
    // Sem itones from C: 0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5
    const ROOT_SEMITONE_FROM_C = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
    const rootSemitone = ROOT_SEMITONE_FROM_C[keyIndex];

    notes.forEach(note => {
        // Skip chord notes for simple melody (only keep melody line)
        if (note.querySelector('chord')) return;

        // RESTS
        if (note.querySelector('rest')) {
            const typeNode = note.querySelector('type');
            if (typeNode) {
                const suffix = TYPE_TO_SUFFIX[typeNode.textContent] || '';
                jianpuString += `0${suffix} `;
            } else {
                jianpuString += "0 ";
            }
            return;
        }

        // PITCH
        const step = note.querySelector('step')?.textContent; // C, D, E...
        const octave = parseInt(note.querySelector('octave')?.textContent);
        const alter = parseInt(note.querySelector('alter')?.textContent || 0);

        if (!step || !octave) return;

        // Calculate Absolute Semitone (MIDI-like)
        // C4 = 60. 
        // Note Offset map: C=0, D=2, E=4, F=5, G=7, A=9, B=11
        const STEP_OFFSET = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };

        let absPitch = (octave + 1) * 12 + STEP_OFFSET[step] + alter;

        // Root Pitch (assume Root is in Octave 4 for reference, e.g. G4)
        // Adjust: If Key is G, Root is G4 (67).
        // If Key is F, Root is F4 (65).
        let rootPitchRef = (4 + 1) * 12 + rootSemitone;

        // Relative Semitones
        let relative = absPitch - rootPitchRef;

        // Normalize Octave
        let relOctave = Math.floor(relative / 12);
        let semitoneInScale = ((relative % 12) + 12) % 12;

        // Map to Degree
        // Major: 0(1), 2(2), 4(3), 5(4), 7(5), 9(6), 11(7)
        const DEGREE_MAP = {
            0: '1', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 11: '7'
        };

        let degree = DEGREE_MAP[semitoneInScale];

        // Fallback for chromatic notes (sharp/flat)
        if (!degree) {
            // Check neighbors? 
            // 1(C#) -> 1#? 
            // MVP: Just ignore or map to nearest?
            // Let's try to map: 1: '1#', 3: '2#', 6: '4#', 8: '5#', 10: '6#'
            const CHROMATIC_MAP = {
                1: '1#', 3: '2#', 6: '4#', 8: '5#', 10: '6#'
            };
            degree = CHROMATIC_MAP[semitoneInScale] || '?';
        }

        // OCTAVE MARKERS
        let octaveStr = "";
        if (relOctave > 0) octaveStr = "'".repeat(relOctave);
        if (relOctave < 0) octaveStr = ",".repeat(Math.abs(relOctave));

        // RHYTHM
        const typeNode = note.querySelector('type');
        let rhythmSuffix = "";
        if (typeNode) {
            rhythmSuffix = TYPE_TO_SUFFIX[typeNode.textContent] || "";
        }

        // DOTS
        if (note.querySelector('dot')) {
            rhythmSuffix += "."; // This might be simplistic (1. vs 1-.)
            // In Jianpu: "1." usually means dotted quarter if base is quarter.
        }

        jianpuString += `${degree}${octaveStr}${rhythmSuffix} `;
    });

    return {
        jianpu: jianpuString.trim(),
        keyIndex
    };
};
