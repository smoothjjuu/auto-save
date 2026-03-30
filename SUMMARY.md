# Project Summary: Full-Stack Auto-Save Demo

This project is a high-performance demonstration of a real-world **Auto-Save System** with **Concurrency Control**. It features a modern Angular frontend communicating with a .NET Minimal API backend.

## 🚀 Key Features
- **Intelligent Auto-Save:** Automatically persists user input to the server using RxJS debouncing to minimize unnecessary API calls.
- **Optimistic Locking (Concurrency):** Uses a version-tracking system to detect when multiple users/tabs edit the same document. If a version mismatch occurs, the server returns a `409 Conflict`, and the UI prompts the user to sync.
- **Cloud-Ready:** Pre-configured with Docker support and environment variables for 100% free hosting (e.g., Render/Azure).
- **Offline Simulation:** Includes built-in toggles to simulate network failures and test error-handling robustness.

## 🛠 Tech Stack
- **Frontend:** Angular 18 (Signals, HttpClient, Reactive Forms).
- **Backend:** .NET 8 Minimal API (C#).
- **Communication:** REST API with JSON payloads.
- **Infrastructure:** Docker (multi-stage builds).

## 📂 Project Structure
- `/src`: The **Angular** frontend codebase.
  - `app/storage.service.ts`: Core logic for API calls and state management.
  - `app/app.component.ts`: The main form and concurrency UI logic.
- `/api/AutoSaveApi`: The **.NET** backend codebase.
  - `Program.cs`: Implementation of the Minimal API, CORS, and Port handling.
- `README.md`: The original development instructions.
- `Dockerfile`: Deployment instructions for the backend.

## ☁️ Deployment Status
- **Source Control:** Successfully pushed to [GitHub](https://github.com/smoothjjuu/auto-save.git).
- **Hosting Strategy:** Prepared for Render (Static Site + Web Service).
