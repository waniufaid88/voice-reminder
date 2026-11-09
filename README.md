# VoiceReminder - Smart Voice & Text Notes, Reminders & Lists

A full-stack productivity app built with **Next.js 16 (App Router)**, **Convex Realtime Database**, **Custom Session Cookie Authentication**, and **OpenAI AI (Whisper + GPT-4o-mini)**.

---

## Features

- **Microphone Voice Capture with Live Waveforms**:
  - Web Audio API canvas visualizer displaying real-time frequency waveforms.
  - Recording controls: **Record**, **Pause**, **Resume**, **Stop**, and **Cancel** with a live duration timer.
  - Automatically saves the original audio clip to Convex File Storage for playback.
- **Smart AI Categorization & Structuring**:
  - Automatically transcribes voice audio using OpenAI Whisper (`whisper-1`).
  - Automatically categorizes entries into **Notes**, **Reminders** (with computed due dates), or **Lists** (with interactive checklist items) using GPT-4o-mini in JSON mode.
  - Includes an **Editable Preview Dialog** allowing users to review, adjust the type, title, due date, items, or tags before saving.
- **Direct Manual Text Input**:
  - Type thoughts directly in the Smart Capture bar; pressing Enter sends the prompt to the AI categorization engine or saves as a note.
- **Interactive Dashboard & In-Place Cards**:
  - **Checklists**: Toggle completion status in real-time, view `X/Y` completion progress bar.
  - **Reminders**: Visual status pills (**Overdue**, **Due Today**, **Upcoming**, **Completed**), one-click **Done** toggle, and **Snooze** options (+15m, +1h, +Tomorrow).
  - **Notes**: Clean, formatted text notes.
  - **Audio Player**: Integrated playback player with scrubber, elapsed time, and speed controls (1x, 1.25x, 1.5x, 2x).
  - **Pin to Top**: Keep important items pinned to the top of the dashboard.
- **Background Notification & Alert Engine**:
  - Browser Notification API alerts with a desktop push notification when a reminder is due.
  - Synthesized Web Audio API harmonious chime (C5-E5-G5).
  - In-app interactive alert banner with **Mark Done** and **Snooze** buttons.
- **Search & Filtering**:
  - Filter by category tab: **All**, **Notes**, **Reminders**, **Lists**.
  - Real-time search across titles, contents, tags, and checklist items.
  - Clickable dynamic tag cloud pills (#work, #shopping, #personal, etc.).
- **Secure Custom Session Authentication**:
  - Password hashing with Node.js `crypto.scrypt`.
  - HTTP-only, SameSite secure session cookies.
  - Session records stored in Convex `sessions` table with 30-day expiration.
  - Protected routes redirecting unauthenticated users to `/login`.

---

## Getting Started

### 1. Environment Configuration

Ensure `.env.local` contains your Convex deployment URLs and your OpenAI API key:

```env
CONVEX_DEPLOYMENT=dev:artful-salamander-801
NEXT_PUBLIC_CONVEX_URL=https://artful-salamander-801.ap-southeast-2.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://artful-salamander-801.ap-southeast-2.convex.site

# Add your OpenAI API Key for Whisper speech-to-text & GPT-4o-mini structuring
OPENAI_API_KEY=sk-...
```

### 2. Run the Development Servers

Open two terminal windows:

**Terminal 1: Start Convex synchronization & function watcher**
```bash
npm run convex:dev
```

**Terminal 2: Start the Next.js development server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure

```
├── app/
│   ├── actions/
│   │   └── auth.ts               # Server actions (login, register, logout, getSessionUser)
│   ├── api/
│   │   └── ai/
│   │       └── process/route.ts  # Next.js API route for Whisper & GPT-4o-mini
│   ├── login/page.tsx            # Login page
│   ├── register/page.tsx         # Account creation page
│   ├── layout.tsx                # Root layout with ConvexClientProvider
│   ├── page.tsx                  # Main interactive dashboard
│   └── globals.css
├── components/
│   ├── AudioPlayer.tsx           # Audio playback player with speed and scrubber
│   ├── EditItemDialog.tsx        # Modal for updating existing items
│   ├── FilterBar.tsx             # Category tabs, search input, tag cloud
│   ├── ItemCard.tsx              # Interactive cards for Notes, Reminders, and Lists
│   ├── ItemPreviewDialog.tsx     # Editable preview modal after capture
│   ├── NotificationWatcher.tsx   # Background alert engine with browser notifications & chime
│   ├── SmartCaptureBar.tsx       # Unified text & mic input bar
│   └── WaveformVisualizer.tsx    # Live HTML5 Canvas audio waveform visualizer
├── convex/
│   ├── schema.ts                 # Database schema (users, sessions, items)
│   ├── users.ts                  # User queries & mutations
│   ├── sessions.ts               # Session creation, validation, & deletion
│   ├── items.ts                  # CRUD, checklists, reminders, audio upload endpoints
│   └── health.ts
├── hooks/
│   └── useVoiceRecorder.ts       # Audio recording hook (Pause, Resume, Stop, Waveform Analyser)
└── lib/
    ├── auth-crypto.ts            # Node.js scrypt password hashing & session tokens
    ├── convex-server.ts          # Server-side ConvexHttpClient
    └── session.ts                # HTTP-only cookie handlers
```
