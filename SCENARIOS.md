# Auto-Save & Concurrency Scenarios Documentation

This project demonstrates how to handle common data persistence challenges in modern web applications. Below are the documented scenarios implemented in this demo.

---

## 🏗️ 1. Standard Auto-Save (Success)
**Goal:** Persist user changes automatically without a manual "Save" button, while minimizing server load.

### How it works:
- **Reactive Stream:** We subscribe to `form.valueChanges`.
- **Debouncing:** `debounceTime(1000)` waits for the user to stop typing for 1 second before triggering a save.
- **De-duplication:** `distinctUntilChanged` ensures we don't save if the form value is identical to the last emitted value.
- **Cancellation:** `switchMap` cancels any pending (in-flight) save requests if a new one starts, ensuring only the latest data is finalized.

### UI Feedback:
- Status bar shows `⏳ SAVING` during the request.
- Status bar shows `✅ SAVED` with a timestamp upon success.

---

## ⚔️ 2. Concurrency Conflict (Optimistic Locking)
**Goal:** Prevent data loss when two different sessions edit the same document simultaneously.

### The Problem:
Alice and Bob both open the same document (v1). Alice saves her changes (server becomes v2). Bob then tries to save his changes. If Bob succeeds, he will silently overwrite Alice's work.

### The Solution:
- **Versioning:** Every document has a version number.
- **Validation:** When saving, the client sends its known version (e.g., `v1`).
- **Rejection:** The server (simulated in `StorageService`) checks if the client version matches the current server version. If not, it returns a `409 Conflict`.

### UI Resolution:
The user is presented with two options:
1. **Reload Server Data:** Discard local changes and pull the latest version from the server.
2. **Overwrite Server:** Force the local changes to be saved by adopting the latest server version and pushing again.

---

## 💻 3. Different Computer Sync (.NET Minimal API)
**Goal:** Synchronize data across different devices using a central "Source of Truth."

### How it works:
- **Backend:** We've moved the storage from the browser to a real **.NET 10 Minimal API**.
- **Source of Truth:** The API (running on port 5202) holds the current `Document` and its `Version` in static memory.
- **Persistence:** Even if you open the app on a tablet, a phone, and a laptop, they all talk to the same API.
- **Global Concurrency:** If your Laptop saves v1, your Desktop (still on v1) will receive a `409 Conflict` from the server when it tries to save, even though it's on a different machine!

---

## 🌐 4. Same-Browser Tab Sync (Events)
**Goal:** Keep same-computer tabs in sync without extra server calls.

### How it works:
- **Storage Event:** When one tab successfully saves to the API, it also sets a small "trigger" key in `localStorage`.
- **Listener:** All other open tabs in the same browser hear this event and immediately trigger a `GET` request to the .NET API to refresh their local state to the latest version.

---

## 📵 4. Lost Internet (Offline Handling)
**Goal:** Gracefully handle network failures so the user doesn't lose data or get stuck.

### How it works:
- **Simulation:** You can click **"Cut Internet"** in the simulation controls.
- **Error Detection:** The RxJS pipeline catches the network error.
- **State Preservation:** The status bar changes to `📶❌ OFFLINE`. The form remains interactive, but the data is not yet on the server.

### UI Recovery:
- A pulsing **"Try Re-Sync"** button appears.
- Once the user clicks **"Restore Internet"**, they can click **"Try Re-Sync"** to push their pending changes to the server.
- The app will then either succeed or trigger a conflict (if a remote change happened while they were offline).

---

## 🛠️ How to Test These Scenarios

1. **Success:** Type in the title box. Wait 1 second. Watch the status bar.
2. **Conflict:** 
   - Type something in the form.
   - Click **"Simulate Stakeholder Change"** (this bumps the server version behind your back).
   - Type something else.
   - Observe the `⚠️ CONFLICT` status and choose a resolution.
3. **Offline:**
   - Click **"Cut Internet"**.
   - Type in the form. Observe `📶❌ OFFLINE`.
   - Click **"Restore Internet"**.
   - Click **"Try Re-Sync"**.
