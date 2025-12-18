
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

const SEMITONE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];

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

function App() {







  const [blocks, setBlocks] = useState([{ type: 'melody', content: "1 2 3 1' 5," }]);
  const [parsedBlocks, setParsedBlocks] = useState([]);
  const [playOnlySelected, setPlayOnlySelected] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState({ blockIndex: null, text: "" });
  const svgRefs = useRef([]); // Array of refs for multiple SVGs
  const synthRef = useRef(null);
  const filterRef = useRef(null);

  // Persistence State
  const [title, setTitle] = useState("Untitled Melody");
  const [album, setAlbum] = useState("");
  const [library, setLibrary] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [dbError, setDbError] = useState(null);

  // Settings
  const [selectedKeyIndex, setSelectedKeyIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(100); // Default 100 BPM
  const selectedKeyRef = useRef(0); // Ref for audio loop access

  // Sync Ref with State and Tone Transport
  useEffect(() => {
    selectedKeyRef.current = selectedKeyIndex;
    Tone.Transport.bpm.value = bpm;
  }, [selectedKeyIndex, bpm]);



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
        if (confirm(`Overwrite existing "${title}" in "${album || 'Uncategorized'}" ? `)) {
          const saveData = {
            blocks: blocks,
            settings: {
              kerning,
              verticalScale
            }
          };

          await turso.execute({
            sql: "UPDATE melodies SET content = ?, key_index = ?, bpm = ? WHERE id = ?",
            args: [JSON.stringify(saveData), selectedKeyIndex, bpm, existingId]
          });
          alert("Melody updated!");
        } else {
          setIsSaving(false);
          return;
        }
      } else {
        const saveData = {
          blocks: blocks,
          settings: {
            kerning,
            verticalScale
          }
        };

        await turso.execute({
          sql: "INSERT INTO melodies (title, album, content, key_index, bpm, owner_id) VALUES (?, ?, ?, ?, ?, ?)",
          args: [title, album, JSON.stringify(saveData), selectedKeyIndex, bpm, userId]
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
    if (!confirm(`Are you sure you want to delete "${item.title}" ? `)) return;

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
    if (confirm(`Load "${item.title}" ? Unsaved changes will be lost.`)) {
      setTitle(item.title);
      setAlbum(item.album || "");

      try {
        const loadedContent = JSON.parse(item.content);
        if (Array.isArray(loadedContent)) {
          // Legacy Format V1: just an array of strings
          setBlocks(loadedContent.map(s => ({ type: 'melody', content: s })));
          // Keep current settings or reset to defaults? 
          // Requirement implies only saved songs have settings.
        } else if (loadedContent && loadedContent.blocks) {
          // New Format: { blocks, settings }
          // Blocks can be strings (V2) or objects (V3)
          const normalizedBlocks = loadedContent.blocks.map(b =>
            typeof b === 'string' ? { type: 'melody', content: b } : b
          );
          setBlocks(normalizedBlocks);

          if (loadedContent.settings) {
            if (loadedContent.settings.kerning) setKerning(loadedContent.settings.kerning);
            if (loadedContent.settings.verticalScale) setVerticalScale(loadedContent.settings.verticalScale);
          }
        } else {
          // Fallback
          setBlocks([{ type: 'melody', content: item.content }]);
        }
      } catch (e) {
        // Fallback
        setBlocks([{ type: 'melody', content: item.content }]);
      }

      setSelectedKeyIndex(item.key_index || 0);
      setBpm(item.bpm || 60);
    }
  };

  const updateBlock = (index, value) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], content: value };
    setBlocks(newBlocks);
  };

  const addBlock = (type = 'melody') => {
    setBlocks([...blocks, { type, content: "" }]);
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
    const tokens = str.match(/([|:]+|\[[^\]]+\]|[1-7][b#n'\",._=-]*)/g) || [];

    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];

      // -- CASE 1: Bar Line or Structure --
      if (/^[|:[]/.test(token)) {
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
          digit: noteChar, // Store the actual number (1-7)
          note: visualLabel,
          octave,
          pitchIndex,
          midiVal: finalMidi,
          duration: duration,
          originalText: token,
          // Metadata for visual rendering
          elementMetadata: {
            underscoreCount,
            dotCount,
            dashCount
          }
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
  // selectedKeyIndex is defined above with Refs

  useEffect(() => {
    const results = blocks.map(block => {
      // Normalize to object if still string (safety)
      const type = block.type || 'melody';
      const content = block.content !== undefined ? block.content : (typeof block === 'string' ? block : "");

      if (type === 'chords') {
        // Chords Parsing: Just Chars
        // Splitting by character as requested ("just letters/characters")
        return {
          type: 'chords',
          chars: content.split(''),
          originalText: content
        };
      }

      // Melody Parsing
      const parsed = parseInput(content, selectedKeyIndex);
      return { type: 'melody', ...parsed, originalText: content };
    });
    setParsedBlocks(results);
  }, [blocks, selectedKeyIndex]);

  // Dimensions & Scaling
  const [kerning, setKerning] = useState(20); // User adjustable spacing

  const [verticalScale, setVerticalScale] = useState(20);

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

  const stopMelody = () => {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.loop = false;
    if (synthRef.current) {
      synthRef.current.releaseAll();
      synthRef.current.dispose();
      synthRef.current = null;
    }
    if (filterRef.current) {
      filterRef.current.dispose();
      filterRef.current = null;
    }
    setIsPlaying(false);
  };

  const playMelody = async () => {
    if (isPlaying) {
      stopMelody();
      return;
    }
    setIsPlaying(true);

    await Tone.start();
    Tone.Transport.cancel(); // Clear any existing events
    Tone.Transport.bpm.value = bpm;

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

    synthRef.current = synth;
    filterRef.current = filter;

    let blocksToPlay = parsedBlocks;

    if (playOnlySelected) {
      if (selectionInfo.text?.trim()) {
        const temp = parseInput(selectionInfo.text, selectedKeyIndex);
        blocksToPlay = [{ type: 'melody', ...temp, originalText: selectionInfo.text }];
      } else if (selectionInfo.blockIndex !== null && parsedBlocks[selectionInfo.blockIndex]) {
        blocksToPlay = [parsedBlocks[selectionInfo.blockIndex]];
      } else {
        setIsPlaying(false);
        return;
      }
    }

    let currentTicks = 0;

    // Sequential Playback using Transport
    blocksToPlay.forEach((blockResult) => {
      blockResult.notes?.forEach((note) => {
        if (note.type !== 'note') return;

        const frequency = Tone.Frequency(note.midiVal, "midi").toFrequency();
        const startTicks = currentTicks;
        const durationTicks = note.duration * Tone.Transport.PPQ; // PPQ is ticks per quarter note

        Tone.Transport.schedule((time) => {
          // Calculate duration in seconds at trigger time for accurate release
          const secondsPerBeat = 60 / Tone.Transport.bpm.value;
          const durationSeconds = note.duration * secondsPerBeat;
          synth.triggerAttackRelease(frequency, durationSeconds * 0.9, time);
        }, Tone.Ticks(startTicks));

        currentTicks += durationTicks;
      });
    });

    // Schedule stop at the end or loop
    if (isLooping) {
      Tone.Transport.loop = true;
      Tone.Transport.loopStart = 0;
      Tone.Transport.loopEnd = Tone.Ticks(currentTicks + Tone.Transport.PPQ);
    } else {
      Tone.Transport.schedule((time) => {
        Tone.Draw.schedule(() => {
          stopMelody();
        }, time);
      }, Tone.Ticks(currentTicks + Tone.Transport.PPQ));
    }

    Tone.Transport.start();
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-primary font-sans">

      {/* Header */}
      <header className="flex-shrink-0 bg-bg-secondary border-b border-glass-border p-4 flex justify-between items-center z-20">
        <div>
          <h1 className="text-2xl font-bold text-teal-400">Jianpu Visualizer</h1>
          <p className="text-[10px] text-text-muted uppercase tracking-[0.2em]">Design, Listen, and Save</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-teal-400 font-bold uppercase tracking-widest">{title}</span>
            <span className="text-[9px] text-text-muted">{album || 'Uncategorized'}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden w-full max-w-[100vw]">

        {/* Library Sidebar */}
        <div className="w-64 flex-shrink-0 bg-bg-secondary/50 border-r border-glass-border flex flex-col overflow-hidden">
          <div className="p-4 border-b border-glass-border">
            <h2 className="text-xs font-bold text-teal-400 uppercase tracking-widest">Library</h2>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
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
        </div>

        {/* Main Editor Panel */}
        <div className="flex-1 flex flex-col overflow-hidden bg-bg-primary">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div className="max-w-6xl mx-auto flex flex-col gap-6">

              {/* Metadata Inputs */}
              <div className="flex flex-col md:flex-row gap-4 bg-bg-secondary/30 p-4 rounded-xl border border-glass-border">
                <div className="flex-1">
                  <label className="text-teal-400 font-semibold text-[10px] uppercase tracking-wider block mb-1">Title</label>
                  <input
                    className="w-full bg-bg-secondary border border-glass-border rounded px-3 py-2 text-white focus:border-teal-500 outline-none text-sm"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Song Title"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-teal-400 font-semibold text-[10px] uppercase tracking-wider block mb-1">Album / Collection</label>
                  <input
                    className="w-full bg-bg-secondary border border-glass-border rounded px-3 py-2 text-white focus:border-teal-500 outline-none text-sm"
                    value={album}
                    onChange={(e) => setAlbum(e.target.value)}
                    placeholder="Album Name"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={saveMelody}
                    disabled={isSaving}
                    className="bg-teal-500 hover:bg-opacity-80 text-black font-bold py-2 px-6 rounded-lg transition-all h-[38px] text-xs whitespace-nowrap"
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
                    <div className="flex gap-2">
                      <button onClick={() => addBlock('melody')} className="text-xs bg-teal-600 hover:bg-teal-500 px-3 py-1 rounded transition-colors text-white font-semibold">
                        + Melody
                      </button>
                      <button onClick={() => addBlock('chords')} className="text-xs bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded transition-colors text-white font-semibold">
                        + Chords
                      </button>
                    </div>
                  </div>

                  {blocks.map((blockContent, index) => (
                    <div key={index} className="glass-panel p-4 rounded-xl border border-glass-border bg-base-100/30">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-teal-400">
                            Section {index + 1}
                            <span className="text-xs text-text-muted ml-2 uppercase border border-glass-border px-1 rounded">
                              {blockContent.type === 'chords' ? 'Chords' : 'Melody'}
                            </span>
                          </h3>
                        </div>

                        <button
                          onClick={() => removeBlock(index)}
                          className="text-gray-500 hover:text-red-400 transition-colors text-sm"
                        >
                          Remove
                        </button>
                      </div>

                      <textarea
                        value={blockContent.content || (typeof blockContent === 'string' ? blockContent : "")}
                        onChange={(e) => updateBlock(index, e.target.value)}
                        onFocus={() => setSelectionInfo(prev => ({ ...prev, blockIndex: index }))}
                        onSelect={(e) => {
                          setSelectionInfo({
                            blockIndex: index,
                            text: e.target.value.substring(e.target.selectionStart, e.target.selectionEnd)
                          });
                        }}
                        className="w-full min-h-[120px] bg-bg-primary p-3 rounded-lg border border-glass-border focus:border-teal-500 focus:outline-none font-mono text-lg resize-y mb-4"
                        placeholder="Enter notes (e.g., 1 2 3)"
                      />

                      {/* INTEGRATED VISUALIZATION */}
                      {parsedBlocks[index] && (
                        <div className="bg-white rounded-lg p-2 relative group-vis">
                          {/* Label for the section */}
                          <div className="absolute top-1 left-2 text-gray-400 text-[8px] font-bold uppercase tracking-widest pointer-events-none z-10">
                            Visual Output
                          </div>

                          {/* Download Button */}
                          <button
                            onClick={() => handleDownloadSection(index)}
                            className="absolute top-1 right-1 bg-gray-100 hover:bg-gray-200 text-gray-600 p-1.5 rounded transition-all opacity-0 group-hover:opacity-100 z-10"
                            title="Download SVG"
                          >
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                            </svg>
                          </button>

                          <div className="overflow-x-auto w-full custom-scrollbar">
                            {parsedBlocks[index].type === 'chords' ? (
                              // Chords Rendering
                              <div style={{ width: Math.max(100, (parsedBlocks[index].chars.length * kerning) + 40), height: 80 }} className="relative mx-auto text-black">
                                <svg
                                  ref={el => svgRefs.current[index] = el}
                                  width={Math.max(100, (parsedBlocks[index].chars.length * kerning) + 40)}
                                  height={80}
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  {parsedBlocks[index].chars.map((char, cIdx) => (
                                    <text key={cIdx} x={20 + (cIdx * kerning)} y="50" textAnchor="middle" fill="#000000" fontWeight="bold" fontFamily="monospace" fontSize="22">{char}</text>
                                  ))}
                                </svg>
                              </div>
                            ) : (
                              // Melody Rendering
                              (() => {
                                const { width: vW, height: vH, baseY: vB } = calculateCanvasSize(parsedBlocks[index].notes);
                                return (
                                  <div style={{ width: vW, height: vH, minWidth: '100%' }} className="relative text-black">
                                    <svg
                                      ref={el => svgRefs.current[index] = el}
                                      width={vW}
                                      height={vH}
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      {parsedBlocks[index].notes.filter(item => item.type === 'note').map((item, nIdx, array) => {
                                        const x = 20 + nIdx * kerning;
                                        const y = vB - (item.pitchIndex * verticalScale);

                                        // Beaming info
                                        const nextItem = array[nIdx + 1];
                                        let nextY = y;
                                        let nextX = x;
                                        if (nextItem) {
                                          nextY = vB - (nextItem.pitchIndex * verticalScale);
                                          nextX = 20 + (nIdx + 1) * kerning;
                                        }

                                        return (
                                          <g key={nIdx}>
                                            <text x={x} y={y} dy="0.35em" textAnchor="middle" fill="#000000" fontWeight="500" fontFamily="sans-serif" fontSize="24">{item.note}</text>

                                            {item.elementMetadata?.dotCount > 0 && <circle cx={x + 14} cy={y} r={2.5} fill="#000000" />}

                                            {item.elementMetadata?.dashCount > 0 && Array.from({ length: item.elementMetadata.dashCount }).map((_, di) => (
                                              <text key={`dash-${di}`} x={x + 24 + (di * 20)} y={y} dy="0.35em" textAnchor="middle" fill="#000000" fontSize="24">-</text>
                                            ))}

                                            {item.elementMetadata?.underscoreCount >= 1 && (
                                              <>
                                                <line x1={x - 8} y1={y + 14} x2={x + 8} y2={y + 14} stroke="#000000" strokeWidth="2" />
                                                {nextItem?.elementMetadata?.underscoreCount >= 1 && (
                                                  <line x1={x + 8} y1={y + 14} x2={nextX - 8} y2={nextY + 14} stroke="#000000" strokeWidth="2" />
                                                )}
                                              </>
                                            )}
                                            {item.elementMetadata?.underscoreCount >= 2 && (
                                              <>
                                                <line x1={x - 8} y1={y + 20} x2={x + 8} y2={y + 20} stroke="#000000" strokeWidth="2" />
                                                {nextItem?.elementMetadata?.underscoreCount >= 2 && (
                                                  <line x1={x + 8} y1={y + 20} x2={nextX - 8} y2={nextY + 20} stroke="#000000" strokeWidth="2" />
                                                )}
                                              </>
                                            )}
                                          </g>
                                        );
                                      })}
                                    </svg>
                                  </div>
                                );
                              })()
                            )}
                          </div>
                        </div>
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

            </div>
          </div>

          {/* Footer Controls - Fixed at bottom of panel */}
          <div className="flex-shrink-0 bg-bg-secondary p-4 border-t border-glass-border flex flex-col md:flex-row justify-between items-center gap-4 z-20">
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="flex flex-col gap-4 w-full md:w-auto">
                <div className="flex items-center gap-2">
                  <button
                    onClick={playMelody}
                    onMouseDown={(e) => e.preventDefault()}
                    className={`flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-all shadow-lg flex-1 justify-center
                    ${isPlaying
                        ? 'bg-orange-500 text-white animate-pulse'
                        : 'bg-teal-500 text-bg-primary hover:bg-teal-400'
                      } `}
                  >
                    <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    {isPlaying ? 'Playing...' : 'Play'}
                  </button>

                  <button
                    onClick={stopMelody}
                    className={`flex items-center justify-center w-12 h-10 rounded-lg transition-all shadow-lg
                    ${isPlaying
                        ? 'bg-red-500 text-white hover:bg-red-400'
                        : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
                      }`}
                    title="Stop"
                  >
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                  </button>

                  <label className="flex items-center gap-2 text-xs text-white cursor-pointer select-none bg-bg-secondary px-3 py-2 rounded-lg border border-glass-border hover:border-teal-500 transition-colors whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={playOnlySelected}
                      onChange={(e) => setPlayOnlySelected(e.target.checked)}
                      className="accent-teal-500 w-4 h-4"
                    />
                    Selected Melody
                  </label>

                  <label className="flex items-center gap-2 text-xs text-white cursor-pointer select-none bg-bg-secondary px-3 py-2 rounded-lg border border-glass-border hover:border-teal-500 transition-colors whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={isLooping}
                      onChange={(e) => setIsLooping(e.target.checked)}
                      className="accent-teal-500 w-4 h-4"
                    />
                    Loop
                  </label>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-xs text-text-muted font-bold uppercase tracking-wider">
                    <span>Tempo</span>
                    <span className="text-teal-400">{bpm} BPM</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="160"
                    step="1"
                    value={bpm}
                    onChange={(e) => setBpm(Number(e.target.value))}
                    className="w-full h-4 bg-bg-primary rounded-lg cursor-pointer accent-teal-500 border border-glass-border"
                    style={{ minWidth: '150px' }}
                  />
                </div>
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
