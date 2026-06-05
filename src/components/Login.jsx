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
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col justify-center items-center p-6 font-sans antialiased">
      
      {/* Background radial gradients for wow aesthetics */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-[#0B0B0E]/80 border border-zinc-800/80 backdrop-blur-md rounded-2xl p-8 shadow-[0_15px_35px_rgba(0,0,0,0.4)] relative overflow-hidden">
        {/* Colorful top border accent */}
        <div className="absolute top-0 right-0 left-0 h-[3px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600"></div>

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.3)]">
            <Cpu className="h-5 w-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">QuickStock</h1>
            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Enterprise Logistics Portal</p>
          </div>
        </div>

        <h2 className="text-base font-bold text-white text-center mb-6">
          {isSignUp ? 'Create Corporate Account' : 'Secure System Sign In'}
        </h2>

        <form onSubmit={handleAuth} className="space-y-4">
          
          <div>
            <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input 
                type="email" 
                placeholder="julien.deaux@quickstock.ai" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#121217] text-xs text-zinc-200 pl-10 pr-4 py-2 rounded-lg border border-zinc-800 focus:outline-none focus:border-blue-500 transition-colors"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#121217] text-xs text-zinc-200 pl-10 pr-4 py-2 rounded-lg border border-zinc-800 focus:outline-none focus:border-blue-500 transition-colors"
                required
              />
            </div>
          </div>

          {isSignUp && (
            <div>
              <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Access Role Profile</label>
              <div className="relative">
                <Shield className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <select 
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-[#121217] text-xs text-zinc-200 pl-10 pr-4 py-2 rounded-lg border border-zinc-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="staff">Staff Operations Profile</option>
                  <option value="admin">System Administrator (Admin)</option>
                </select>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl font-medium">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-xs font-bold text-white rounded-lg shadow-lg transition-all transform active:scale-98 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                Processing Authorization...
              </span>
            ) : isSignUp ? (
              'Sign Up and Assign Role'
            ) : (
              'Verify Credentials and Enter'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs">
          <span className="text-zinc-500">
            {isSignUp ? 'Already have an authorized account?' : 'Need operational authorization?'}
          </span>{' '}
          <button 
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-blue-400 hover:text-blue-300 font-bold ml-1 transition-colors"
          >
            {isSignUp ? 'Sign In' : 'Request Profile Access'}
          </button>
        </div>

        {/* Debug credentials notice */}
        <div className="mt-8 pt-4 border-t border-zinc-800/80 text-[10px] text-zinc-500 text-center leading-relaxed">
          Admin profiles can write and procure orders. Staff profiles have read-only monitoring dashboards.
        </div>
      </div>
    </div>
  );
}
