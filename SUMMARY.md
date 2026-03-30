# Project Summary: Full-Stack Auto-Save Platform

A production-grade **Multi-Document Auto-Save Platform** with **Real-Time Collaboration**, **Document Locking**, and **Optimistic Concurrency Control**. Built with Angular 18 and .NET Minimal API, connected via REST and **SignalR WebSockets** for instant push updates.

## 🚀 Key Features & Code Map

### 💾 Core Persistence
- **Multi-Document CRUD:** Create, read, update, and delete multiple documents.
  - 📂 **Logic:** [api/AutoSaveApi/Program.cs](api/AutoSaveApi/Program.cs) (Backend Endpoints) | [src/app/storage.service.ts](src/app/storage.service.ts) (Frontend Client)
- **Intelligent Auto-Save:** RxJS `debounceTime` and `switchMap` pattern.
  - 📂 **Logic:** [src/app/pages/edit/edit.component.ts](src/app/pages/edit/edit.component.ts)
- **Optimistic Locking (Versioning):** Version-tracking to detect concurrency conflicts (409).
  - 📂 **Logic:** [api/AutoSaveApi/Program.cs](api/AutoSaveApi/Program.cs) (Version increments) | [src/app/pages/edit/edit.component.ts](src/app/pages/edit/edit.component.ts) (Conflict resolution UI)

### 🔒 Collaboration & Locking
- **Heartbeat Document Locking:** 30s heartbeat to maintain document ownership.
  - 📂 **Logic:** [api/AutoSaveApi/Program.cs](api/AutoSaveApi/Program.cs) (Lock timeout logic) | [src/app/pages/edit/edit.component.ts](src/app/pages/edit/edit.component.ts) (RxJS heartbeat interval)
- **Instant Unlock:** Explicit lock release on navigation or logout.
  - 📂 **Logic:** [src/app/pages/edit/edit.component.ts](src/app/pages/edit/edit.component.ts) (`ngOnDestroy`)
- **Deletion Protection:** Server-side enforcement (423 Locked) and UI-side disabling.
  - 📂 **Logic:** [src/app/pages/list/list.component.ts](src/app/pages/list/list.component.ts) (Disabled delete button & alerts)

### ⚡ Real-Time Sync (SignalR)
- **Push Updates:** Instant broadcasts of all document/lock changes.
  - 📂 **Logic:** [api/AutoSaveApi/Program.cs](api/AutoSaveApi/Program.cs) (`IHubContext` broadcasts) | [src/app/signalr.service.ts](src/app/signalr.service.ts) (WebSocket Hub client)
- **Zero-Latency Dashboard:** Real-time list updates without polling.
  - 📂 **Logic:** [src/app/pages/list/list.component.ts](src/app/pages/list/list.component.ts) (SignalR merge subscription)

### 👤 Auth & Security
- **Mock OIDC Authentication:** Multi-user selector (Demo, Alice, Bob).
  - 📂 **Logic:** [src/app/auth.service.ts](src/app/auth.service.ts) | [src/app/app.component.ts](src/app/app.component.ts) (User selector)

---

## 🛠 Tech Stack
- **Frontend:** Angular 18.1 (Standalone, Signals, Reactive Forms, RxJS).
- **Backend:** .NET Minimal API (C#).
- **Real-Time:** ASP.NET Core SignalR.
- **Infrastructure:** Docker (multi-stage builds).

## 📂 Project Directory Guide

### Frontend (`/src`)
- [src/app/storage.service.ts](src/app/storage.service.ts) — API client, version tracking, heartbeat client.
- [src/app/signalr.service.ts](src/app/signalr.service.ts) — SignalR Hub connection & event broadcasting.
- [src/app/auth.service.ts](src/app/auth.service.ts) — Mock authentication provider.
- [src/app/pages/list/list.component.ts](src/app/pages/list/list.component.ts) — Dashboard components.
- [src/app/pages/edit/edit.component.ts](src/app/pages/edit/edit.component.ts) — Editor components.
- [src/app/app.component.ts](src/app/app.component.ts) — Shared shell and mock user login selection.

### Backend (`/api/AutoSaveApi`)
- [api/AutoSaveApi/Program.cs](api/AutoSaveApi/Program.cs) — The entire API: CRUD, SignalR Hub, Locking engine, and Memory Store.
- [api/AutoSaveApi/Dockerfile](api/AutoSaveApi/Dockerfile) — Deployment & Build instructions.

## ☁️ Deployment Status
- **Source Control:** Successfully pushed to [GitHub](https://github.com/smoothjjuu/auto-save.git).
- **Hosting Strategy:** Prepared for Render (Static Site + Web Service).
