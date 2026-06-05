import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Helper to get Firebase configuration
export const getFirebaseConfig = () => {
  // Try environment variables first
  const envConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  const isEnvValid = envConfig.apiKey && envConfig.projectId;

  if (isEnvValid) {
    return envConfig;
  }

  // Fall back to localStorage overrides
  try {
    const saved = localStorage.getItem("quickstock_firebase_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Failed to load saved Firebase config", e);
  }

  return null;
};

// Check if configuration exists
const config = getFirebaseConfig();

let app;
let auth;
let db;
let isFirebaseInitialized = false;

if (config) {
  try {
    app = getApps().length === 0 ? initializeApp(config) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseInitialized = true;
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
}

export { app, auth, db, isFirebaseInitialized };

// Helper function to initialize Firebase dynamically at runtime (e.g. from the settings modal)
export const initializeFirebaseDynamically = (newConfig) => {
  try {
    localStorage.setItem("quickstock_firebase_config", JSON.stringify(newConfig));
    // Reload page to apply changes and clean up previous instances
    window.location.reload();
    return true;
  } catch (error) {
    console.error("Failed to save new configuration:", error);
    return false;
  }
};

// Helper to clear configuration
export const clearFirebaseConfig = () => {
  localStorage.removeItem("quickstock_firebase_config");
  window.location.reload();
};
