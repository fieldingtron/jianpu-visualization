import { Midi } from '@tonejs/midi';

// Reuse Key Mapping logic
// SCALE_TYPES order: C(0), G(1), D(2), A(3), E(4), B(5), F#(6), Db(7), Ab(8), Eb(9), Bb(10), F(11)
// Semitones from C: 0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5
const ROOT_SEMITONE_FROM_C = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

const MAJOR_SCALE_MAP = {
    'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6,
    'Db': 7, 'C#': 7, 'Ab': 8, 'Eb': 9, 'Bb': 10, 'F': 11,
    'Gb': 6, 'Cb': 5 // Enharmonics
};

// Map duration (beats) to Jianpu suffix
// 1 beat = Quarter Note
function getRhythmSuffix(durationBeats) {
    // Quantize to nearest 16th (0.25)
    const quantized = Math.round(durationBeats * 4) / 4;

    if (quantized >= 4) return '---';
    if (quantized >= 3) return '--'; // approximate dotted half not perfectly standard here but often used as 1--
    if (quantized >= 2) return '-';
    if (quantized >= 1.5) return '.';
    if (quantized >= 1) return '';
    if (quantized >= 0.75) return '_.'; // Dotted eighth? 
    if (quantized >= 0.5) return '_';
    if (quantized >= 0.25) return '=';

    return ''; // Default
}

export const parseMidi = async (arrayBuffer, forcedKeyIndex = null) => {
    const midi = new Midi(arrayBuffer);

    // 1. Detect Key
    let keyIndex = 0; // Default C

    // Check global key signatures
    if (forcedKeyIndex !== null && forcedKeyIndex !== undefined) {
        keyIndex = forcedKeyIndex;
    } else {
        // Try to find key signature in header or first track
        // @tonejs/midi sorts key signatures by time.
        const keySig = midi.header.keySignatures[0];
        if (keySig) {
            // keySig.key might be "C", "G", "Eb", etc.
            // keySig.scale might be "major" or "minor". We assume Major for now for this Jianpu app.
            // Adjust if minor? Relative major?
            const keyName = keySig.key;
            if (MAJOR_SCALE_MAP[keyName] !== undefined) {
                keyIndex = MAJOR_SCALE_MAP[keyName];
            }
        }
    }

    // 2. Select Main Track
    // Heuristic: Track with most notes
    let mainTrack = midi.tracks[0];
    let maxNotes = 0;
    midi.tracks.forEach(track => {
        if (track.notes.length > maxNotes) {
            maxNotes = track.notes.length;
            mainTrack = track;
        }
    });

    if (!mainTrack || maxNotes === 0) {
        return { error: "No notes found in MIDI file" };
    }

    // 3. Convert Notes
    let jianpuString = "";

    const rootSemitone = ROOT_SEMITONE_FROM_C[keyIndex];

    // Midi PPQ (ticks per beat)
    const ppq = midi.header.ppq || 480;

    let lastNoteEndTime = 0;

    mainTrack.notes.forEach(note => {
        // Rests detection
        // Note time is in seconds usually in Tone.js Midi, but ticks is safer for rhythm
        const startTimeTicks = note.ticks;
        const durationTicks = note.durationTicks;

        // Gap check (Rest)
        // We'd need to track previous note end.
        // Simplified: Ignore rests for now or simple check?
        // Let's rely on visualizer handling spacing if we don't output 0s.
        // User asked for "convert into jianpu notation", standard implies including rests.
        // But MIDI timing can be messy. Let's start with just Notes first.

        // Pitch Logic
        const absPitch = note.midi;

        // Root Calculation (Key center in octave 4)
        // Similar to MusicXML logic
        // If Key C (0), Root is C4 (60).
        // If Key G (1), Root is G4 (67).
        let rootPitchRef = 60 + rootSemitone;
        // Adjust if rootSemitone makes it too high? 
        // C4=60. C=0 -> 60.
        // B=11 -> 71 (B4). 
        // Tone.js Frequency("C4").toMidi() is 60.

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

        // Chromatic Fallback
        if (!degree) {
            const CHROMATIC_MAP = {
                1: '1#', 3: '2#', 6: '4#', 8: '5#', 10: '6#'
            };
            degree = CHROMATIC_MAP[semitoneInScale] || '?';
        }

        // Octave
        let octaveStr = "";
        if (relOctave > 0) octaveStr = "'".repeat(relOctave);
        if (relOctave < 0) octaveStr = ",".repeat(Math.abs(relOctave));

        // Duration
        const durationBeats = durationTicks / ppq;
        const suffix = getRhythmSuffix(durationBeats);

        jianpuString += `${degree}${octaveStr}${suffix} `;
    });

    return {
        jianpu: jianpuString.trim(),
        keyIndex
    };
};
