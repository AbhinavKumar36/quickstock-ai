# QuickStock — Enterprise Realtime Logistics Control Center

QuickStock is a premium, real-time B2B SaaS logistics platform designed to optimize supply chain inventory operations. The platform integrates triple-exponential smoothing forecasts (Holt-Winters), interactive AI assistants, role-based controls, and instant database synchronization.

---

## Key Features

### 1. Real-time Database Synchronization
* Powered by **Cloud Firestore** for zero-latency, real-time updates across inventory catalogs, system logs, notifications, and user authorization updates.
* Instant floor catalog updates upon purchase order confirmations or stock additions.

### 2. Role-Based Access Control (RBAC)
* **System Administrators (Admin)**:
  - Full write credentials to create, modify, or delete catalog SKUs.
  - Access to dispatch automated Purchase Orders (PO) and trigger manufacturer communication builders.
  - Ability to simulate supplier volatility stress tests.
  - Full access to the **Corporate User Access Registry** to provision new accounts or suspend (revoke) existing access profiles.
* **Staff Members (Staff)**:
  - Clean, read-only monitoring dashboards.
  - All write and configuration controls (sliders, registries, buttons) are completely hidden from the user interface.

### 3. Normal vs. Pro Tier Gating
* Gated premium AI systems: **Holt-Winters Smoothing Engine**, **Interactive AI Copilot**, **B2B Email Writers**, and **Imagen Graphic Promo Banners** are restricted to Pro Tier warehouses.
* Dynamic, warehouse-specific tier check triggers an **Enterprise Pro Upgrade** paywall modal in real time.

### 4. Advanced AI & Holt-Winters Engine
* Real-time 12-month forecasting models using Alpha (level), Beta (trend), and Gamma (seasonality) smoothing parameters.
* **AI Copilot (Gemini 2.5 Flash)**: Floating chatbot widget that performs safety audits, dynamic run-rate analytics, and provides logistical advice.
* **B2B Supplier Communications**: Auto-drafts authoritative replenishment emails for low-stock lines.
* **Imagen Marketing Suite**: Automatically compiles promotional ad banners to liquidate dead stock.

### 5. Instant Account Suspension & Revocation
* Suspending a profile (role set to `revoked` in Firestore) immediately terminates their active session in real-time and permanently blocks sign-in.

### 6. Localized Currency
* Native support for Indian Rupees (`₹`) using Indian grouping format (`en-IN`) across all capital valuations and run-rate bounds.

---

## Tech Stack
* **Frontend**: React + Vite (HMR enabled)
* **Styling**: Vanilla CSS (Sleek dark-mode, custom glassmorphism grids, and smooth micro-animations)
* **Database & Auth**: Google Firebase (Firestore and Firebase Auth)
* **LLM Core**: Google Gemini API (`gemini-2.5-flash` / `imagen-3.0-generate-002`)

---

## Quick Start Guide

### Prerequisites
* Node.js (v18 or higher)
* A Google Firebase Project with **Firestore** and **Email/Password Authentication** enabled.
* A Google Gemini API Key from Google AI Studio.

### Installation & Run

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```

3. Open the application at `http://localhost:5173`.
4. Fill out the Firebase configuration parameters in the setup wizard on first load to initialize connection nodes.
5. Create your initial Admin user profile through the authentication screen to seed the default mock datasets.
