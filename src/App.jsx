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
  const [blocks, setBlocks] = useState(["1 2 3 1' 5,"]);
  const [parsedBlocks, setParsedBlocks] = useState([]);
  const svgRefs = useRef([]); // Array of refs for multiple SVGs

  // Persistence State
  const [title, setTitle] = useState("Untitled Melody");
  const [album, setAlbum] = useState("");
  const [library, setLibrary] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [dbError, setDbError] = useState(null);

  // User Identity (Simple LocalStorage UUID)
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    // 1. Initialize User ID
    let storedId = localStorage.getItem('jianpu_user_id');
    if (!storedId) {
      storedId = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('jianpu_user_id', storedId);
    }
    setUserId(storedId);

    // 2. Load Library
    fetchLibrary();
  }, []);

  const fetchLibrary = async () => {
    try {
      // Fetch all, we'll filter UI actions by owner_id on the client
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

      // Check for existing melody by this owner with same title/album
      let existingId = null;
      try {
        const check = await turso.execute({
          sql: "SELECT id FROM melodies WHERE title = ? AND album = ? AND owner_id = ?",
          args: [title, album || "", userId]
        });
        if (check.rows.length > 0) {
          existingId = check.rows[0].id;
        }
      } catch (e) {
        console.warn("Check failed", e);
      }

      if (existingId) {
        if (confirm(`Overwrite existing "${title}" in "${album || 'Uncategorized'}"?`)) {
          await turso.execute({
            sql: "UPDATE melodies SET content = ?, key_index = ?, bpm = ? WHERE id = ?",
            args: [JSON.stringify(blocks), selectedKeyIndex, bpm, existingId]
          });
          alert("Melody updated!");
        } else {
          setIsSaving(false);
          return;
        }
      } else {
        await turso.execute({
          sql: "INSERT INTO melodies (title, album, content, key_index, bpm, owner_id) VALUES (?, ?, ?, ?, ?, ?)",
          args: [title, album, JSON.stringify(blocks), selectedKeyIndex, bpm, userId]
        });
        alert("Melody saved!");
      }

      await fetchLibrary(); // Refresh list
    } catch (e) {
      console.error("Save failed:", e);
      if (e.message.includes("no such column: owner_id")) {
        alert("Database Error: Missing 'owner_id' column. Please run the SQL migration.");
      } else {
        alert("Failed to save: " + e.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const deleteMelody = async (e, item) => {
    e.stopPropagation(); // Prevent loading when clicking delete
    if (!confirm(`Are you sure you want to delete "${item.title}"?`)) return;

    try {
      await turso.execute({
        sql: "DELETE FROM melodies WHERE id = ?",
        args: [item.id]
      });
      await fetchLibrary(); // Refresh
    } catch (e) {
      console.error("Delete failed:", e);
      alert("Failed to delete: " + e.message);
    }
  };

  const loadMelody = (item) => {
    if (confirm(`Load "${item.title}"? Unsaved changes will be lost.`)) {
      setTitle(item.title);
      setAlbum(item.album || "");

      try {
        const loadedContent = JSON.parse(item.content);
        if (Array.isArray(loadedContent)) {
          setBlocks(loadedContent);
        } else {
          // Fallback for legacy single-string data
          setBlocks([item.content]);
        }
      } catch (e) {
        // Fallback if parsing fails
        setBlocks([item.content]);
      }

      setSelectedKeyIndex(item.key_index || 0);
      setBpm(item.bpm || 60);
    }
  };

  const updateBlock = (index, value) => {
    const newBlocks = [...blocks];
    newBlocks[index] = value;
    setBlocks(newBlocks);
  };

  const addBlock = () => {
    setBlocks([...blocks, ""]);
  };

  const removeBlock = (index) => {
    if (blocks.length > 1) {
      const newBlocks = blocks.filter((_, i) => i !== index);
      setBlocks(newBlocks);
    }
  };

  const parseInput = (str, keyIndex) => {
    const parsed = [];
    const currentScale = SCALE_TYPES[keyIndex] || SCALE_TYPES[0];
    const isNumbersMode = currentScale.name === 'Numbers Only';
    let totalDuration = 0;

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
          text: token
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

        const sharps = (modifiers.match(/#/g) || []).length;
        const flats = (modifiers.match(/b/g) || []).length;
        if (modifiers.includes('n')) accidental = 0;
        else accidental = sharps - flats;

        const highOctaves = (modifiers.match(/'/g) || []).length;
        const doubleHigh = (modifiers.match(/"/g) || []).length;
        const lowOctaves = (modifiers.match(/,/g) || []).length;
        octave = (highOctaves * 1) + (doubleHigh * 2) - lowOctaves;

        const underscoreCount = (modifiers.match(/_/g) || []).length;
        const equalsCount = (modifiers.match(/=/g) || []).length;
        const dashCount = (modifiers.match(/-/g) || []).length;
        const dotCount = (modifiers.match(/\./g) || []).length;

        if (equalsCount > 0) {
          duration = 0.25;
        } else if (underscoreCount > 0) {
          duration = Math.pow(0.5, underscoreCount);
        }

        duration += dashCount;

        if (dotCount > 0) duration *= 1.5;

        totalDuration += duration;

        // VISUAL LABEL
        let visualLabel = currentScale.notes[noteNum - 1];
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
    return { notes: parsed, totalDuration };
  };

  const normalizeFilename = (text) => {
    if (!text) return "";
    return text
      .trim()
      .replace(/[^a-zA-Z0-9\s-_]/g, "") // Remove special chars
      .replace(/\s+/g, "_"); // Replace spaces with underscores
  };

  const handleDownloadSection = (index) => {
    const svgEl = svgRefs.current[index];
    if (!svgEl) return;

    const serializer = new XMLSerializer();
    const svgData = serializer.serializeToString(svgEl);

    const normAlbum = normalizeFilename(album);
    const normTitle = normalizeFilename(title) || "Untitled";

    // Format: Album_Title_Section_1.svg (skip album if empty)
    let filename = `${normTitle}_Section_${index + 1}.svg`;
    if (normAlbum) {
      filename = `${normAlbum}_${normTitle}_Section_${index + 1}.svg`;
    }

    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
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
    { name: 'Numbers Only', root: 'C', notes: ['1', '2', '3', '4', '5', '6', '7'] }
  ];

  const [selectedKeyIndex, setSelectedKeyIndex] = useState(0); // Default C Major

  // Map scale degree (1-7) to semitone interval from C for MIDI calculation
  const SEMITONE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];

  useEffect(() => {
    const results = blocks.map(block => parseInput(block, selectedKeyIndex));
    setParsedBlocks(results);
  }, [blocks, selectedKeyIndex]);

  // Dimensions & Scaling
  const [kerning, setKerning] = useState(40); // User adjustable spacing
  const [verticalScale, setVerticalScale] = useState(20); // Scale for pitch height difference

  const calculateCanvasSize = (notes) => {
    let width = 800;
    let height = 200;
    let baseY = 100;

    const validNotes = notes.filter(n => n.type === 'note');
    if (validNotes.length > 0) {
      const PADDING_X = 40;
      const PADDING_Y = 60;

      width = Math.max(100, ((validNotes.length - 1) * kerning) + PADDING_X);

      const pitches = validNotes.map(n => n.pitchIndex);
      const minPitch = Math.min(...pitches);
      const maxPitch = Math.max(...pitches);

      const heightRange = (maxPitch - minPitch) * verticalScale;
      height = heightRange + PADDING_Y;
      baseY = (maxPitch * verticalScale) + (PADDING_Y / 2);
    }
    return { width, height, baseY };
  };

  // Audio Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(100); // Default 100 BPM

  const playMelody = async () => {
    if (isPlaying) return;
    setIsPlaying(true);

    await Tone.start();

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

    const filter = new Tone.Filter(800, "lowpass").toDestination();
    synth.connect(filter);

    const now = Tone.now();
    const secondsPerBeat = 60 / bpm;
    let globalTimeOffset = 0;

    // Sequential Playback
    parsedBlocks.forEach((blockResult) => {
      let blockTimeOffset = 0;

      blockResult.notes.forEach((note) => {
        if (note.type !== 'note') return;

        const frequency = Tone.Frequency(note.midiVal, "midi").toFrequency();
        const durationSeconds = note.duration * secondsPerBeat;
        synth.triggerAttackRelease(frequency, durationSeconds * 0.9, now + globalTimeOffset + blockTimeOffset);
        blockTimeOffset += durationSeconds;
      });

      // Add this block's total duration to the global offset so next block starts after
      globalTimeOffset += blockResult.totalDuration * secondsPerBeat;
    });

    setTimeout(() => {
      setIsPlaying(false);
      synth.dispose();
      filter.dispose();
    }, globalTimeOffset * 1000 + 500); // Buffer
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
              className="p-3 rounded-lg bg-bg-primary hover:bg-glass-surface cursor-pointer transition-colors border border-transparent hover:border-teal-500 group relative"
            >
              <div className="font-bold text-white text-sm group-hover:text-teal-400 truncate pr-6">{item.title}</div>
              {item.album && <div className="text-xs text-text-muted truncate pr-6">{item.album}</div>}
              <div className="text-[10px] text-gray-500 mt-1">{new Date(item.created_at).toLocaleDateString()}</div>

              {/* Delete Button (Only if Owner) */}
              {item.owner_id === userId && (
                <button
                  onClick={(e) => deleteMelody(e, item)}
                  className="absolute top-2 right-2 text-gray-600 hover:text-red-500 transition-colors bg-base-100/50 rounded p-1"
                  title="Delete"
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                  </svg>
                </button>
              )}
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

            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <label className="text-teal-400 font-semibold text-sm uppercase tracking-wider">
                  Melody Sections
                </label>
                <button onClick={addBlock} className="text-xs bg-bg-secondary hover:bg-glass-border px-3 py-1 rounded border border-glass-border transition-colors">
                  + Add Section
                </button>
              </div>

              {blocks.map((blockContent, index) => (
                <div key={index} className="flex gap-2">
                  <div className="flex-grow relative">
                    <span className="absolute left-[-25px] top-3 text-text-muted text-xs font-mono">{index + 1}.</span>
                    <input
                      type="text"
                      value={blockContent}
                      onChange={(e) => updateBlock(index, e.target.value)}
                      placeholder={`Section ${index + 1} notes...`}
                      className="w-full font-mono text-lg bg-bg-secondary border border-glass-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500"
                      spellCheck={false}
                    />
                  </div>
                  {blocks.length > 1 && (
                    <button
                      onClick={() => removeBlock(index)}
                      className="px-3 py-2 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded-lg border border-red-900/50 transition-colors"
                      title="Remove Section"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}


              <div className="flex flex-col gap-2 flex-1 mt-4">
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

          {/* Visualization Output - Multiple Stacked SVGs */}
          <div className="flex flex-col gap-4">

            {parsedBlocks.map((blockResult, bIndex) => {
              const { width, height, baseY } = calculateCanvasSize(blockResult.notes);
              return (
                <div key={bIndex} className="rounded-xl overflow-hidden bg-white shadow-xl border-4 border-white relative group">
                  {/* Label for the section */}
                  <div className="absolute top-2 left-2 text-gray-400 text-xs font-bold uppercase tracking-widest pointer-events-none">
                    Section {bIndex + 1}
                  </div>

                  {/* Download Button (Appears on Hover) */}
                  <button
                    onClick={() => handleDownloadSection(bIndex)}
                    className="absolute top-2 right-2 bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100 z-10"
                    title="Download SVG"
                  >
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                  </button>

                  <div className="overflow-x-auto">
                    <div style={{ width: width, height: height }} className="relative mx-auto bg-white text-black">
                      {blockResult.notes.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-400 font-sans opacity-50">
                          ...
                        </div>
                      ) : (
                        <svg
                          ref={el => svgRefs.current[bIndex] = el}
                          width={width}
                          height={height}
                          xmlns="http://www.w3.org/2000/svg"
                          className="block"
                        >
                          {blockResult.notes.filter(item => item.type === 'note').map((item, index) => {
                            const x = 20 + index * kerning;
                            const y = baseY - (item.pitchIndex * verticalScale);
                            const match = item.note.match(/^([A-Ga-g1-7])([#b]?)/);
                            let base = item.note;
                            let acc = '';
                            if (match) { base = match[1]; acc = match[2]; }

                            return (
                              <g key={index}>
                                <text x={x} y={y} dy="0.35em" textAnchor="middle" fill="#000000" fontWeight="500" fontFamily="sans-serif" fontSize="24">{base}</text>
                                {acc && <text x={x + 10} y={y - 8} textAnchor="start" fill="#000000" fontWeight="bold" fontFamily="sans-serif" fontSize="14">{acc}</text>}
                              </g>
                            );
                          })}
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Controls */}
          <div className="flex flex-col md:flex-row justify-between items-center bg-bg-secondary p-4 rounded-lg border border-glass-border md:gap-4 gap-4">
            <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
              <button
                onClick={playMelody}
                disabled={isPlaying}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-all shadow-lg w-full md:w-auto justify-center
                  ${isPlaying
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
                {isPlaying ? 'Playing...' : 'Play Sequence'}
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

            <div className="flex items-center gap-4 w-full md:w-auto justify-center md:justify-end text-sm text-text-muted">
              <span className="hidden md:inline">Hover over sections to download SVG</span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
