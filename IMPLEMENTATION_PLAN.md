# Jianpu Visualizer Implementation

## Overview
A web-based tool to convert Jianpu (numbered musical notation) into a visual pitch graph using Letter Names (C, D, E).

## Features
- **Input Parsing**: Handles numbers 1-7.
- **Octave Support**: 
  - `'` = +1 octave
  - `"` = +2 octaves
  - `,` = -1 octave
- **Vertical Pitch visualization**: Notes are placed higher/lower on the Y-axis based on their pitch relative to Middle C.
- **Export**: Users can download the generated visualization as an SVG file.
- **Theme**: "Stellar Meteoroid" dark space theme.

## Tech Stack
- **Framework**: React + Vite
- **Styling**: Tailwind CSS + Custom CSS Variables (Glassmorphism)
- **Visualization**: Embedded SVG

## Usage
1. Open the application.
2. Type numbers in the input box (e.g., `1 2 3 '1`).
3. See the visualization update instantly.
4. Click "Download SVG" to save.

## Future Improvements
- Rhythm support (underlines for eighth characters, etc.).
- Key signature configuration (currently C Major is assumed).
- Polyphony (chords).
