# Jianpu Melody Visualizer

A modern, interactive web application for composing, visualizing, and preserving Jianpu (numbered musical notation) melodies. Built for musicians and educators who need a clean, print-ready way to digitize numbered notation.

## 🚀 Features

### 🎼 Visualizer Engine
- **Real-time Parsing**: Instantly converts text input (e.g., `1 2 3 5 6`) into graphical notes.
- **Advanced Syntax**: Supports octaves (`'`, `"`), accidentals (`#`, `b`), and rhythm indicators.
- **Customizable Layout**: Fine-tune your score with **Kerning** (spacing) and **Vertical Scale** (pitch height) sliders.
- **SVG Export**: Download high-quality, print-ready SVG files of your melodies.

### 🎹 Playback & Audio
- **In-browser Syntax**: Hear your composition immediately using synthesized piano tones (Tone.js).
- **Tempo Control**: Adjustable BPM range (60 - 140 BPM).
- **Key Signatures**: Transpose playback automatically across 12 major keys (C, G, F#, Db, etc.).

### ☁️ Cloud Persistence
- **Melody Library**: Save your compositions to the cloud and access them anytime.
- **Metadata**: Organize tunes by **Title** and **Album**.
- **Powered by Turso**: Uses a lightweight, serverless SQLite database (libSQL) for fast and reliable storage.

## 🛠️ Tech Stack
- **Frontend**: React, Vite, Tailwind CSS
- **Audio**: Tone.js
- **Database**: Turso (libSQL)
- **Deployment**: Vercel Ready

## 📦 Setup & Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-username/jianpu-visualizer.git
    cd jianpu-visualizer
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Database**:
    - Create a database at [Turso.tech](https://turso.tech).
    - Get your `Database URL` and `Auth Token`.
    - Create a `.env` file in the root:
      ```env
      VITE_TURSO_DATABASE_URL=your-turso-url
      VITE_TURSO_AUTH_TOKEN=your-auth-token
      ```
    - Run the initialization SQL (see below).

4.  **Run Locally**:
    ```bash
    npm run dev
    ```

## 🗄️ Database Schema
To initialize your Turso database, run:
```sql
CREATE TABLE melodies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  title TEXT NOT NULL,
  album TEXT,
  content TEXT NOT NULL,
  key_index INTEGER DEFAULT 0,
  bpm INTEGER DEFAULT 60
);
```
