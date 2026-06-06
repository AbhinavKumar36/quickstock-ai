import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, isFirebaseInitialized, initializeFirebaseDynamically } from '../firebase';
import { Cpu, Lock, Mail, Shield, AlertTriangle, Key, Check, HelpCircle } from 'lucide-react';

export default function Login({ onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('staff');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Configuration wizard states (if Firebase isn't initialized yet)
  const [wizardConfig, setWizardConfig] = useState({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  });
  const [configRawJson, setConfigRawJson] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!isFirebaseInitialized) {
      setError('Firebase is not initialized. Please configure it below.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        // Sign up
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Save role in Firestore
        await setDoc(doc(db, "users", user.uid), {
          email: user.email,
          role: role,
          createdAt: new Date().toISOString()
        });

        onAuthSuccess(user, role);
      } else {
        // Login
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Fetch role from Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));
        let userRole = 'staff';

        if (userDoc.exists()) {
          userRole = userDoc.data().role || 'staff';
        } else {
          // If no doc exists (fallback), create one as staff
          await setDoc(doc(db, "users", user.uid), {
            email: user.email,
            role: 'staff',
            createdAt: new Date().toISOString()
          });
        }

        if (userRole === 'revoked') {
          await auth.signOut();
          setError('Access Revoked: Your account has been suspended by an Administrator.');
          setLoading(false);
          return;
        }

        onAuthSuccess(user, userRole);
      }
    } catch (err) {
      console.error(err);
      let friendlyMessage = err.message;
      if (err.code === 'auth/user-not-found') friendlyMessage = 'No account found with this email.';
      if (err.code === 'auth/wrong-password') friendlyMessage = 'Incorrect password.';
      if (err.code === 'auth/email-already-in-use') friendlyMessage = 'This email is already registered.';
      if (err.code === 'auth/invalid-email') friendlyMessage = 'Invalid email address.';
      if (err.code === 'auth/weak-password') friendlyMessage = 'Password should be at least 6 characters.';
      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleWizardSubmit = (e) => {
    e.preventDefault();
    
    // Validate config
    if (!wizardConfig.apiKey || !wizardConfig.projectId) {
      setError('At minimum, API Key and Project ID are required.');
      return;
    }

    const success = initializeFirebaseDynamically(wizardConfig);
    if (!success) {
      setError('Failed to save configuration.');
    }
  };

  const parseRawJson = () => {
    try {
      // Look for config object inside the pasted text
      let jsonStr = configRawJson.trim();
      
      // If the user pasted the entire firebaseConfig snippet, try to extract the JSON object
      if (jsonStr.includes('const firebaseConfig = {')) {
        const start = jsonStr.indexOf('{');
        const end = jsonStr.lastIndexOf('}') + 1;
        jsonStr = jsonStr.substring(start, end);
      }
      
      // Clean up JS object keys to be valid JSON (if they aren't quoted)
      // Standard JSON.parse requires quoted keys. This is a simple parser.
      // If it fails, standard parsing is run.
      const cleaned = jsonStr
        .replace(/([{,]\s*)([a-zA-Z0-9]+)(\s*:)/g, '$1"$2"$3')
        .replace(/'/g, '"')
        .replace(/,\s*}/g, '}');

      const parsed = JSON.parse(cleaned);
      
      setWizardConfig({
        apiKey: parsed.apiKey || '',
        authDomain: parsed.authDomain || '',
        projectId: parsed.projectId || '',
        storageBucket: parsed.storageBucket || '',
        messagingSenderId: parsed.messagingSenderId || '',
        appId: parsed.appId || ''
      });
      setError('');
    } catch (err) {
      setError('Could not parse Firebase Configuration. Please check the JSON format or paste key values manually.');
    }
  };

  // If Firebase is NOT initialized, show the Configuration Wizard
  if (!isFirebaseInitialized) {
    return (
      <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col justify-center items-center p-6 font-sans antialiased">
        <div className="w-full max-w-xl bg-[#0B0B0E] border border-zinc-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-[3px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600"></div>
          
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.3)]">
              <Cpu className="h-5 w-5 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">QuickStock</h1>
              <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">Firebase Setup Wizard</p>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6 flex gap-3 text-xs leading-relaxed text-amber-400">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <span className="font-bold">Database Setup Required:</span> Firebase has not been configured. To enable dynamic synchronization and role-based authentication, please input your Firebase project credentials.
            </div>
          </div>

          <form onSubmit={handleWizardSubmit} className="space-y-5">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Paste Config snippet (JSON)</label>
                <button 
                  type="button" 
                  onClick={() => setShowHelp(!showHelp)}
                  className="text-[10px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                >
                  <HelpCircle className="h-3 w-3" /> Help Setup
                </button>
              </div>

              {showHelp && (
                <div className="p-3.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-[11px] text-zinc-300 mb-3 space-y-2">
                  <p className="font-bold text-white">How to get Firebase Credentials:</p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Go to the <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Firebase Console</a> and select your project.</li>
                    <li>Add a Web App under Project Settings to generate configuration variables.</li>
                    <li>Enable **Email/Password authentication** in the Firebase Auth section.</li>
                    <li>Create a **Cloud Firestore database** in test mode or with read/write access.</li>
                    <li>Paste the `firebaseConfig` javascript object here and click "Parse Object", or fill the fields below manually.</li>
                  </ol>
                </div>
              )}

              <div className="flex gap-2">
                <textarea 
                  placeholder="const firebaseConfig = {&#10;  apiKey: '...',&#10;  authDomain: '...',&#10;  projectId: '...'&#10;};"
                  value={configRawJson}
                  onChange={(e) => setConfigRawJson(e.target.value)}
                  className="flex-1 bg-[#121217] border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-blue-500 min-h-[80px]"
                />
                <button 
                  type="button" 
                  onClick={parseRawJson}
                  className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
                >
                  Parse JSON
                </button>
              </div>
            </div>

            <div className="text-zinc-500 border-t border-zinc-800/80 my-3"></div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">API Key *</label>
                <input 
                  type="text" 
                  placeholder="AIzaSy..." 
                  value={wizardConfig.apiKey}
                  onChange={(e) => setWizardConfig({ ...wizardConfig, apiKey: e.target.value })}
                  className="w-full bg-[#121217] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Project ID *</label>
                <input 
                  type="text" 
                  placeholder="quickstock-123" 
                  value={wizardConfig.projectId}
                  onChange={(e) => setWizardConfig({ ...wizardConfig, projectId: e.target.value })}
                  className="w-full bg-[#121217] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Auth Domain</label>
                <input 
                  type="text" 
                  placeholder="quickstock.firebaseapp.com" 
                  value={wizardConfig.authDomain}
                  onChange={(e) => setWizardConfig({ ...wizardConfig, authDomain: e.target.value })}
                  className="w-full bg-[#121217] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">App ID</label>
                <input 
                  type="text" 
                  placeholder="1:1234:web:abcd" 
                  value={wizardConfig.appId}
                  onChange={(e) => setWizardConfig({ ...wizardConfig, appId: e.target.value })}
                  className="w-full bg-[#121217] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl font-medium">
                {error}
              </div>
            )}

            <button 
              type="submit" 
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-xs font-bold text-white rounded-lg shadow-lg"
            >
              Save Configuration and Initialize
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Firebase IS configured, show authentication form
  return (
    <div className="min-h-screen bg-[#06070a] text-zinc-100 flex flex-col md:flex-row font-sans antialiased w-full relative overflow-hidden">
      
      {/* Ambient glowing backdrops */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[150px] pointer-events-none"></div>

      {/* ================= LEFT SIDE: CORPORATE BRAND SHOWCASE (Canva Banner) ================= */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden flex-col justify-between p-12">
        {/* Background Image Banner */}
        <img 
          src="./banner.jpg" 
          alt="QuickStock Portal Banner" 
          className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 hover:scale-105"
        />
        {/* High-quality dark blur gradient overlay to blend with dark mode */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#06070a] via-[#06070a]/70 to-transparent"></div>
        
        {/* Header Brand Badge */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="h-9 w-9 bg-black/40 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/10 shadow-lg">
            <img src="./logo.png" alt="QuickStock Logo" className="h-6 w-6 object-contain rounded" />
          </div>
          <span className="text-sm font-extrabold tracking-widest text-white uppercase font-mono bg-black/20 px-2.5 py-0.5 rounded">QuickStock</span>
        </div>

        {/* Corporate Message */}
        <div className="mt-auto relative z-10 max-w-md bg-black/45 backdrop-blur-lg border border-white/10 rounded-2xl p-6 shadow-2xl transition-all duration-300 hover:border-blue-500/30">
          <span className="text-[10px] text-blue-400 font-extrabold uppercase tracking-widest bg-blue-500/10 px-2 py-1 rounded">Control Center</span>
          <h2 className="text-xl font-bold text-white mt-3 leading-snug">
            Cognitive Inventory & Dynamic Logistics
          </h2>
          <p className="text-xs text-zinc-300 mt-2 leading-relaxed">
            Predictive Holt-Winters demand velocity forecasting, safety thresholds, and automated B2B procurement pipelines.
          </p>
        </div>
      </div>

      {/* ================= RIGHT SIDE: CANVA-STYLE AUTH CONTAINER ================= */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 relative z-10 bg-[#0B0B0E]/30 backdrop-blur-sm">
        
        <div className="w-full max-w-[420px] flex flex-col">
          {/* Centered Brand Icon */}
          <div className="flex flex-col items-center mb-6">
            <img 
              src="./logo.png" 
              alt="QuickStock Logo" 
              className="h-16 w-16 object-contain mb-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-zinc-800/80" 
            />
            <h1 className="text-2xl font-bold text-white tracking-tight text-center">
              {isSignUp ? 'Create account in seconds' : 'Log in to your workspace'}
            </h1>
            <p className="text-xs text-zinc-400 mt-1.5 text-center leading-relaxed max-w-[320px]">
              Use your corporate credentials to sync with the warehouse telemetry network.
            </p>
          </div>

          <div className="bg-[#0B0B0E]/60 border border-zinc-850/80 backdrop-blur-md rounded-[28px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.4)] relative overflow-hidden transition-all duration-300">
            {/* Top border accent line */}
            <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

            <form onSubmit={handleAuth} className="space-y-4">
              
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5 ml-1">Corporate Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                  <input 
                    type="email" 
                    placeholder="name@quickstock.ai" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#121217]/95 text-xs text-zinc-200 pl-11 pr-4 py-3 rounded-xl border border-zinc-800/80 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5 ml-1">Security Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                  <input 
                    type="password" 
                    placeholder="••••••••" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#121217]/95 text-xs text-zinc-200 pl-11 pr-4 py-3 rounded-xl border border-zinc-800/80 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
                    required
                  />
                </div>
              </div>

              {isSignUp && (
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5 ml-1">Access Role Profile</label>
                  <div className="relative">
                    <Shield className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                    <select 
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full bg-[#121217]/95 text-xs text-zinc-200 pl-11 pr-4 py-3 rounded-xl border border-zinc-800/80 focus:outline-none focus:border-indigo-500 cursor-pointer font-sans"
                    >
                      <option value="staff" className="bg-zinc-950 text-zinc-200 font-semibold">Staff Operations Profile</option>
                      <option value="admin" className="bg-zinc-950 text-zinc-200 font-semibold">System Administrator (Admin)</option>
                    </select>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl font-medium">
                  {error}
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:brightness-110 text-xs font-bold text-white rounded-xl shadow-lg transition-all transform active:scale-98 disabled:opacity-50 mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                    Authorizing Profile...
                  </span>
                ) : isSignUp ? (
                  'Sign Up'
                ) : (
                  'Log In'
                )}
              </button>
            </form>

            <div className="mt-6 text-center text-xs">
              <span className="text-zinc-500">
                {isSignUp ? 'Already have an account?' : 'Need operational access?'}
              </span>{' '}
              <button 
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError('');
                }}
                className="text-indigo-400 hover:text-indigo-300 font-bold ml-1 transition-colors"
              >
                {isSignUp ? 'Log in' : 'Sign up'}
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-zinc-800/60 text-[10px] text-zinc-500 text-center leading-relaxed">
              Standard operations feature read-only dashboards, while Admin profiles maintain procurement actions.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
