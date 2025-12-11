import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { turso } from './tursoClient';

const NOTE_MAP = {
  1: 'C',
  2: 'D',
  3: 'E',
  4: 'F',
  5: 'G',
  6: 'A',
  7: 'B'
};

const PITCH_OFFSETS = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6
};

function App() {
  const [input, setInput] = useState("1 2 3 1' 5,");
  const [notes, setNotes] = useState([]);
  const svgRef = useRef(null);

  // Persistence State
  const [title, setTitle] = useState("Untitled Melody");
  const [album, setAlbum] = useState("");
  const [library, setLibrary] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [dbError, setDbError] = useState(null);

  // Load Library on Mount
  useEffect(() => {
    fetchLibrary();
  }, []);

  const fetchLibrary = async () => {
    try {
      const result = await turso.execute("SELECT * FROM melodies ORDER BY created_at DESC LIMIT 50");
      setLibrary(result.rows);
      setDbError(null);
    } catch (e) {
      console.error("Failed to load library:", e);
      setDbError("Could not connect to database. Check credentials.");
    }
  };

  const saveMelody = async () => {
    setIsSaving(true);
    try {
      if (!title.trim()) {
        alert("Please enter a title.");
        setIsSaving(false);
        return;
      }

      await turso.execute({
        sql: "INSERT INTO melodies (title, album, content, key_index, bpm) VALUES (?, ?, ?, ?, ?)",
        args: [title, album, input, selectedKeyIndex, bpm]
      });

      await fetchLibrary(); // Refresh list
      alert("Melody saved!");
    } catch (e) {
      console.error("Save failed:", e);
      alert("Failed to save: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const loadMelody = (item) => {
    if (confirm(`Load "${item.title}"? Unsaved changes will be lost.`)) {
      setTitle(item.title);
      setAlbum(item.album || "");
      setInput(item.content);
      setSelectedKeyIndex(item.key_index || 0);
      setBpm(item.bpm || 60);
    }
  };

  const parseInput = (str, keyIndex) => {
    const parsed = [];
    const currentScale = SCALE_TYPES[keyIndex] || SCALE_TYPES[0];
    const isNumbersMode = currentScale.name === 'Numbers Only';

    // Regex for tokenizing complex Jianpu syntax
    // 1. Bar lines/Repeat signs: :|: or |: or :| or ||| or || or |
    // 2. Structure blocks: [ ... ]
    // 3. Notes with modifiers: [1-7] followed by any combination of [b#n '", . _ = -]*
    const tokens = str.match(/([\|:]+|\[[^\]]+\]|[1-7][b#n'\",\._=\-]*)/g) || [];

    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];

      // -- CASE 1: Bar Line or Structure --
      if (/^[\|:\[]/.test(token)) {
        parsed.push({
          type: 'bar',
          text: token // store "||" or "|:" to draw later
        });
        i++;
        continue;
      }

      // -- CASE 2: Note --
      if (/^[1-7]/.test(token)) {
        const noteChar = token.charAt(0); // 1-7
        const modifiers = token.slice(1);

        let noteNum = parseInt(noteChar);
        let octave = 0;
        let accidental = 0; // -1 flat, 1 sharp
        let duration = 1; // Quarter default

        // Parse modifiers character by character (or regex count)
        const sharps = (modifiers.match(/#/g) || []).length;
        const flats = (modifiers.match(/b/g) || []).length;
        // Reset if 'n' natural is found? (Not strictly used in this simple visualizer yet but good to track)
        if (modifiers.includes('n')) accidental = 0;
        else accidental = sharps - flats;

        const highOctaves = (modifiers.match(/'/g) || []).length;
        const doubleHigh = (modifiers.match(/"/g) || []).length;
        const lowOctaves = (modifiers.match(/,/g) || []).length;
        octave = (highOctaves * 1) + (doubleHigh * 2) - lowOctaves;

        // Rhythm Calculation
        // _ underscore = halve duration. 3_ = 0.5. 3__ = 0.25
        const underscoreCount = (modifiers.match(/_/g) || []).length;

        // = equals = sixteenth (0.25). 
        // If = is present, does it override _ ? User says 1= sixteenth. 
        // Let's treat = as setting base to 0.25
        const equalsCount = (modifiers.match(/=/g) || []).length;

        // - dash = extend. 1- = half (add 1). 1-- = dotted half (add 2).
        const dashCount = (modifiers.match(/-/g) || []).length;

        // . dot = 1.5x
        const dotCount = (modifiers.match(/\./g) || []).length;

        // Calculate final duration
        if (equalsCount > 0) {
          duration = 0.25;
        } else if (underscoreCount > 0) {
          duration = Math.pow(0.5, underscoreCount);
        }

        // Apply dashes (extensions)
        // Usually dashes are separate tokens in Jianpu (1 - -), but user provided "1-" syntax.
        // If dashes are part of the token, we assume they add quarters.
        // But if we already calculated quarters/eighths... 
        // Let's assume standard behavior: 1- means 1 (quarter) + 1 (quarter) = 2.
        duration += dashCount;

        // Apply dots
        if (dotCount > 0) {
          // Standard 1. is 1 + 0.5 = 1.5
          // Standard 1-. is 2 + 1 = 3? 
          // Simple multiply for now
          duration *= 1.5;
        }

        // VISUAL LABEL
        let visualLabel = currentScale.notes[noteNum - 1];

        // Append accidental to visual label if not in key? 
        // Or if strictly accidental. 
        // Logic: If user inputs 1#, they mean "Sharp 1". 
        // In G Major (1=G), 1# is G#. 
        if (accidental === 1) visualLabel += '#';
        if (accidental === -1) visualLabel += 'b';

        // PITCH / PLAYBACK Logic
        let rootNoteName = isNumbersMode ? 'C' : currentScale.root;
        let rootMidi = Tone.Frequency(rootNoteName + "4").toMidi();
        let semitoneDist = SEMITONE_OFFSETS[noteNum - 1];

        let finalMidi = rootMidi + semitoneDist + (octave * 12) + accidental;

        // Visual Height
        const pitchIndex = (octave * 7) + PITCH_OFFSETS[noteNum];

        parsed.push({
          type: 'note',
          note: visualLabel,
          octave,
          pitchIndex,
          midiVal: finalMidi,
          duration: duration,
          originalText: token
        });
        i++;
      } else {
        i++;
      }
    }
    setNotes(parsed);
  };

  const handleDownload = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "melody_visualization.svg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Key Signature Logic
  const SCALE_TYPES = [
    { name: 'C Major', root: 'C', notes: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
    { name: 'G Major', root: 'G', notes: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'] },
    { name: 'D Major', root: 'D', notes: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'] },
    { name: 'A Major', root: 'A', notes: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'] },
    { name: 'E Major', root: 'E', notes: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'] },
    { name: 'B Major', root: 'B', notes: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'] },
    { name: 'F# Major', root: 'F#', notes: ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#'] },
    { name: 'Db Major', root: 'Db', notes: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'] },
    { name: 'Ab Major', root: 'Ab', notes: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'] },
    { name: 'Eb Major', root: 'Eb', notes: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'] },
    { name: 'Bb Major', root: 'Bb', notes: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'] },
    { name: 'F Major', root: 'F', notes: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'] },
    // Numbers Mode special case
    { name: 'Numbers Only', root: 'C', notes: ['1', '2', '3', '4', '5', '6', '7'] }
  ];

  const [selectedKeyIndex, setSelectedKeyIndex] = useState(0); // Default C Major

  // Map scale degree (1-7) to semitone interval from C for MIDI calculation
  // We need this because playback always needs absolute pitch
  const SEMITONE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];

  useEffect(() => {
    parseInput(input, selectedKeyIndex);
  }, [input, selectedKeyIndex]);

  // Dimensions & Scaling
  const [kerning, setKerning] = useState(40); // User adjustable spacing
  const [verticalScale, setVerticalScale] = useState(20); // Scale for pitch height difference

  // Calculate dynamic dimensions for tight fit
  const validNotes = notes.filter(n => n.type === 'note');

  let CANVAS_WIDTH = 800;
  let CANVAS_HEIGHT = 400;
  let BASE_Y = 200;

  if (validNotes.length > 0) {
    const PADDING_X = 40;
    const PADDING_Y = 60; // Enough for font height

    CANVAS_WIDTH = Math.max(100, ((validNotes.length - 1) * kerning) + PADDING_X);

    const pitches = validNotes.map(n => n.pitchIndex);
    const minPitch = Math.min(...pitches);
    const maxPitch = Math.max(...pitches);

    // Highest note (visually top, lowest Y value) = -maxPitch * scale
    // Lowest note (visually bottom, highest Y value) = -minPitch * scale
    const heightRange = (maxPitch - minPitch) * verticalScale;
    CANVAS_HEIGHT = heightRange + PADDING_Y;

    // We want the highest note (-maxPitch * scale) to be at Y = PADDING_Y / 2
    // So: BASE_Y - (maxPitch * scale) = PADDING_Y / 2
    // BASE_Y = (maxPitch * scale) + (PADDING_Y / 2)
    BASE_Y = (maxPitch * verticalScale) + (PADDING_Y / 2);
  }

  // Audio Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(100); // Default 100 BPM

  const playMelody = async () => {
    if (isPlaying) return;
    setIsPlaying(true);

    await Tone.start();

    // Create a simple synth with a "piano-like" envelope
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.3,
        release: 1
      },
      volume: -5
    }).toDestination();

    // Filter output to dampen brightness (closer to piano)
    const filter = new Tone.Filter(800, "lowpass").toDestination();
    synth.connect(filter);

    const now = Tone.now();
    let timeOffset = 0;

    // Beats Per Minute to seconds per beat
    // This assumes each note is an 8th note for now (0.5 beats in X/4 time?) 
    // If the request implies "inputs are quarter notes", spacing is 60/BPM seconds.
    // Let's assume input notes are even quarter notes for this visualization.
    const secondsPerBeat = 60 / bpm;

    notes.forEach((note) => {
      if (note.type !== 'note') return;

      const frequency = Tone.Frequency(note.midiVal, "midi").toFrequency();
      // Use full beat duration, slightly shorter release for articulation
      const durationSeconds = note.duration * secondsPerBeat;
      synth.triggerAttackRelease(frequency, durationSeconds * 0.9, now + timeOffset);
      timeOffset += durationSeconds;
    });

    // Cleanup state after playing
    setTimeout(() => {
      setIsPlaying(false);
      synth.dispose(); // Dispose of the synth after use
      filter.dispose(); // Dispose of the filter after use
    }, timeOffset * 1000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8">

      {/* Header */}
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-bold text-teal-400 mb-2">
          Jianpu Visualizer
        </h1>
        <p className="text-text-muted">
          Design, Listen, and Save your Melodies
        </p>
      </header>

      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-7xl">

        {/* Library Sidebar */}
        <div className="w-full lg:w-64 flex-shrink-0 bg-bg-secondary border border-glass-border rounded-xl p-4 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
          <h2 className="text-xl font-bold text-white mb-2 sticky top-0 bg-bg-secondary py-2 border-b border-glass-border">
            Library
          </h2>
          {dbError && <div className="text-red-400 text-xs">{dbError}</div>}
          {library.length === 0 && !dbError && (
            <div className="text-text-muted text-sm italic">No saved melodies yet.</div>
          )}
          {library.map((item) => (
            <div
              key={item.id}
              onClick={() => loadMelody(item)}
              className="p-3 rounded-lg bg-bg-primary hover:bg-glass-surface cursor-pointer transition-colors border border-transparent hover:border-teal-500 group"
            >
              <div className="font-bold text-white text-sm group-hover:text-teal-400 truncate">{item.title}</div>
              {item.album && <div className="text-xs text-text-muted truncate">{item.album}</div>}
              <div className="text-[10px] text-gray-500 mt-1">{new Date(item.created_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>

        {/* Main Editor Panel */}
        <div className="glass-panel flex-1 p-6 flex flex-col gap-6">

          {/* Metadata Inputs */}
          <div className="flex flex-col md:flex-row gap-4 border-b border-glass-border pb-6">
            <div className="flex-1">
              <label className="text-teal-400 font-semibold text-xs uppercase tracking-wider block mb-1">Title</label>
              <input
                className="w-full bg-bg-secondary border border-glass-border rounded px-3 py-2 text-white focus:border-teal-500 outline-none"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Song Title"
              />
            </div>
            <div className="flex-1">
              <label className="text-teal-400 font-semibold text-xs uppercase tracking-wider block mb-1">Album / Collection</label>
              <input
                className="w-full bg-bg-secondary border border-glass-border rounded px-3 py-2 text-white focus:border-teal-500 outline-none"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder="Album Name"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={saveMelody}
                disabled={isSaving}
                className="bg-teal-500 hover:bg-opacity-80 text-black font-bold py-2 px-6 rounded-lg transition-all h-[42px] whitespace-nowrap"
              >
                {isSaving ? 'Saving...' : 'Save to Cloud'}
              </button>
            </div>
          </div>

          {/* Controls & Input */}
          <div className="flex flex-col gap-6">

            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex flex-col gap-2 flex-grow-[2]">
                <label className="text-teal-400 font-semibold text-sm uppercase tracking-wider">
                  Input Notation
                </label>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g. 1 2 3 4 5 6 7 1'"
                  className="w-full font-mono text-lg bg-bg-secondary border border-glass-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500"
                  spellCheck={false}
                />
                <div className="text-xs text-text-muted">
                  1-7 = Notes | ' = High Octave | " = Double High | , = Low Octave
                </div>
              </div>

              <div className="flex flex-col gap-2 flex-1">
                <label className="text-teal-400 font-semibold text-sm uppercase tracking-wider">
                  Key / Mode
                </label>
                <select
                  value={selectedKeyIndex}
                  onChange={(e) => setSelectedKeyIndex(Number(e.target.value))}
                  className="w-full h-full font-mono text-lg bg-bg-secondary border border-glass-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500"
                >
                  {SCALE_TYPES.map((scale, index) => (
                    <option key={scale.name} value={index}>{scale.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-teal-400 font-semibold text-sm uppercase tracking-wider">
                  Horizontal Spacing: {kerning}px
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={kerning}
                  onChange={(e) => setKerning(Number(e.target.value))}
                  className="w-full cursor-pointer accent-teal-500 h-2 bg-bg-secondary rounded-lg appearance-none"
                />
              </div>

              <div className="flex flex-col gap-2 flex-1">
                <label className="text-teal-400 font-semibold text-sm uppercase tracking-wider">
                  Vertical Scale: {verticalScale}px
                </label>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={verticalScale}
                  onChange={(e) => setVerticalScale(Number(e.target.value))}
                  className="w-full cursor-pointer accent-teal-500 h-2 bg-bg-secondary rounded-lg appearance-none"
                />
              </div>
            </div>
          </div>

          {/* Visualization Output - Styled like a White Paper / Card */}
          <div className="rounded-xl overflow-hidden bg-white shadow-xl border-4 border-white">
            <div className="overflow-x-auto">
              <div style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} className="relative mx-auto bg-white text-black">
                {notes.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400 font-sans opacity-50">
                    Enter notes to generate preview...
                  </div>
                ) : (
                  <svg
                    ref={svgRef}
                    width={CANVAS_WIDTH}
                    height={CANVAS_HEIGHT}
                    xmlns="http://www.w3.org/2000/svg"
                    className="block"
                  >
                    {notes.filter(item => item.type === 'note').map((item, index) => {
                      // Start from offset (20px which is PADDING_X/2)
                      const x = 20 + index * kerning;

                      // It is a note
                      // Vertical pos calculated with the dynamic scale
                      const y = BASE_Y - (item.pitchIndex * verticalScale);

                      // Split note and accidental for formatting
                      // Regex: First char is note (A-G), rest is accidental (#, b)
                      // But we used logic to construct label. 
                      // Use regex to separate letter from accidental symbols
                      const match = item.note.match(/^([A-Ga-g1-7])([#b]?)/);
                      let base = item.note;
                      let acc = '';

                      if (match) {
                        base = match[1];
                        acc = match[2];
                      }

                      return (
                        <g key={index}>
                          {/* Base Note */}
                          <text
                            x={x}
                            y={y}
                            dy="0.35em"
                            textAnchor="middle"
                            fill="#000000"
                            fontWeight="500"
                            fontFamily="sans-serif"
                            fontSize="24"
                          >
                            {base}
                          </text>
                          {/* Accidental - Rendered separately for robust export */}
                          {acc && (
                            <text
                              x={x + 10}
                              y={y - 8}
                              textAnchor="start"
                              fill="#000000"
                              fontWeight="bold"
                              fontFamily="sans-serif"
                              fontSize="14"
                            >
                              {acc}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex flex-col md:flex-row justify-between items-center bg-bg-secondary p-4 rounded-lg border border-glass-border md:gap-4 gap-4">
            <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
              <button
                onClick={playMelody}
                disabled={isPlaying || notes.length === 0}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-all shadow-lg w-full md:w-auto justify-center
                  ${isPlaying || notes.length === 0
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-teal-500 to-teal-700 text-white hover:translate-y-[-2px] hover:shadow-cyan-500/20'}`}
              >
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                  {isPlaying ? (
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                  ) : (
                    <path d="M8 5v14l11-7z" />
                  )}
                  {isPlaying && <rect x="14" y="4" width="4" height="16" rx="1" />}
                </svg>
                {isPlaying ? 'Playing...' : 'Play Melody'}
              </button>

              <div className="flex items-center gap-2">
                <label className="text-sm font-semibold text-text-muted whitespace-nowrap">Tempo:</label>
                <select
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  className="bg-bg-primary border border-glass-border rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-teal-500"
                  style={{ width: '80px', padding: '0.4rem' }}
                >
                  {Array.from({ length: 17 }, (_, i) => 60 + (i * 5)).map(b => (
                    <option key={b} value={b}>{b} BPM</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto justify-center md:justify-end">
              <span className="text-sm text-text-muted hidden md:inline">
                SVG Output
              </span>
              <button onClick={handleDownload} className="btn-primary flex items-center gap-2 w-full md:w-auto justify-center">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                </svg>
                Download SVG
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
