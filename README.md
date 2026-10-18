# ⚡ To-Do on Steroids — AI Voice Taskmaster (PWA)

A voice-first, AI-powered To-Do web application built for Google Chrome. Speak your routine, plans, and task updates naturally. Google Gemini AI automatically extracts new tasks, detects completed tasks, and manages your day without manual typing or checking.

---

## 🌟 Key Features

1. **🎙️ Voice-First AI Input:**
   * Tap the pulsing Microphone button and speak naturally:
     > *"I finished my email and walking task, and I have a new meeting at 10:00 PM with the design team."*
   * Real-time continuous speech-to-text powered by the native **Web Speech API**.
   * Real-time audio waveform visualizer and futuristic sound effects.
   * You can edit or type in the transcription box before sending to AI.

2. **⚡ Gemini AI Action Engine & Approval Modal:**
   * Powered by Google's fastest models: **`gemini-2.5-flash`** / **`gemini-2.0-flash`** via Google AI Studio.
   * **Semantic matching:** Detects when you say you completed an existing task (e.g., *"completed email"* matches *"Send daily project update email"*).
   * **Smart Extraction:** Extracts task titles, scheduled times (e.g. `10:00 PM`), category tags, and priority levels.
   * **Review & Approval Pop-up:** Presents a clean diff of actions. Edit titles or times inline with one click, or approve everything with a single tap.

3. **✨ Fade & Strikethrough Task Styling:**
   * When a task is marked completed, it doesn't abruptly disappear:
   * It gently fades to a soft opacity and gets a dynamic strikethrough cut text, filed under a collapsible **Completed Tasks** section.

4. **📅 Page 2: History & Datewise Archives:**
   * Browse previous days and months.
   * Total tasks, completed tasks, and completion rate analytics.
   * Single-click JSON backup export.

5. **⚙️ Page 3: Settings & Diagnostics:**
   * Secure Google AI Studio API Key input (stored locally only in your browser's local cache).
   * **"Test Key"** connection diagnostic button.
   * Model selector (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`).
   * Speech recognition language selector (`en-US`, `en-GB`, `en-IN`, etc.).
   * Futuristic Web Audio synthesizer sound FX toggle.

6. **📲 Progressive Web App (PWA) Installation:**
   * Install directly from Google Chrome as a desktop app on Windows/Mac or phone app on Android.
   * Appears in your Windows Start Menu, Taskbar, and with your other installed applications with its own custom neon app icon.

---

## 🚀 How to Run

### Method 1: Instant Browser Launch (Zero-install)
Simply open `index.html` directly in **Google Chrome** (or use any local static server like VS Code Live Server).

### Method 2: Vite Dev Server
```bash
npm install
npm run dev
```
Open `http://localhost:3000` in Google Chrome.

---

## 🔑 Getting Your Free Google AI Studio API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Click **"Create API Key"** (100% free, no credit card required).
3. Open **To-Do on Steroids** -> go to **Settings** (or click the **"Add API Key"** badge in the top right).
4. Paste your key and click **"Test Key"** to verify.

---

## 📲 How to Install as an App in Chrome

1. Open the web app in **Google Chrome** (on `http://localhost:3000` or any hosted URL).
2. Click the **"📲 Install App"** button in the header, or click the **Install icon** on the right side of Chrome's address bar.
3. Click **Install**. The app will launch in its own standalone window with its custom app icon on your Windows Desktop and Taskbar!
