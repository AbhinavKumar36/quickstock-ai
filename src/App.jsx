import React, { useState, useMemo, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  TrendingUp, 
  Cpu, 
  Settings, 
  Search, 
  Bell, 
  AlertTriangle, 
  ArrowUpRight, 
  MessageSquare, 
  Send, 
  X, 
  Check, 
  RefreshCw, 
  Sparkles, 
  Filter, 
  Plus, 
  Trash2, 
  Database,
  Clock,
  Globe,
  Sliders,
  Download,
  Terminal,
  CreditCard,
  Lock,
  ChevronRight,
  Printer,
  ChevronDown,
  Mail,
  Flame,
  Image as ImageIcon,
  Activity,
  FileText,
  Sun,
  Moon,
  Users
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  ReferenceLine,
  LineChart,
  Line,
  Legend,
  CartesianGrid
} from 'recharts';

import { 
  doc, 
  updateDoc, 
  setDoc, 
  deleteDoc, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit, 
  increment, 
  getDocs, 
  writeBatch 
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';

import { auth, db, isFirebaseInitialized, clearFirebaseConfig, getFirebaseConfig } from './firebase';
import { initializeApp } from 'firebase/app';
import { getAuth as getAuthSecondary, createUserWithEmailAndPassword } from 'firebase/auth';
import { seedDatabaseIfEmpty } from './seeder';
import Login from './components/Login';

// Z-Score helper for safety stock
const calculateSafetyStock = (dailyDemand, demandStdDev, avgLeadTime, leadTimeStdDev, serviceLevel = 0.95) => {
  const zScores = { 0.90: 1.28, 0.95: 1.65, 0.99: 2.33 };
  const Z = zScores[serviceLevel] || 1.65;
  
  const leadTimeTerm = avgLeadTime * Math.pow(demandStdDev, 2);
  const demandTerm = Math.pow(dailyDemand, 2) * Math.pow(leadTimeStdDev, 2);
  
  const calculated = Z * Math.sqrt(leadTimeTerm + demandTerm);
  return Math.max(Math.round(calculated), 5); 
};

// API call helper
const fetchWithRetry = async (url, options, retries = 3, delay = 1000) => {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      if (response.status === 429 && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, options, retries - 1, delay * 2);
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    throw error;
  }
};

export default function App() {
  // Theme Management (Light/Dark mode)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "dark";
  });

  useEffect(() => {
    localStorage.setItem("theme", theme);
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  // Authentication states
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState('staff'); // 'admin' or 'staff'
  const [authChecking, setAuthChecking] = useState(true);
  const [newUsrEmail, setNewUsrEmail] = useState('');
  const [newUsrPassword, setNewUsrPassword] = useState('');
  const [newUsrRole, setNewUsrRole] = useState('staff');
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Firestore Realtime States
  const [warehouses, setWarehouses] = useState({});
  const [inventory, setInventory] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [userProfiles, setUserProfiles] = useState([]);

  // UI States
  const [activeWarehouseKey, setActiveWarehouseKey] = useState('newark');
  const [activeTab, setActiveTab] = useState('Dashboard');

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [toasts, setToasts] = useState([]);

  // API configurations
  const [geminiKey, setGeminiKey] = useState(() => {
    return import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem("quickstock_gemini_key") || "";
  });
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showPOExportModal, setShowPOExportModal] = useState(false);
  const [activePOData, setActivePOData] = useState(null);
  const [commandSearch, setCommandSearch] = useState('');
  
  // Advanced AI states
  const [draftingProduct, setDraftingProduct] = useState(null);
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);

  const [generatingPromoItem, setGeneratingPromoItem] = useState(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [promoImageResult, setPromoImageResult] = useState('');
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [customPromoStyle, setCustomPromoStyle] = useState('modern product advertisement, photorealistic studio lighting, dark gradient backdrop');

  const [newProduct, setNewProduct] = useState({
    name: '', sku: '', category: 'Electronics', stock: '', maxStock: '', price: '', dailyDemand: '2.5', demandStdDev: '0.8'
  });

  const [chatMessages, setChatMessages] = useState([
    { sender: 'ai', text: "Welcome! I am the Live QuickStock Gemini Engine. Ask me anything about stock optimization, demand spikes, or dynamic safety stock models.", time: "10:43 PM" }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [isStressTesting, setIsStressTesting] = useState(false);
  // Dynamic derived values from state
  const currentWarehouse = useMemo(() => {
    return warehouses[activeWarehouseKey] || {
      name: "Loading...",
      location: "Loading...",
      leadTimeDays: 7,
      leadTimeStdDev: 1.2,
      targetServiceLevel: 0.95,
      deadStockThresholdDays: 90,
      hwAlpha: 0.20,
      hwBeta: 0.10,
      hwGamma: 0.30,
      isPro: true
    };
  }, [warehouses, activeWarehouseKey]);

  const targetServiceLevel = currentWarehouse.targetServiceLevel;
  const deadStockThresholdDays = currentWarehouse.deadStockThresholdDays;
  const hwAlpha = currentWarehouse.hwAlpha;
  const hwBeta = currentWarehouse.hwBeta;
  const hwGamma = currentWarehouse.hwGamma;
  const isPro = currentWarehouse.isPro !== false; // defaults to true if not specified

  // Manage Firebase Authentication State
  useEffect(() => {
    if (!isFirebaseInitialized) {
      setAuthChecking(false);
      return;
    }

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUser(user);
        
        // Listen for user role dynamics
        onSnapshot(doc(db, "users", user.uid), (docVal) => {
          if (docVal.exists()) {
            const currentRole = docVal.data().role || 'staff';
            if (currentRole === 'revoked') {
              signOut(auth);
              setCurrentUser(null);
              setUserRole('staff');
              showToast("Access Revoked: Your account has been suspended by an Administrator.", "error");
            } else {
              setUserRole(currentRole);
            }
          } else {
            setUserRole('staff');
          }
        });
        
        // Seed database if empty
        await seedDatabaseIfEmpty(db);
      } else {
        setCurrentUser(null);
        setUserRole('staff');
      }
      setAuthChecking(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAuthSuccess = (user, role) => {
    setCurrentUser(user);
    setUserRole(role);
  };

  // Pro Gating redirection: if standard mode becomes active, kick them out of AI Insights tab
  useEffect(() => {
    if (!isPro && activeTab === 'AI Insights') {
      setActiveTab('Dashboard');
      setShowPaywallModal(true);
    }
  }, [isPro, activeTab]);

  const handleSignOut = () => {
    signOut(auth).then(() => {
      setCurrentUser(null);
      showToast("Signed out securely.", "info");
    });
  };

  const isAdmin = useMemo(() => userRole === 'admin', [userRole]);

  // Realtime Database Subscriptions (Firestore)
  useEffect(() => {
    if (!db || !currentUser) return;

    // Listen to warehouses
    const unsubscribeWarehouses = onSnapshot(collection(db, "warehouses"), (snapshot) => {
      const whs = {};
      snapshot.forEach((doc) => {
        whs[doc.id] = { id: doc.id, ...doc.data() };
      });
      setWarehouses(whs);
    });

    return () => unsubscribeWarehouses();
  }, [currentUser]);

  // Listen to active warehouse inventory
  useEffect(() => {
    if (!db || !currentUser || !activeWarehouseKey) return;

    const inventoryQuery = query(
      collection(db, "inventory"), 
      where("warehouseId", "==", activeWarehouseKey)
    );

    const unsubscribeInventory = onSnapshot(inventoryQuery, (snapshot) => {
      const items = [];
      snapshot.forEach((doc) => {
        items.push({ docId: doc.id, ...doc.data() });
      });
      // Sort to keep consistent order
      items.sort((a, b) => a.name.localeCompare(b.name));
      setInventory(items);
    });

    return () => unsubscribeInventory();
  }, [currentUser, activeWarehouseKey]);

  // Listen to notifications
  useEffect(() => {
    if (!db || !currentUser) return;

    const notifQuery = query(
      collection(db, "notifications"), 
      orderBy("createdAt", "desc"), 
      limit(15)
    );

    const unsubscribeNotifs = onSnapshot(notifQuery, (snapshot) => {
      const items = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      setNotifications(items);
    });

    return () => unsubscribeNotifs();
  }, [currentUser]);

  // Listen to system logs
  useEffect(() => {
    if (!db || !currentUser) return;

    const logsQuery = query(
      collection(db, "logs"), 
      orderBy("createdAt", "desc"), 
      limit(25)
    );

    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
      const items = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      // Sort ascending so latest is rendered last
      items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      setSystemLogs(items);
    });

    return () => unsubscribeLogs();
  }, [currentUser]);

  // Listen to all corporate users (Admin Only)
  useEffect(() => {
    if (!db || !currentUser || !isAdmin) {
      setUserProfiles([]);
      return;
    }

    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const profiles = [];
      snapshot.forEach((doc) => {
        profiles.push({ uid: doc.id, ...doc.data() });
      });
      setUserProfiles(profiles);
    });

    return () => unsubscribeUsers();
  }, [currentUser, isAdmin]);

  const addLog = async (text, type = "info") => {
    if (!db) return;
    try {
      await addDoc(collection(db, "logs"), {
        text,
        type,
        timestamp: new Date().toTimeString().split(' ')[0],
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Failed to add log:", err);
    }
  };

  const recommends = useMemo(() => {
    if (!inventory.length) return [];
    return inventory
      .filter(item => {
        const safetyStock = calculateSafetyStock(
          item.dailyDemand, 
          item.demandStdDev, 
          currentWarehouse.leadTimeDays, 
          currentWarehouse.leadTimeStdDev, 
          targetServiceLevel
        );
        return item.stock <= safetyStock;
      })
      .map(item => {
        const calculatedForecast = Math.round(item.dailyDemand * 30 * 1.15); 
        const recommendedQty = Math.round(calculatedForecast - item.stock);
        return {
          id: `rec-${item.sku}`,
          sku: item.sku,
          name: item.name,
          currentStock: item.stock,
          predictedSales: calculatedForecast,
          recommendQty: recommendedQty > 0 ? recommendedQty : 30,
          status: 'Pending'
        };
      });
  }, [inventory, currentWarehouse, targetServiceLevel]);

  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const metrics = useMemo(() => {
    const totalProducts = inventory.length;
    
    const lowStockAlerts = inventory.filter(item => {
      const computedSS = calculateSafetyStock(
        item.dailyDemand, 
        item.demandStdDev, 
        currentWarehouse.leadTimeDays, 
        currentWarehouse.leadTimeStdDev, 
        targetServiceLevel
      );
      return item.stock <= computedSS;
    }).length;

    const totalValue = inventory.reduce((acc, curr) => acc + (curr.stock * curr.price), 0);
    const insightsGenerated = recommends.length + (isPro ? 44 : 0); // only show premium insights if pro active
    
    return {
      totalProducts,
      lowStockAlerts,
      totalValue: totalValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }),
      insightsGenerated
    };
  }, [inventory, currentWarehouse, targetServiceLevel, recommends, isPro]);

  // Sales by Category density logic
  const salesByProductCategory = useMemo(() => {
    const baseSales = {
      'Electronics': 24000 * 80,
      'Smart Home': 18000 * 80,
      'Networking': 15000 * 80,
      'Accessories': 9000 * 80,
      'Wearables': 12000 * 80
    };
    return Object.keys(baseSales).map(categoryName => {
      const multiplyFactor = activeWarehouseKey === 'frankfurt' ? 1.4 : activeWarehouseKey === 'la_east' ? 0.9 : 1.15;
      const count = inventory.filter(i => i.category === categoryName).length;
      return {
        category: categoryName,
        Sales: Math.round(baseSales[categoryName] * multiplyFactor + (count * 620 * 80))
      };
    });
  }, [inventory, activeWarehouseKey]);

  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            item.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [inventory, searchQuery, categoryFilter]);

  const calculatedForecastData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const seasons = [1.1, 0.9, 0.85, 0.95, 1.05, 1.15, 1.25, 1.2, 1.0, 0.9, 1.1, 1.3];
    
    let baseLevel = 100 * 80;
    let trend = 2.4 * 80;
    
    // Simulate real Holt-Winters recursive smoothing over 8 historic periods
    let level = baseLevel;
    let bTrend = trend;
    let smoothedHistory = [];

    for (let i = 0; i < 8; i++) {
      const monthIdx = (i + 4) % 12;
      const observed = (baseLevel + i * trend) * seasons[monthIdx];
      // Recursive formulas
      level = hwAlpha * (observed / seasons[monthIdx]) + (1 - hwAlpha) * (level + bTrend);
      bTrend = hwBeta * (level - level) + (1 - hwBeta) * bTrend;
      smoothedHistory.push({
        month: months[monthIdx],
        historical: Math.round(observed),
        forecast: null
      });
    }

    // Predict 4 months forward with live coefficients
    let forecastData = [...smoothedHistory];
    for (let m = 1; m <= 4; m++) {
      const forecastMonthIdx = (11 + m) % 12;
      const predictedValue = Math.round((level + m * bTrend) * seasons[forecastMonthIdx] * (1 + (hwGamma * 0.1)));
      forecastData.push({
        month: `${months[forecastMonthIdx]} (F)`,
        historical: null,
        forecast: predictedValue
      });
    }
    return forecastData;
  }, [hwAlpha, hwBeta, hwGamma]);

  const handleFeatureAccess = (tabName) => {
    if ((tabName === 'AI Insights') && !isPro) {
      setShowPaywallModal(true);
      return false;
    }
    setActiveTab(tabName);
    return true;
  };

  // Stress test simulator (restricted to Admin)
  const handleStressTest = async () => {
    if (!isAdmin) {
      showToast("Access Denied: Admin authorization required to simulate supply stress.", "error");
      return;
    }

    setIsStressTesting(true);
    await addLog("Warning: Initiating stress testing protocols... simulating major logistical delay.", "warning");
    showToast("Stress test simulated! Supplier volatility spiked.", "warning");
    
    try {
      const warehouseRef = doc(db, 'warehouses', activeWarehouseKey);
      await updateDoc(warehouseRef, {
        leadTimeDays: currentWarehouse.leadTimeDays + 4,
        leadTimeStdDev: currentWarehouse.leadTimeStdDev * 2.5
      });

      setTimeout(async () => {
        setIsStressTesting(false);
        await addLog("Stress test stabilized. New elevated safety boundaries locked in.", "success");
      }, 3000);
    } catch (err) {
      console.error(err);
      setIsStressTesting(false);
    }
  };

  const handleApproveReorder = (productName, qty, sku) => {
    if (!isAdmin) {
      showToast("Access Denied: Admin authorization required to procure purchase orders.", "error");
      return;
    }

    const matchingItem = inventory.find(i => i.sku === sku);
    const poNumber = `PO-${sku}-${Math.floor(1000 + Math.random() * 9000)}`;
    const costRate = matchingItem ? (matchingItem.price * 0.7) : 3600.00;
    const grandTotal = Math.round(qty * costRate * 100) / 100;

    const generatedPO = {
      poNumber,
      date: new Date().toLocaleDateString(),
      warehouse: currentWarehouse.name,
      location: currentWarehouse.location,
      item: productName,
      sku,
      qty,
      costRate,
      grandTotal,
      forecastJustification: "Target stock dipped below computed safe bounds"
    };

    setActivePOData(generatedPO);
    setShowPOExportModal(true);
  };

  const commitPurchaseOrder = async () => {
    if (!isAdmin) {
      showToast("Access Denied: Admin authorization required.", "error");
      return;
    }

    const sku = activePOData.sku;
    const qty = activePOData.qty;
    const docId = `${activeWarehouseKey}_${sku}`;

    try {
      const docRef = doc(db, "inventory", docId);
      await updateDoc(docRef, {
        stock: increment(qty)
      });

      setShowPOExportModal(false);
      showToast(`Dispatched Purchase Order ${activePOData.poNumber}`, 'success');
      await addLog(`PO Generated and Sourced: +${qty} units of ${sku}`, "success");
    } catch (err) {
      console.error("PO Dispatch failed:", err);
      showToast("Failed to dispatch PO.", "error");
    }
  };

  const handleManualRestock = async (docId, productName) => {
    if (!isAdmin) {
      showToast("Access Denied: Admin authorization required for quick floor injection.", "error");
      return;
    }

    try {
      const docRef = doc(db, "inventory", docId);
      await updateDoc(docRef, {
        stock: increment(50)
      });
      showToast(`Injected +50 units of ${productName}`, 'info');
      await addLog(`Manual floor restock override trigger: ${productName} (+50)`, "info");
    } catch (err) {
      console.error(err);
      showToast("Failed to restock items.", "error");
    }
  };

  const handleDeleteProduct = async (docId, name) => {
    if (!isAdmin) {
      showToast("Access Denied: Admin authorization required to retire catalog lines.", "error");
      return;
    }

    try {
      await deleteDoc(doc(db, "inventory", docId));
      showToast(`Removed SKU item: ${name}`, 'info');
      await addLog(`Deleted item line from database: ${name}`, "warning");
    } catch (err) {
      console.error(err);
      showToast("Failed to delete product.", "error");
    }
  };

  const handleAddNewProduct = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast("Access Denied: Admin authorization required to register catalog lines.", "error");
      return;
    }

    if (!newProduct.name || !newProduct.sku || !newProduct.stock || !newProduct.price) {
      showToast('Mandatory fields missing!', 'error');
      return;
    }

    const docId = `${activeWarehouseKey}_${newProduct.sku}`;
    const createdItem = {
      name: newProduct.name,
      sku: newProduct.sku,
      category: newProduct.category,
      stock: parseInt(newProduct.stock),
      maxStock: parseInt(newProduct.maxStock || 150),
      price: parseFloat(newProduct.price),
      dailyDemand: parseFloat(newProduct.dailyDemand || '3.0'),
      demandStdDev: parseFloat(newProduct.demandStdDev || '1.0'),
      deadStockDays: 0,
      warehouseId: activeWarehouseKey
    };

    try {
      await setDoc(doc(db, "inventory", docId), {
        id: Date.now(),
        ...createdItem
      });
      
      setShowAddModal(false);
      await addLog(`Committed catalog line item: ${createdItem.name} (${createdItem.sku})`, "success");
      setNewProduct({ name: '', sku: '', category: 'Electronics', stock: '', maxStock: '', price: '', dailyDemand: '2.5', demandStdDev: '0.8' });
      showToast(`Successfully registered SKU: ${createdItem.name}`, 'success');
    } catch (err) {
      console.error("Failed to add SKU:", err);
      showToast("Failed to register SKU in database.", "error");
    }
  };

  const handleUpdateParameter = async (field, value) => {
    if (!isAdmin) {
      showToast("Access Denied: Admin authorization required to change safety constants.", "error");
      return;
    }

    try {
      const docRef = doc(db, "warehouses", activeWarehouseKey);
      await updateDoc(docRef, {
        [field]: value
      });
      await addLog(`Holt-Winters ${field} parameter adjusted to ${value}`, "system");
    } catch (err) {
      console.error("Failed to update config:", err);
      showToast("Failed to save updates to database.", "error");
    }
  };

  const handleClearNotifications = async () => {
    if (!db) return;
    try {
      const snapshot = await getDocs(collection(db, "notifications"));
      const batch = writeBatch(db);
      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      await addLog("Cleared all alert notifications from database", "info");
    } catch (err) {
      console.error("Failed to clear notifications:", err);
    }
  };

  // Toggle user profile roles and suspensions (Admin Only)
  const handleUserRoleToggle = async (uid, nextRole, email) => {
    if (!isAdmin) {
      showToast("Access Denied: Admin role required.", "error");
      return;
    }
    if (uid === currentUser.uid) {
      showToast("Security Lockout: You cannot demote or revoke your own Admin status.", "error");
      return;
    }

    try {
      await updateDoc(doc(db, "users", uid), {
        role: nextRole
      });
      showToast(`Access updated for ${email} to ${nextRole.toUpperCase()}`, "success");
      await addLog(`Altered user ${email} role authorization profile to ${nextRole.toUpperCase()}`, "system");
    } catch (err) {
      console.error("User update failed:", err);
      showToast("Failed to modify user access profile.", "error");
    }
  };

  // Create new user account via secondary Firebase app initialization (Admin Only)
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast("Access Denied: Admin role required.", "error");
      return;
    }
    if (!newUsrEmail || !newUsrPassword) {
      showToast("Email and password are required.", "error");
      return;
    }
    if (newUsrPassword.length < 6) {
      showToast("Password must be at least 6 characters.", "error");
      return;
    }

    setIsAddingUser(true);
    try {
      const config = getFirebaseConfig();
      if (!config) {
        throw new Error("Firebase configuration not found.");
      }

      // Create a temporary unique secondary app
      const tempAppName = `tempApp_${Date.now()}`;
      const tempApp = initializeApp(config, tempAppName);
      const tempAuth = getAuthSecondary(tempApp);

      // Create user
      const credential = await createUserWithEmailAndPassword(tempAuth, newUsrEmail, newUsrPassword);
      const user = credential.user;

      // Write their document in the main db
      await setDoc(doc(db, "users", user.uid), {
        email: newUsrEmail,
        role: newUsrRole,
        createdAt: new Date().toISOString()
      });

      // Clean up secondary session
      await tempAuth.signOut();
      await tempApp.delete();

      showToast(`Successfully created user ${newUsrEmail}`, "success");
      await addLog(`Registered new user ${newUsrEmail} as ${newUsrRole.toUpperCase()}`, "success");

      // Reset form
      setNewUsrEmail('');
      setNewUsrPassword('');
      setNewUsrRole('staff');
    } catch (err) {
      console.error("Failed to add user:", err);
      showToast(err.message || "Failed to create user account.", "error");
    } finally {
      setIsAddingUser(false);
    }
  };

  // Chat/Gemini integration logic
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;

    if (!isPro) {
      setShowPaywallModal(true);
      return;
    }

    if (!geminiKey) {
      showToast("Gemini API Key is missing. Configure it in Settings.", "error");
      return;
    }

    const userMsg = chatInput.trim();
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    setChatMessages(prev => [...prev, { sender: 'user', text: userMsg, time: timestamp }]);
    setChatInput('');
    setIsTyping(true);

    try {
      const inventoryBrief = inventory.map(i => 
        `- ${i.name} (SKU: ${i.sku}, Stock: ${i.stock}/${i.maxStock}, Category: ${i.category}, Price: ₹${i.price})`
      ).join('\n');

      const systemPrompt = `You are a world-class supply chain and logistics AI assistant integrated directly into "QuickStock Dashboard". All values are formatted in Indian Rupees (₹).
      Current active warehouse context: "${currentWarehouse.name}" located in "${currentWarehouse.location}".
      Current warehouse lead time parameters: Average lead time is ${currentWarehouse.leadTimeDays} days with a standard deviation of ${currentWarehouse.leadTimeStdDev} days.
      Your target customer service level coefficient is ${targetServiceLevel * 100}%.
      
      Here is the real-time live product catalog table inside the user's database:
      ${inventoryBrief}

      Respond strictly as a logistics expert. Analyze their input, reference these dynamic values, point out stocks running below dynamic safety thresholds (SS) where applicable, and offer solid tactical advice. Avoid generic disclaimers.`;

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

      const payload = {
        contents: [{ parts: [{ text: userMsg }] }],
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        }
      };

      const response = await fetchWithRetry(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || "I was unable to query my primary logistics matrix. Please double-check your API configurations.";
      
      setChatMessages(prev => [...prev, { sender: 'ai', text: generatedText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
      await addLog("Successfully completed Gemini AI recommendation query", "success");
    } catch (error) {
      console.error(error);
      setChatMessages(prev => [...prev, { sender: 'ai', text: "Error: Failed to reach the Gemini real-time endpoint. Operating in fallback system assistant mode. Feel free to re-request.", time: "System" }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestionClick = (prompt) => {
    setChatInput(prompt);
  };

  // Gemini Email Writer
  const generateSupplierEmail = async (product) => {
    if (!isPro) {
      setShowPaywallModal(true);
      return;
    }

    if (!isAdmin) {
      showToast("Access Denied: Admin role required for manufacturer communications.", "error");
      return;
    }

    if (!geminiKey) {
      showToast("Gemini API Key is missing. Configure it in Settings.", "error");
      return;
    }

    setDraftingProduct(product);
    setIsGeneratingEmail(true);
    setShowEmailModal(true);

    try {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const queryPrompt = `Draft an official B2B bulk restock email to our hardware manufacturer for item "${product.name}" (SKU: ${product.sku}). 
      Our active stock has dropped to only ${product.stock} units, which is below our safety parameter limits. 
      Ask for a formal price quote for 100 units based on our retail price of ₹${product.price}. Keep the language professional, direct, and authoritative.`;

      const response = await fetchWithRetry(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: queryPrompt }] }] })
      });

      const result = await response.json();
      const emailText = result.candidates?.[0]?.content?.parts?.[0]?.text || "Failed to auto-draft email.";
      setGeneratedEmail(emailText);
      await addLog("AI B2B Supplier Email drafted successfully", "success");
    } catch (error) {
      setGeneratedEmail("An error occurred while generating the supplier email draft. Please retry.");
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  // Imagen ad generator
  const generateAdBanner = async (item) => {
    if (!isPro) {
      setShowPaywallModal(true);
      return;
    }

    if (!isAdmin) {
      showToast("Access Denied: Admin role required to compile promotional designs.", "error");
      return;
    }

    if (!geminiKey) {
      showToast("API key is missing. Configure it in Settings.", "error");
      return;
    }

    setGeneratingPromoItem(item);
    setIsGeneratingImage(true);
    setShowPromoModal(true);
    setPromoImageResult('');

    try {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${geminiKey}`;
      const promptText = `A high-end, clean advertising studio shot of ${item.name} (${item.category}), ${customPromoStyle}`;

      const payload = {
        instances: [{ prompt: promptText }],
        parameters: { "sampleCount": 1 }
      };

      const response = await fetchWithRetry(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
        setPromoImageResult(`data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`);
        await addLog("Promo banner image compiled successfully", "success");
      } else {
        throw new Error("Missing image predictions bytes");
      }
    } catch (error) {
      console.error(error);
      showToast("Failed to compile promotional graphics via Imagen model. Try again.", "error");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // If loading auth state, show a clean loading screen
  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#070709] text-zinc-800 dark:text-zinc-100 flex flex-col justify-center items-center font-sans antialiased">
        <div className="h-10 w-10 flex items-center justify-center">
          <img src="./logo.png" alt="QuickStock Logo" className="h-10 w-10 object-contain rounded-lg animate-pulse" />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-4 tracking-wider uppercase font-semibold">Validating System Handshakes...</p>
      </div>
    );
  }

  // If not signed in, show Auth
  if (!currentUser) {
    return <Login onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#070709] text-zinc-800 dark:text-zinc-100 flex font-sans antialiased w-full relative transition-colors duration-300">
      
      {/* ================= SIDEBAR ================= */}
      <aside className="w-64 bg-white dark:bg-[#0B0B0E] border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col fixed h-full z-30 transition-all duration-300">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center gap-3">
          <div className="h-9 w-9 flex items-center justify-center">
            <img src="./logo.png" alt="QuickStock Logo" className="h-9 w-9 object-contain rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.15)]" />
          </div>
          <div>
            <h1 className="text-md font-bold tracking-tight text-zinc-900 dark:text-white bg-clip-text">QuickStock</h1>
            <p className="text-[10px] text-blue-500 dark:text-blue-400 font-semibold uppercase tracking-wider">Enterprise B2B SaaS</p>
          </div>
        </div>

        <div className="px-4 py-3 mx-4 my-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/40 backdrop-blur-sm flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">Global Tier Status:</span>
            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30">
              {isPro ? "PRO ENTERPRISE" : "STANDARD TIER"}
            </span>
          </div>
        </div>

        {/* Navigation panel */}
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
          <p className="px-3 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Operations Hub</p>
          
          <button 
            onClick={() => setActiveTab('Dashboard')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'Dashboard' 
                ? 'bg-gradient-to-r from-blue-500/10 to-transparent text-blue-600 dark:text-blue-400 border-l-2 border-blue-500 font-bold' 
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900/30'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LayoutDashboard className="h-4 w-4" />
              <span>Operations Control</span>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('Inventory')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'Inventory' 
                ? 'bg-gradient-to-r from-blue-500/10 to-transparent text-blue-600 dark:text-blue-400 border-l-2 border-blue-500 font-bold' 
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900/30'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Package className="h-4 w-4" />
              <span>Master Stock Floor</span>
            </div>
            {metrics.lowStockAlerts > 0 && (
              <span className="text-[10px] bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded-full font-bold">
                {metrics.lowStockAlerts}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveTab('Sales')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'Sales' 
                ? 'bg-gradient-to-r from-blue-500/10 to-transparent text-blue-600 dark:text-blue-400 border-l-2 border-blue-500 font-bold' 
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900/30'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <TrendingUp className="h-4 w-4" />
              <span>Demand & Velocity</span>
            </div>
          </button>

          <div className="pt-6">
            <p className="px-3 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Predictive Core</p>
            
            <button 
              onClick={() => handleFeatureAccess('AI Insights')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                activeTab === 'AI Insights' 
                  ? 'bg-gradient-to-r from-purple-500/15 to-transparent text-purple-600 dark:text-purple-400 border-l-2 border-purple-500 font-bold' 
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900/30'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-4 w-4 text-purple-500 dark:text-purple-400 group-hover:rotate-12 transition-transform" />
                <span>Smoothing Engine</span>
              </div>
              {!isPro && (
                <Lock className="h-3 w-3 text-zinc-400" />
              )}
            </button>
          </div>

          <div className="pt-6">
            <p className="px-3 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">SaaS Configurations</p>
            <button 
              onClick={() => setActiveTab('Settings')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'Settings' 
                  ? 'bg-gradient-to-r from-blue-500/10 to-transparent text-blue-600 dark:text-blue-400 border-l-2 border-blue-500 font-bold' 
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900/30'
              }`}
            >
              <Settings className="h-4 w-4" />
              <span>Safety Parameters</span>
            </button>
          </div>
        </nav>

        {/* Global Keybind Prompt */}
        <div className="p-4 mx-4 mb-4 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl text-center">
          <p className="text-[10px] text-zinc-500">Quick Command Menu</p>
          <div className="mt-1 flex items-center justify-center gap-1">
            <kbd className="px-1.5 py-0.5 text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded border border-zinc-300 dark:border-zinc-700">Cmd</kbd>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">+</span>
            <kbd className="px-1.5 py-0.5 text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded border border-zinc-300 dark:border-zinc-700">K</kbd>
          </div>
        </div>

        {/* User profile with Sign Out */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center text-white font-extrabold text-xs shadow-md">
              {currentUser.email ? currentUser.email.substring(0, 2).toUpperCase() : 'US'}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{currentUser.email}</p>
              <span className="inline-block text-[8px] bg-zinc-200 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 px-1 py-0.5 rounded font-bold tracking-wider uppercase">
                {userRole}
              </span>
            </div>
          </div>
          <button 
            onClick={handleSignOut}
            className="w-full py-1.5 px-3 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900/80 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
          >
            Sign Out Secured Portal
          </button>
        </div>
      </aside>

      {/* ================= MAIN CONTENT WRAPPER ================= */}
      <main className="flex-1 ml-64 min-h-screen flex flex-col pb-12 transition-all duration-300">
        
        {/* ================= HEADER AND SWITCHERS ================= */}
        <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-[#070709]/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between px-8 transition-colors duration-300">
          
          <div className="flex items-center gap-4">
            <div className="relative w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
              <input 
                type="text" 
                placeholder="Search index or SKU... (Press Cmd+K)" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-[#111115] text-xs text-zinc-800 dark:text-zinc-200 pl-9 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            
            {/* Multi-Warehouse Selector Context Switcher */}
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-[#111115] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5">
              <Globe className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider hidden md:inline">Hub Context:</span>
              <select 
                value={activeWarehouseKey}
                onChange={(e) => {
                  setActiveWarehouseKey(e.target.value);
                  showToast(`Switched active logistics hub`, 'info');
                  addLog(`Hub context changed to ${e.target.value}`, "system");
                }}
                className="bg-transparent border-none text-xs text-zinc-800 dark:text-zinc-200 font-bold focus:outline-none focus:ring-0 cursor-pointer"
              >
                <option value="newark" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Newark Hub - Main</option>
                <option value="la_east" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">LA East Depot</option>
                <option value="frankfurt" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Frankfurt Air Cargo</option>
              </select>
            </div>

            {/* Theme Toggle Button */}
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg bg-zinc-50 dark:bg-[#111115] border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-all"
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-650" />}
            </button>

            {/* Notifications panel */}
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 rounded-lg bg-zinc-50 dark:bg-[#111115] border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 relative transition-all"
              >
                <Bell className="h-4 w-4" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_#ef4444]" />
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950/50">
                    <h3 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">System Alerts</h3>
                    <button onClick={handleClearNotifications} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">Clear All</button>
                  </div>
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60 max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-xs text-zinc-500">No recent alerts.</div>
                    ) : (
                      notifications.map(notif => (
                        <div key={notif.id} className="p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                          <p className="text-xs text-zinc-800 dark:text-zinc-300 font-medium">{notif.text}</p>
                          <span className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-1 block">{notif.time || "recent"}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* ================= PAGE CONTAINER CONTENT ================= */}
        <div className="flex-1 px-8 py-6 animate-fade-in">

          {/* ================= TAB 1: OPERATIONS DASHBOARD ================= */}
          {activeTab === 'Dashboard' && (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white flex items-center gap-2.5">
                    Operations Control Center
                    <span className="px-2 py-0.5 text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded font-semibold tracking-wide">
                      Active: {currentWarehouse.name}
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Real-time demand metrics, predictive restocking triggers, and cognitive warehouse optimization.</p>
                </div>
                
                {/* Admin actions hidden from Staff */}
                {isAdmin && (
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={handleStressTest}
                      disabled={isStressTesting}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors shadow-sm ${
                        isStressTesting 
                          ? 'bg-rose-950/40 border-rose-800 text-rose-400 animate-pulse' 
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <Activity className={`h-3.5 w-3.5 ${isStressTesting ? 'animate-spin' : ''}`} />
                      <span>{isStressTesting ? "Volatility Spike Simulated..." : "Simulate Supply Stress"}</span>
                    </button>

                    <button 
                      onClick={() => setShowAddModal(true)}
                      className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold text-white transition-all shadow-[0_4px_12px_rgba(59,130,246,0.2)] hover:scale-[1.02]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Register New SKU</span>
                    </button>
                  </div>
                )}
              </div>

              {/* ================= TOP ROW: KPI CARDS ================= */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                
                <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-5 relative overflow-hidden shadow-sm hover:scale-[1.01] transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Total Sourced Lines</span>
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10">
                      <Package className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">{metrics.totalProducts}</span>
                    <span className="text-[10px] font-semibold text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5">
                      <ArrowUpRight className="h-3 w-3" /> +12% MoM
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Sourced from regional facility database</p>
                </div>

                <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-5 relative overflow-hidden shadow-sm hover:scale-[1.01] transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Low Stock Safety Alerts</span>
                    <div className={`p-2 rounded-lg ${metrics.lowStockAlerts > 0 ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/15 animate-pulse' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-400'}`}>
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-bold tracking-tight ${metrics.lowStockAlerts > 0 ? 'text-rose-600 dark:text-rose-400 font-black' : 'text-zinc-900 dark:text-zinc-200'}`}>{metrics.lowStockAlerts}</span>
                    <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-0.5">
                      Z-Score: {targetServiceLevel === 0.95 ? "1.65" : targetServiceLevel === 0.99 ? "2.33" : "1.28"}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Below dynamically calculated safety boundaries</p>
                </div>

                <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-5 relative overflow-hidden shadow-sm hover:scale-[1.01] transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Live Capital Value</span>
                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-300">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">{metrics.totalValue}</span>
                    <span className="text-[10px] font-semibold text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5">
                      <ArrowUpRight className="h-3 w-3" /> +8.4%
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Sourced asset appraisal index (₹)</p>
                </div>

                {/* PREMIUM AI INSIGHT CARD */}
                <div className="relative rounded-xl overflow-hidden p-[1px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 shadow-[0_0_20px_rgba(59,130,246,0.1)] group hover:shadow-[0_0_25px_rgba(139,92,246,0.25)] hover:scale-[1.01] transition-all">
                  <div className="bg-gradient-to-br from-white to-zinc-50 dark:from-[#0B0B0E] dark:to-[#12121A] rounded-[11px] p-5 h-full flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-300">Predictive Audit State</span>
                      <div className="p-1.5 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold tracking-tight text-zinc-950 dark:text-white bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text">
                          {metrics.insightsGenerated}
                        </span>
                        <span className="text-[9px] font-bold text-purple-600 dark:text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                          Active
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-2 font-medium">Grounded real-time Gemini recommendations</p>
                    </div>
                  </div>
                </div>

              </div>

              {/* ================= MIDDLE BLOCK: REORDER RECOMMENDATIONS + RECHARTS ================= */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
                
                {/* LEFT COLUMN: Gemini AI Rebuy Recommender */}
                <div className="lg:col-span-5 flex flex-col">
                  <div className="relative p-[1px] rounded-xl overflow-hidden bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 h-full shadow-[0_4px_30px_rgba(139,92,246,0.1)]">
                    <div className="bg-white dark:bg-[#0B0B0E] p-6 rounded-xl h-full flex flex-col justify-between">
                      <div>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-5">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                              <Sparkles className="h-4 w-4" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-zinc-800 dark:text-white tracking-tight">AI Supplier Assistant</h3>
                              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Dynamic replenishment triggers & B2B mail writers</p>
                            </div>
                          </div>
                          
                          <span className="text-[9px] bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded font-extrabold">
                            Lead Time: {currentWarehouse.leadTimeDays}d
                          </span>
                        </div>

                        {/* List of Recommended items */}
                        <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                          {recommends.length === 0 ? (
                            <div className="text-center py-12">
                              <Check className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                              <p className="text-xs text-zinc-800 dark:text-zinc-300 font-bold">All safe thresholds satisfied</p>
                              <p className="text-[10px] text-zinc-500 mt-1">No dynamic safety stock boundaries breached.</p>
                            </div>
                          ) : (
                            recommends.map((item) => (
                              <div 
                                key={item.id} 
                                className="p-3.5 rounded-lg border bg-zinc-50 dark:bg-zinc-950/60 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700/80 transition-all"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{item.name}</span>
                                  <span className="text-[10px] bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded font-medium">
                                    {targetServiceLevel*100}% Service Level
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2 py-2 border-t border-zinc-200 dark:border-zinc-800/40 mt-2 text-center">
                                  <div className="text-left">
                                    <p className="text-[9px] text-zinc-500 uppercase font-semibold">Live Stock</p>
                                    <p className="text-xs font-bold text-rose-550 dark:text-rose-400">{item.currentStock} units</p>
                                  </div>
                                  <div className="text-left">
                                    <p className="text-[9px] text-zinc-500 uppercase font-semibold">Calculated Safe</p>
                                    <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold">{item.predictedSales} /mo</p>
                                  </div>
                                  <div className="text-left">
                                    <p className="text-[9px] text-purple-650 dark:text-purple-400 uppercase font-bold flex items-center gap-0.5">Order Target</p>
                                    <p className="text-sm font-black text-zinc-800 dark:text-white">{item.recommendQty}</p>
                                  </div>
                                </div>

                                {/* Procurement actions hidden from Staff */}
                                {isAdmin && (
                                  <div className="mt-3 flex gap-2">
                                    <button 
                                      onClick={() => handleApproveReorder(item.name, item.recommendQty, item.sku)}
                                      className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-[11px] py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1"
                                    >
                                      <span>Procure PO</span>
                                      <Download className="h-3 w-3" />
                                    </button>
                                    
                                    <button 
                                      onClick={() => {
                                        const fullItem = inventory.find(inv => inv.sku === item.sku);
                                        if (fullItem) generateSupplierEmail(fullItem);
                                      }}
                                      className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-650 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                                      title="Auto-draft Manufacturer Email"
                                    >
                                      <Mail className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800/50 flex items-center justify-between">
                        <p className="text-[10px] text-zinc-500">Service safety factor ($Z$): <span className="text-purple-600 dark:text-purple-400 font-bold">{targetServiceLevel*100}% Target</span></p>
                        <button 
                          onClick={() => setActiveTab('Settings')} 
                          className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline transition-colors font-semibold"
                        >
                          Modify System Parameters →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: RECHARTS WITH DYNAMIC REFERENCE LINES */}
                <div className="lg:col-span-7 bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-sm font-bold text-zinc-800 dark:text-white tracking-tight">Active Demand Velocity & Capacity</h3>
                        <p className="text-[10px] text-zinc-550 dark:text-zinc-400">Total estimated monthly sales compared against warehouse floor targets.</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold font-mono">STABLE GATEWAY STATUS</span>
                      </div>
                    </div>

                    {/* Chart Container */}
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={salesByProductCategory} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                          <defs>
                            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.8} />
                              <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.15} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke={theme === 'dark' ? "#1E1E24" : "#e5e7eb"} strokeDasharray="3 3" vertical={false} />
                          <XAxis 
                             dataKey="category" 
                             stroke="#71717a" 
                             fontSize={10} 
                             tickLine={false} 
                             axisLine={false} 
                          />
                          <YAxis 
                             stroke="#71717a" 
                             fontSize={10} 
                             tickLine={false} 
                             axisLine={false} 
                             tickFormatter={(value) => `₹${(value / 100000).toFixed(1)}L`} 
                          />
                          <Tooltip 
                            cursor={{ fill: 'rgba(0, 0, 0, 0.02)' }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-2.5 rounded-lg shadow-xl text-zinc-800 dark:text-zinc-200">
                                    <p className="text-xs font-bold">{payload[0].payload.category}</p>
                                    <p className="text-xs font-extrabold text-blue-600 dark:text-blue-400 mt-1">
                                      Turnover: ₹{payload[0].value.toLocaleString('en-IN')}
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar 
                            dataKey="Sales" 
                            fill="url(#barGradient)" 
                            radius={[4, 4, 0, 0]}
                            maxBarSize={45}
                          >
                            {salesByProductCategory.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                className="transition-all duration-300 hover:opacity-100 opacity-90"
                              />
                            ))}
                          </Bar>
                          
                          <ReferenceLine y={20000 * 80} label={{ value: 'Target Run Rate', fill: '#10B981', fontSize: 9, position: 'top' }} stroke="#10B981" strokeDasharray="3 3" />
                          <ReferenceLine y={32000 * 80} label={{ value: 'Floor Limit', fill: '#EF4444', fontSize: 9, position: 'top' }} stroke="#EF4444" strokeDasharray="3 3" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800/50 text-[10px] text-zinc-500">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                      Dynamic calculations aligned with active lead variances ({currentWarehouse.leadTimeDays}d average)
                    </span>
                  </div>
                </div>

              </div>

              {/* ================= BOTTOM GRID: MODERN INVENTORY SUMMARY MATRIX ================= */}
              <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden mb-8 shadow-sm">
                <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-50/50 dark:bg-zinc-950/40">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Live Safety Stock Floor Diagnostics</h3>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">Dynamic buffers recalculated continuously based on supply lead uncertainties.</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1">
                      <Filter className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />
                      <select 
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="bg-transparent border-none text-[11px] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-0 cursor-pointer"
                      >
                        <option value="All" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">All Sourced Categories</option>
                        <option value="Electronics" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">Electronics</option>
                        <option value="Smart Home" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">Smart Home</option>
                        <option value="Networking" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">Networking</option>
                        <option value="Accessories" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">Accessories</option>
                        <option value="Wearables" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">Wearables</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/30 dark:bg-zinc-900/20 text-zinc-505 dark:text-zinc-400 font-medium select-none">
                        <th className="py-3 px-6">Product Line</th>
                        <th className="py-3 px-6">SKU Identifier</th>
                        <th className="py-3 px-6">Dynamic Safety Target (SS)</th>
                        <th className="py-3 px-6">Floor Level Status</th>
                        <th className="py-3 px-6">Dead Stock Tracking</th>
                        <th className="py-3 px-6 text-center">Liquidation Promotions</th>
                        {isAdmin && <th className="py-3 px-6 text-right">Floor Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/40">
                      {filteredInventory.map((item) => {
                        const calculatedSS = calculateSafetyStock(
                          item.dailyDemand, 
                          item.demandStdDev, 
                          currentWarehouse.leadTimeDays, 
                          currentWarehouse.leadTimeStdDev, 
                          targetServiceLevel
                        );
                        
                        const isLowStock = item.stock <= calculatedSS;
                        const isDeadStock = item.deadStockDays >= deadStockThresholdDays;
                        const stockPercentage = Math.min((item.stock / item.maxStock) * 100, 100);

                        return (
                          <tr key={item.docId || item.sku} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                            <td className="py-3.5 px-6 font-semibold text-zinc-900 dark:text-zinc-100">
                              <div>
                                <span>{item.name}</span>
                                <span className="block text-[9px] text-zinc-400 dark:text-zinc-500 font-normal">Category: {item.category}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-6 font-mono text-zinc-500 dark:text-zinc-400 text-[11px]">{item.sku}</td>
                            <td className="py-3.5 px-6 text-indigo-650 dark:text-indigo-400 font-bold font-mono">
                              {calculatedSS} units
                            </td>
                            <td className="py-3.5 px-6">
                              <div className="w-40">
                                <div className="flex justify-between text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">
                                  <span className={isLowStock ? 'text-rose-500 font-bold' : 'text-emerald-500 dark:text-emerald-400 font-bold'}>{item.stock}</span>
                                  <span>/ {item.maxStock}</span>
                                </div>
                                <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      isLowStock ? 'bg-rose-500 animate-pulse' : 'bg-emerald-550 dark:bg-emerald-400'
                                    }`}
                                    style={{ width: `${stockPercentage}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-6">
                              {isDeadStock ? (
                                <span className="text-amber-600 dark:text-amber-500 font-bold text-[10px] inline-flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 animate-pulse">
                                  <AlertTriangle className="h-3 w-3" />
                                  Dead Stock ({item.deadStockDays}d)
                                </span>
                              ) : (
                                <span className="text-zinc-450 dark:text-zinc-500">{item.deadStockDays} days static</span>
                              )}
                            </td>
                            <td className="py-3.5 px-6 text-center">
                              {isDeadStock ? (
                                <>
                                  {isAdmin ? (
                                    <button 
                                      onClick={() => generateAdBanner(item)}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-650 dark:text-purple-400 border border-purple-500/30 text-[10px] font-bold transition-all"
                                    >
                                      <Flame className="h-3.5 w-3.5 animate-pulse" />
                                      AI Promo Banner
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-amber-550 font-semibold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Liquidating</span>
                                  )}
                                </>
                              ) : (
                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">Within safety bounds</span>
                              )}
                            </td>
                            {/* Actions column hidden from Staff */}
                            {isAdmin && (
                              <td className="py-3.5 px-6 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button 
                                    onClick={() => handleManualRestock(item.docId, item.name)}
                                    className="p-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded transition-colors"
                                    title="Quick floor injection +50"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteProduct(item.docId, item.name)}
                                    className="p-1 text-zinc-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded transition-colors"
                                    title="Retire catalog line"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ================= TERMINAL ACTIVITY AUDIT FEED ================= */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 font-mono text-xs text-zinc-300 shadow-lg">
                <div className="flex items-center justify-between border-b border-zinc-850 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-emerald-400 animate-pulse" />
                    <span className="font-bold uppercase tracking-wider text-zinc-400 text-[10px]">Active Node Log Terminal</span>
                  </div>
                  <span className="text-[9px] bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 text-zinc-500">Live Telemetry</span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 select-text">
                  {systemLogs.length === 0 ? (
                    <div className="text-zinc-500 italic">No telemetry logs recorded.</div>
                  ) : (
                    systemLogs.map((log, idx) => (
                      <div key={log.id || idx} className="flex gap-2">
                        <span className="text-zinc-650">[{log.timestamp}]</span>
                        <span className={`font-bold ${log.type === 'success' ? 'text-emerald-400' : log.type === 'warning' ? 'text-amber-400' : log.type === 'system' ? 'text-indigo-400' : 'text-zinc-350'}`}>
                          {log.type.toUpperCase()}:
                        </span>
                        <span className="text-zinc-200">{log.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {/* ================= TAB 2: INVENTORY LOG FLOOR ================= */}
          {activeTab === 'Inventory' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-black text-zinc-900 dark:text-white mb-1">Master Sourced Inventory Floor</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Standardized regional databases with live dynamic values.</p>
              </div>

              <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950/40">
                  <h3 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Catalog Database ({currentWarehouse.name})</h3>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Search inventory database..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs px-3 py-1 rounded focus:outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/30 dark:bg-zinc-900/20 text-zinc-500 dark:text-zinc-400 font-semibold select-none">
                        <th className="py-3 px-6">Product Details</th>
                        <th className="py-3 px-6">SKU Code</th>
                        <th className="py-3 px-6">Dynamic Safety Stock (SS)</th>
                        <th className="py-3 px-6">Floor Inventory Level</th>
                        <th className="py-3 px-6">Sales Velocity (Avg)</th>
                        <th className="py-3 px-6">MSRP Unit Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/40">
                      {filteredInventory.map((item) => {
                        const calculatedSS = calculateSafetyStock(
                          item.dailyDemand, 
                          item.demandStdDev, 
                          currentWarehouse.leadTimeDays, 
                          currentWarehouse.leadTimeStdDev, 
                          targetServiceLevel
                        );
                        return (
                          <tr key={item.docId || item.sku} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/20 transition-colors">
                            <td className="py-3.5 px-6 font-semibold text-zinc-900 dark:text-zinc-100">{item.name}</td>
                            <td className="py-3.5 px-6 text-zinc-500 dark:text-zinc-400 font-mono">{item.sku}</td>
                            <td className="py-3.5 px-6 text-indigo-600 dark:text-indigo-400 font-mono font-bold">{calculatedSS} units</td>
                            <td className="py-3.5 px-6 font-bold text-zinc-850 dark:text-zinc-200">{item.stock} units</td>
                            <td className="py-3.5 px-6 text-zinc-500 dark:text-zinc-400">{item.dailyDemand} units/day</td>
                            <td className="py-3.5 px-6 text-emerald-600 dark:text-emerald-400 font-semibold">₹{item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 3: VELOCITY & DEVIATIONS ================= */}
          {activeTab === 'Sales' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-black text-zinc-900 dark:text-white mb-1">Sales Projections & Turn Rates</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Spot warehouse bottlenecks, stagnant capitalization patterns, and optimization targets.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl shadow-sm">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Regional Distribution Index</p>
                  <p className="text-2xl font-bold mt-1 text-zinc-900 dark:text-white">1.15x Target</p>
                  <span className="text-[10px] text-emerald-650 dark:text-emerald-400 mt-2 block font-medium">Safe thresholds optimized based on local supplier variances</span>
                </div>
                <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl shadow-sm">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Est. Sourced Monthly GMV</p>
                  <p className="text-2xl font-bold mt-1 text-zinc-900 dark:text-white">₹67,32,000</p>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 mt-2 block font-medium">Calculations updated per warehouse constraints</span>
                </div>
                <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl shadow-sm">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Dead Stock Sourced Value</p>
                  <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-500">
                    ₹{inventory
                      .filter(i => i.deadStockDays >= deadStockThresholdDays)
                      .reduce((sum, item) => sum + (item.stock * item.price), 0).toLocaleString('en-IN')}
                  </p>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2 block font-medium">Stagnant inventory locked capital</span>
                </div>
              </div>

              {/* Dead Stock Bundle Promo Panel */}
              <div className="bg-white dark:bg-[#0B0B0E] p-6 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm">
                <h3 className="text-sm font-bold text-zinc-850 dark:text-white mb-2 flex items-center gap-1.5">
                  <Flame className="text-purple-650 dark:text-purple-400 h-5 w-5 animate-pulse" />
                  Live AI Dead Stock Marketing Engine
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                  The system tracks underperforming warehouse lines. Use the built-in Imagen suite to compile custom high-converting product promo graphics automatically.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {inventory.filter(i => i.deadStockDays >= deadStockThresholdDays).map(item => (
                    <div key={item.sku} className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{item.name} ({item.sku})</h4>
                        <p className="text-[10px] text-zinc-500 mt-1">Inactive: {item.deadStockDays} days | Appraisal Value: ₹{(item.stock * item.price).toLocaleString('en-IN')}</p>
                      </div>
                      {/* Banner generation hidden from staff */}
                      {isAdmin && (
                        <button 
                          onClick={() => generateAdBanner(item)}
                          className="px-3 py-1.5 bg-purple-500/15 hover:bg-purple-500/30 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-[10px] font-bold rounded flex items-center gap-1"
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                          Generate AI Graphic Banner
                        </button>
                      )}
                    </div>
                  ))}
                  {inventory.filter(i => i.deadStockDays >= deadStockThresholdDays).length === 0 && (
                    <div className="col-span-2 text-center py-6 text-xs text-zinc-500">
                      Perfect. All inventory units conform inside healthy standard aging timelines.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 4: HOLT-WINTERS SIMULATOR & AI INSIGHTS ================= */}
          {activeTab === 'AI Insights' && isPro && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-zinc-900 dark:text-white mb-1">QuickStock Insights & Forecasting</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Predictive recommendations and triple exponential smoothing calculations synced in realtime.</p>
                </div>
                <span className="px-3 py-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded text-[10px] font-extrabold text-white">
                  Gemini core online
                </span>
              </div>

              {/* THREE v1 RECOMMENDATION CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <div className="bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent dark:from-[#1E1B4B]/30 dark:to-[#0F0F13] border border-indigo-200 dark:border-purple-500/20 p-5 rounded-xl relative overflow-hidden shadow-sm hover:scale-[1.01] transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4.5 w-4.5 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-300 uppercase tracking-wide">Category Spike</span>
                  </div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Smart Home Demand Surge</h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
                    Local IoT trends suggest a projected 32% order growth next month. Recommend building bulk inventory storage margins.
                  </p>
                  <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800/80 flex justify-between items-center text-[10px]">
                    <span className="text-zinc-400 dark:text-zinc-500">Suggested Restock: +100 units</span>
                    {isAdmin && (
                      <button 
                        onClick={() => showToast("Added custom demand buffers to SmartHome catalogs", "success")} 
                        className="text-purple-600 dark:text-purple-400 font-bold hover:underline"
                      >
                        Apply Buffer
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl shadow-sm hover:scale-[1.01] transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4.5 w-4.5 text-blue-500 dark:text-blue-400" />
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-300 uppercase tracking-wide">Lead Time Risk</span>
                  </div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Supplier Shipping Delay Warnings</h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
                    Logistics analytics identify customs backlogs at Port of Newark. Safe backup times shifted from 7 days to 14 days.
                  </p>
                  <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800/80 flex justify-between items-center text-[10px]">
                    <span className="text-rose-500 font-semibold">Critical level risk: High</span>
                    {isAdmin && (
                      <button 
                        onClick={() => showToast("Adjusted supplier buffer targets on system configuration settings", "success")} 
                        className="text-blue-600 dark:text-blue-400 font-bold hover:underline"
                      >
                        Update Bounds
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl shadow-sm hover:scale-[1.01] transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-4.5 w-4.5 text-emerald-500" />
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-300 uppercase tracking-wide">Dead Stock Warning</span>
                  </div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Accessory Line Liquidation Tip</h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
                    Stock turn rate for "Quantum Pad" slowed down by 14% over past quarter. Recommend bundle packages.
                  </p>
                  <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800/80 flex justify-between items-center text-[10px]">
                    <span className="text-zinc-400 dark:text-zinc-500">Est. capital unlock: ₹2,56,000</span>
                    {isAdmin && (
                      <button 
                        onClick={() => showToast("Bundle configurations saved to store draft exports!", "success")} 
                        className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                      >
                        Draft Promo
                      </button>
                    )}
                  </div>
                </div>

              </div>

              {/* Holt-Winters Dynamic Controllers */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Sliders panel */}
                <div className="lg:col-span-4 bg-white dark:bg-[#0B0B0E] p-6 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-6 shadow-sm">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Smoothing Factor Constants</h3>
                  
                  <div>
                    <div className="flex justify-between text-xs text-zinc-800 dark:text-zinc-300 mb-1 font-mono">
                      <span>Level Value (Alpha - α)</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">{hwAlpha.toFixed(2)}</span>
                    </div>
                    {isAdmin && (
                      <input 
                        type="range" 
                        className="w-full accent-blue-500 bg-zinc-200 dark:bg-zinc-900" 
                        min="0.05" 
                        max="0.95" 
                        step="0.05" 
                        value={hwAlpha} 
                        onChange={(e) => handleUpdateParameter('hwAlpha', parseFloat(e.target.value))}
                      />
                    )}
                    <p className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-1">Controls historical observations dampening index.</p>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-zinc-800 dark:text-zinc-300 mb-1 font-mono">
                      <span>Trend Variance (Beta - β)</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">{hwBeta.toFixed(2)}</span>
                    </div>
                    {isAdmin && (
                      <input 
                        type="range" 
                        className="w-full accent-blue-500 bg-zinc-200 dark:bg-zinc-900" 
                        min="0.05" 
                        max="0.95" 
                        step="0.05" 
                        value={hwBeta} 
                        onChange={(e) => handleUpdateParameter('hwBeta', parseFloat(e.target.value))}
                      />
                    )}
                    <p className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-1">Adjusts trend vector trajectory response sensitivity.</p>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-zinc-800 dark:text-zinc-300 mb-1 font-mono">
                      <span>Seasonal Multiplier (Gamma - γ)</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">{hwGamma.toFixed(2)}</span>
                    </div>
                    {isAdmin && (
                      <input 
                        type="range" 
                        className="w-full accent-blue-500 bg-zinc-200 dark:bg-zinc-900" 
                        min="0.05" 
                        max="0.95" 
                        step="0.05" 
                        value={hwGamma} 
                        onChange={(e) => handleUpdateParameter('hwGamma', parseFloat(e.target.value))}
                      />
                    )}
                    <p className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-1">Dampens or intensifies seasonal holiday cycle projections.</p>
                  </div>

                  {!isAdmin && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg text-[10px] leading-relaxed flex items-start gap-2">
                      <Lock className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span>ReadOnly Mode: You must log in as Administrator to edit these coefficients.</span>
                    </div>
                  )}

                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-850 text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                    Modifying constants triggers dynamic recursive forecasting arrays automatically.
                  </div>
                </div>

                {/* Simulated Chart results */}
                <div className="lg:col-span-8 bg-white dark:bg-[#0B0B0E] p-6 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-4">12-Month Projections (SmartHub Pro in ₹)</h3>
                  
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={calculatedForecastData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                        <XAxis dataKey="month" stroke="#71717a" fontSize={10} />
                        <YAxis stroke="#71717a" fontSize={10} tickFormatter={(v) => `₹${v/1000}k`} />
                        <Tooltip content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-2.5 rounded-lg shadow-xl text-zinc-800 dark:text-zinc-200">
                                <p className="text-xs font-bold">{payload[0].payload.month}</p>
                                {payload[0].value !== null && (
                                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                    Historical: ₹{payload[0].value.toLocaleString('en-IN')}
                                  </p>
                                )}
                                {payload[1] && payload[1].value !== null && (
                                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                                    Forecast: ₹{payload[1].value.toLocaleString('en-IN')}
                                  </p>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }} />
                        <CartesianGrid stroke={theme === 'dark' ? "#1E1E24" : "#e5e7eb"} strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="historical" name="Historical Sourced Demand" stroke="#3B82F6" strokeWidth={2.5} activeDot={{ r: 8 }} connectNulls />
                        <Line type="monotone" dataKey="forecast" name="AI Holt-Winters Forecast" stroke="#A78BFA" strokeWidth={2.5} strokeDasharray="5 5" connectNulls />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ================= TAB 5: SYSTEM CONFIGS ================= */}
          {activeTab === 'Settings' && (
            <div className="space-y-6 max-w-3xl animate-fade-in">
              <div>
                <h2 className="text-xl font-black text-zinc-900 dark:text-white mb-1">Safety stock & Optimization settings</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Configure global parameters, service thresholds, and AI connectivity options.</p>
              </div>

              {/* Logistical parameters settings: Slider input for Admin, static read-only cards for Staff */}
              <div className="bg-white dark:bg-[#0B0B0E] p-6 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-6 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 pb-2">Logistical Boundaries</h3>
                
                {isAdmin ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs text-zinc-700 dark:text-zinc-300 font-mono mb-2">Target Customer Service Level</label>
                      <select 
                        value={targetServiceLevel}
                        onChange={(e) => handleUpdateParameter('targetServiceLevel', parseFloat(e.target.value))}
                        className="w-full bg-zinc-55 dark:bg-[#121217] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 cursor-pointer"
                      >
                        <option value="0.90" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold">90% Service Rate (Z = 1.28)</option>
                        <option value="0.95" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold">95% Service Rate (Z = 1.65)</option>
                        <option value="0.99" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold">99% Service Rate (Z = 2.33)</option>
                      </select>
                      <p className="text-[10px] text-zinc-405 dark:text-zinc-500 mt-1">Impacts Z-score calculation for safety stock buffers.</p>
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-700 dark:text-zinc-300 font-mono mb-2">Dead Stock Threshold (Days)</label>
                      <input 
                        type="number" 
                        value={deadStockThresholdDays}
                        onChange={(e) => handleUpdateParameter('deadStockThresholdDays', parseInt(e.target.value))}
                        className="w-full bg-zinc-55 dark:bg-[#121217] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
                      />
                      <p className="text-[10px] text-zinc-405 dark:text-zinc-500 mt-1">Number of static days before an item registers as stagnant.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-lg">
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Target Customer Service Level</p>
                      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 mt-1">{targetServiceLevel * 100}% Service Rate (Z = {targetServiceLevel === 0.95 ? "1.65" : targetServiceLevel === 0.99 ? "2.33" : "1.28"})</p>
                    </div>
                    <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-lg">
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Dead Stock Threshold</p>
                      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 mt-1">{deadStockThresholdDays} Days Static</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Enterprise Pro Gating Switch (Admin Only) */}
              {isAdmin && (
                <div className="bg-white dark:bg-[#0B0B0E] p-6 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-4 shadow-sm">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 pb-2">Enterprise Operations Tier</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Tier Status: {isPro ? "Enterprise Pro" : "Standard (Normal)"}</h4>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Toggle premium features (Smoothing Engine and AI Chatbot) for this warehouse context.</p>
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                          const whRef = doc(db, "warehouses", activeWarehouseKey);
                          await updateDoc(whRef, { isPro: !isPro });
                          showToast(`Switched operational tier to ${!isPro ? 'Pro' : 'Standard'}`, 'success');
                          await addLog(`Switched operational tier to ${!isPro ? 'Enterprise Pro' : 'Standard Tier'}`, 'system');
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
                        isPro 
                          ? 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/30' 
                          : 'bg-blue-600 hover:bg-blue-500 text-white border-transparent'
                      }`}
                    >
                      {isPro ? "Switch to Standard" : "Unlock Pro Tier"}
                    </button>
                  </div>
                </div>
              )}

              {/* Corporate User Access Registry (Admin Only) */}
              {isAdmin && (
                <div className="space-y-6">
                  {/* Register New Corporate User */}
                  <div className="bg-white dark:bg-[#0B0B0E] p-6 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-4 shadow-sm">
                    <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
                      <Plus className="h-4.5 w-4.5 text-blue-500" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Register New Corporate Profile</h3>
                    </div>
                    <form onSubmit={handleCreateUser} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider mb-1.5">User Email Address</label>
                          <input 
                            type="email" 
                            placeholder="new.user@quickstock.ai" 
                            value={newUsrEmail}
                            onChange={(e) => setNewUsrEmail(e.target.value)}
                            className="w-full bg-zinc-50 dark:bg-[#121217] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-850 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider mb-1.5">Temporary Password</label>
                          <input 
                            type="password" 
                            placeholder="••••••••" 
                            value={newUsrPassword}
                            onChange={(e) => setNewUsrPassword(e.target.value)}
                            className="w-full bg-zinc-50 dark:bg-[#121217] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-850 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider mb-1.5">Access Role Profile</label>
                          <select 
                            value={newUsrRole}
                            onChange={(e) => setNewUsrRole(e.target.value)}
                            className="w-full bg-zinc-50 dark:bg-[#121217] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-850 dark:text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                          >
                            <option value="staff" className="bg-white dark:bg-zinc-950 text-zinc-850 dark:text-zinc-250">Staff Operations Profile</option>
                            <option value="admin" className="bg-white dark:bg-zinc-950 text-zinc-850 dark:text-zinc-250">System Administrator (Admin)</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex justify-end pt-2">
                        <button 
                          type="submit" 
                          disabled={isAddingUser}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-bold text-white rounded-lg shadow-md transition-all flex items-center gap-1.5"
                        >
                          {isAddingUser ? (
                            <>
                              <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                              <span>Provisioning Account...</span>
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" />
                              <span>Add User to Registry</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* List Corporate Registry */}
                  <div className="bg-white dark:bg-[#0B0B0E] p-6 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-4 shadow-sm">
                    <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
                      <Users className="h-4.5 w-4.5 text-blue-500" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Corporate User Access Registry</h3>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-zinc-500 dark:text-zinc-400 font-semibold border-b border-zinc-200 dark:border-zinc-850">
                            <th className="py-2">User Email</th>
                            <th className="py-2">Active Role</th>
                            <th className="py-2 text-right">Actions Override</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-150 dark:divide-zinc-800/40">
                          {userProfiles.map(profile => (
                            <tr key={profile.uid}>
                              <td className="py-2.5 font-mono text-zinc-700 dark:text-zinc-300">{profile.email}</td>
                              <td className="py-2.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  profile.role === 'admin' 
                                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-extrabold' 
                                    : profile.role === 'revoked'
                                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-450 font-extrabold animate-pulse'
                                    : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400'
                                }`}>
                                  {profile.role.toUpperCase()}
                                </span>
                              </td>
                              <td className="py-2.5 text-right">
                                {profile.uid !== currentUser.uid ? (
                                  <div className="flex justify-end gap-2">
                                    {profile.role !== 'revoked' ? (
                                      <>
                                        <button
                                          onClick={() => handleUserRoleToggle(profile.uid, profile.role === 'admin' ? 'staff' : 'admin', profile.email)}
                                          className="text-[10px] bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-800 font-semibold transition-all text-zinc-750 dark:text-zinc-300"
                                        >
                                          Make {profile.role === 'admin' ? 'Staff' : 'Admin'}
                                        </button>
                                        <button
                                          onClick={() => handleUserRoleToggle(profile.uid, 'revoked', profile.email)}
                                          className="text-[10px] bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 px-2.5 py-1 rounded border border-rose-500/20 font-semibold transition-all"
                                        >
                                          Suspend
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => handleUserRoleToggle(profile.uid, 'staff', profile.email)}
                                        className="text-[10px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded border border-emerald-500/20 font-semibold transition-all"
                                      >
                                        Restore Access
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-zinc-400 dark:text-zinc-550 italic">Self Account</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-[#0B0B0E] p-6 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 pb-2">AI Integration Credentials</h3>
                
                <div>
                  <label className="block text-xs text-zinc-700 dark:text-zinc-300 font-mono mb-2">Gemini & Imagen API Key</label>
                  <input 
                    type="password"
                    placeholder="Enter your Gemini/Google AI Studio API Key..."
                    value={geminiKey}
                    onChange={(e) => {
                      setGeminiKey(e.target.value);
                      localStorage.setItem("quickstock_gemini_key", e.target.value);
                    }}
                    className="w-full bg-zinc-50 dark:bg-[#121217] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-850 dark:text-zinc-200 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5">
                    Required to unlock AI Copilot chat, manufacturers email drafting, and Imagen graphics generators. 
                    Your key is stored securely in your local browser window.
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-[#0B0B0E] p-6 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-500 border-b border-zinc-200 dark:border-zinc-800 pb-2">Developer Operations Area</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Reset System Database Connection</h4>
                    <p className="text-[10px] text-zinc-450 dark:text-zinc-500 mt-0.5">Disconnects application from current Firebase configuration and returns to config wizard.</p>
                  </div>
                  <button 
                    onClick={clearFirebaseConfig}
                    className="px-4 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-250 dark:border-rose-800/30 text-xs font-bold transition-all"
                  >
                    Clear Database Configuration
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        <footer className="mt-auto pt-6 border-t border-zinc-200 dark:border-zinc-800/60 text-center text-[10px] text-zinc-500 dark:text-zinc-650">
          QuickStock Operations Control Hub &copy; {new Date().getFullYear()} &middot; Integrated with real-time Firestore database and Gemini models.
        </footer>

      </main>

      {/* ================= FLOATING AI CO-PILOT CHAT CIRCLE AND DRAWER ================= */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {isChatOpen && isPro && (
          <div className="w-80 md:w-96 bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-4 transform scale-100 transition-all animate-fade-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 animate-pulse" />
                <div>
                  <h3 className="text-xs font-bold tracking-wide">QuickStock Copilot</h3>
                  <p className="text-[9px] text-zinc-100/90 font-medium">Powered by Gemini Realtime API</p>
                </div>
              </div>
              <button 
                onClick={() => setIsChatOpen(false)}
                className="p-1 rounded-full hover:bg-white/10 transition-colors text-white"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Message Thread */}
            <div className="flex-1 p-4 h-64 overflow-y-auto space-y-3.5 bg-zinc-50/50 dark:bg-zinc-950/70 select-text">
              {chatMessages.map((msg, index) => (
                <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.sender === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-850 dark:text-zinc-200 rounded-tl-none shadow-sm'
                  }`}>
                    {msg.sender !== 'user' && (
                      <span className="block text-[8px] font-bold text-purple-600 dark:text-purple-400 mb-0.5 uppercase tracking-wider">AI Assistant</span>
                    )}
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    <span className="block text-[8px] text-zinc-400 dark:text-zinc-550 text-right mt-1 font-mono">{msg.time}</span>
                  </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl rounded-tl-none px-3 py-2 text-xs text-zinc-455 shadow-sm">
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-bounce" style={{animationDelay:'0ms'}} />
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-bounce" style={{animationDelay:'150ms'}} />
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-bounce" style={{animationDelay:'300ms'}} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Helper Quick Prompts */}
            <div className="px-3 py-2 border-t border-zinc-200 dark:border-[#27272A]/60 bg-zinc-50 dark:bg-[#0F0F13] flex flex-wrap gap-1.5">
              <button 
                onClick={() => handleSuggestionClick("Run diagnostic critical safety stock audit.")}
                className="text-[9px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-blue-500 dark:hover:border-blue-500 text-zinc-700 dark:text-zinc-300 px-2 py-1 rounded transition-colors text-left"
              >
                📊 Safety Audit
              </button>
              <button 
                onClick={() => handleSuggestionClick("Draft replenishment strategies for slow-moving lines.")}
                className="text-[9px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-purple-500 dark:hover:border-purple-500 text-zinc-700 dark:text-zinc-300 px-2 py-1 rounded transition-colors text-left"
              >
                💡 Slow Stock tips
              </button>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center gap-2">
              <input 
                type="text" 
                placeholder={geminiKey ? "Ask me about stock velocity..." : "Set Gemini Key in settings first."}
                value={chatInput}
                disabled={!geminiKey}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 bg-zinc-50 dark:bg-[#121217] text-xs text-zinc-850 dark:text-zinc-200 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-55"
              />
              <button 
                type="submit"
                disabled={!geminiKey}
                className="p-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-md active:scale-95 transition-transform disabled:opacity-45"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        )}

        {/* Chat circle button */}
        <button 
          onClick={() => {
            if (!isPro) {
              setShowPaywallModal(true);
            } else {
              setIsChatOpen(!isChatOpen);
              if (!isChatOpen) {
                addLog("Opened Gemini AI Interactive assistant module", "info");
              }
            }
          }}
          className={`h-14 w-14 rounded-full flex items-center justify-center text-white shadow-2xl relative overflow-hidden transition-transform active:scale-95 group ${
            isChatOpen && isPro
              ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-white' 
              : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-[0_4px_15px_rgba(99,102,241,0.4)]'
          }`}
          title="Toggle QuickStock Chat"
        >
          {(!isChatOpen || !isPro) && (
            <span className="absolute inset-0 h-full w-full rounded-full bg-blue-500/20 animate-ping z-0" />
          )}
          {isChatOpen && isPro ? (
            <X className="h-5 w-5 relative z-10 text-zinc-850 dark:text-white" />
          ) : (
            <>
              {!isPro ? (
                <Lock className="h-5 w-5 relative z-10" />
              ) : (
                <MessageSquare className="h-5 w-5 relative z-10" />
              )}
            </>
          )}
        </button>
      </div>

      {/* ================= MODAL: UPGRADE PAYWALL MODAL ================= */}
      {showPaywallModal && (
        <div className="fixed inset-0 bg-[#000]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6 relative animate-fade-in text-zinc-800 dark:text-zinc-100">
            <button onClick={() => setShowPaywallModal(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-800 dark:hover:text-white">
              <X className="h-4.5 w-4.5" />
            </button>
            <div className="text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto shadow-md">
                <Sparkles className="h-6 w-6 animate-pulse" />
              </div>
              <h3 className="text-sm font-bold">Enterprise Pro Upgrade</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                The Holt-Winters Smoothing Engine and Live AI Copilot are available exclusively on the **Enterprise Pro** plan.
              </p>
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl text-[10px] text-zinc-500 dark:text-zinc-450 text-left space-y-1">
                <p className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-500" /> Real-time triple smoothed forecasting</p>
                <p className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-500" /> Interactive logistics copilot queries</p>
                <p className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-500" /> Automated PO documentation and drafts</p>
              </div>
              <button
                onClick={async () => {
                  if (isAdmin) {
                    try {
                      const whRef = doc(db, "warehouses", activeWarehouseKey);
                      await updateDoc(whRef, { isPro: true });
                      setShowPaywallModal(false);
                      showToast("Operational tier successfully upgraded!", "success");
                      await addLog("Upgraded operational tier to Enterprise Pro via paywall checkout", "success");
                    } catch (err) {
                      console.error(err);
                    }
                  } else {
                    showToast("Upgrade requires Administrator authorization.", "error");
                  }
                }}
                className="w-full py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-xs font-bold rounded-lg shadow-md hover:scale-[1.01] transition-all"
              >
                {isAdmin ? "Upgrade Context Now" : "Request Admin Upgrade"}
              </button>
              {!isAdmin && (
                <p className="text-[9px] text-zinc-450 dark:text-zinc-550 italic">Please contact your system administrator to enable Pro features.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: GLOBAL COMMAND PALETTE (CMD+K) ================= */}
      {showCommandPalette && (
        <div className="fixed inset-0 bg-[#000]/80 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-20">
          <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
            
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3 bg-zinc-50 dark:bg-zinc-950/60">
              <Terminal className="h-4.5 w-4.5 text-blue-500 dark:text-blue-400" />
              <input 
                type="text" 
                placeholder="Type a command or warehouse action..." 
                value={commandSearch}
                onChange={(e) => setCommandSearch(e.target.value)}
                className="flex-1 bg-transparent border-none text-xs text-zinc-850 dark:text-zinc-100 focus:outline-none focus:ring-0"
                autoFocus
              />
              <span className="text-[10px] bg-zinc-200 dark:bg-zinc-900 px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-500">ESC</span>
            </div>

            <div className="p-2 max-h-72 overflow-y-auto space-y-1">
              <div className="px-3 py-1.5 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">System Command Registry</div>
              {commandActions.map((item, idx) => (
                <button 
                  key={idx}
                  onClick={() => {
                    item.action();
                    setShowCommandPalette(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition-all group"
                >
                  <span className="flex items-center gap-2">
                    <ChevronRight className="h-3 w-3 text-zinc-400 dark:text-zinc-500 group-hover:translate-x-0.5 transition-transform" />
                    {item.name}
                  </span>
                  <span className="text-[9px] bg-zinc-100 dark:bg-zinc-900 text-zinc-500 group-hover:text-blue-500 px-2 py-0.5 rounded font-mono uppercase">
                    {item.category}
                  </span>
                </button>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* ================= MODAL: IMAGEN PROMOTIONAL GRAPHICS BANNER GENERATOR ================= */}
      {showPromoModal && generatingPromoItem && (
        <div className="fixed inset-0 bg-[#000]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4.5 w-4.5 text-purple-650 dark:text-purple-400" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Imagen AI Ad Generator</h3>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Generate professional promotional catalog banners for slow items.</p>
                </div>
              </div>
              <button onClick={() => setShowPromoModal(false)} className="text-zinc-500 hover:text-zinc-800 dark:hover:text-white">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] text-zinc-505 dark:text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Promotion Style Prompt</label>
                <textarea 
                  value={customPromoStyle}
                  onChange={(e) => setCustomPromoStyle(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-[#121217] border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 text-xs text-zinc-850 dark:text-zinc-100 focus:outline-none focus:border-purple-550 min-h-[60px]"
                />
              </div>

              {/* Render area for the generated image */}
              <div className="bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-xl overflow-hidden h-60 flex items-center justify-center relative">
                {isGeneratingImage ? (
                  <div className="text-center space-y-3">
                    <Sparkles className="h-8 w-8 text-purple-600 dark:text-purple-500 animate-spin mx-auto" />
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Running synthesis equations on Imagen core...</p>
                  </div>
                ) : promoImageResult ? (
                  <img src={promoImageResult} alt="AI Promo Banner" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-6 text-zinc-500">
                    <ImageIcon className="h-8 w-8 text-zinc-450 dark:text-zinc-650 mx-auto mb-2" />
                    <p className="text-xs">Select generate to compile catalog promo banner.</p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-zinc-250 dark:border-zinc-800 flex justify-between items-center">
                <p className="text-[10px] text-zinc-500">Asset: <span className="font-bold text-zinc-700 dark:text-zinc-300">{generatingPromoItem.name}</span></p>
                <button 
                  onClick={() => generateAdBanner(generatingPromoItem)}
                  disabled={isGeneratingImage}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-xs font-bold text-white rounded-lg flex items-center gap-1"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Generate Graphic Banner</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ================= MODAL: AUTOMATED PO EXPORT MODAL ================= */}
      {showPOExportModal && activePOData && (
        <div className="fixed inset-0 bg-[#000]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Printer className="text-blue-500 dark:text-blue-400 h-4 w-4" />
                  <span>Purchase Order Verification Document</span>
                </h3>
                <p className="text-[10px] text-zinc-550 dark:text-zinc-400">Standard compliant log dispatched based on safety thresholds.</p>
              </div>
              <button onClick={() => setShowPOExportModal(false)} className="text-zinc-555 hover:text-zinc-800 dark:hover:text-white">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              
              <div className="p-5 bg-zinc-50 dark:bg-white text-slate-900 rounded-lg shadow-inner text-left font-mono text-[11px] leading-relaxed select-text border border-zinc-300">
                <div className="flex justify-between items-start border-b border-slate-300 pb-3 mb-4">
                  <div>
                    <h2 className="text-xs font-black tracking-tight uppercase text-blue-800">QUICKSTOCK CORE PO</h2>
                    <p className="text-[9px] text-slate-500">System Sourced Logistics</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">Doc #: {activePOData.poNumber}</p>
                    <p className="text-[9px] text-slate-500">Issued: {activePOData.date}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p><strong>Fulfillment Target:</strong> {activePOData.warehouse} ({activePOData.location})</p>
                  <p><strong>SKU Sourced:</strong> {activePOData.item} (SKU: {activePOData.sku})</p>
                  <p><strong>Quantity Ordered:</strong> {activePOData.qty} units</p>
                  <p><strong>Negotiated Unit cost:</strong> ₹{activePOData.costRate.toLocaleString('en-IN')}/unit</p>
                  <p><strong>Justification Code:</strong> {activePOData.forecastJustification}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-300 flex justify-between items-center text-xs font-black text-slate-900">
                  <span>Grand Net Value:</span>
                  <span>₹{activePOData.grandTotal.toLocaleString('en-IN')} INR</span>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800/60">
                <button 
                  type="button" 
                  onClick={() => setShowPOExportModal(false)}
                  className="px-4 py-2 bg-transparent text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-white"
                >
                  Discard Draft
                </button>
                <button 
                  type="button"
                  onClick={commitPurchaseOrder}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-xs font-bold text-white rounded-lg shadow-lg flex items-center gap-1.5 hover:scale-[1.01]"
                >
                  <Check className="h-4 w-4" />
                  <span>Confirm and Dispatch Order</span>
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ================= MODAL: REGISTER CATALOG SKU LINE ================= */}
      {showAddModal && (
        <div className="fixed inset-0 bg-[#000]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            
            <div className="bg-zinc-50 dark:bg-zinc-950 p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <Database className="h-4.5 w-4.5 text-blue-500 dark:text-blue-400" /> Register Catalog Entry
                </h3>
                <p className="text-[10px] text-zinc-555 dark:text-zinc-400 mt-0.5">Input parameters to track active inventory indices.</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-500 hover:text-zinc-800 dark:hover:text-white">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <form onSubmit={handleAddNewProduct} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] text-zinc-550 dark:text-zinc-400 font-bold uppercase tracking-wide mb-1.5">Product Name</label>
                <input 
                  type="text" 
                  placeholder="e.g., Nova Smart Charger" 
                  value={newProduct.name}
                  onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-zinc-50 dark:bg-[#121217] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-zinc-550 dark:text-zinc-400 font-bold uppercase tracking-wide mb-1.5">SKU ID</label>
                  <input 
                    type="text" 
                    placeholder="e.g., NV-109" 
                    value={newProduct.sku}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, sku: e.target.value }))}
                    className="w-full bg-zinc-50 dark:bg-[#121217] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-550 dark:text-zinc-400 font-bold uppercase tracking-wide mb-1.5">Category</label>
                  <select 
                    value={newProduct.category}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full bg-zinc-50 dark:bg-[#121217] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option className="bg-white dark:bg-zinc-900 text-zinc-850 dark:text-zinc-250">Electronics</option>
                    <option className="bg-white dark:bg-zinc-900 text-zinc-850 dark:text-zinc-250">Smart Home</option>
                    <option className="bg-white dark:bg-zinc-900 text-zinc-850 dark:text-zinc-250">Networking</option>
                    <option className="bg-white dark:bg-zinc-900 text-zinc-850 dark:text-zinc-250">Accessories</option>
                    <option className="bg-white dark:bg-zinc-900 text-zinc-850 dark:text-zinc-250">Wearables</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-zinc-550 dark:text-zinc-400 font-bold uppercase tracking-wide mb-1.5">Initial Units</label>
                  <input 
                    type="number" 
                    placeholder="e.g., 25" 
                    value={newProduct.stock}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, stock: e.target.value }))}
                    className="w-full bg-zinc-50 dark:bg-[#121217] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-550 dark:text-zinc-400 font-bold uppercase tracking-wide mb-1.5">Max Cap</label>
                  <input 
                    type="number" 
                    placeholder="e.g., 100" 
                    value={newProduct.maxStock}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, maxStock: e.target.value }))}
                    className="w-full bg-zinc-50 dark:bg-[#121217] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-550 dark:text-zinc-400 font-bold uppercase tracking-wide mb-1.5">Unit Price (₹)</label>
                  <input 
                    type="number" 
                    step="1" 
                    placeholder="e.g., 4000" 
                    value={newProduct.price}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, price: e.target.value }))}
                    className="w-full bg-zinc-50 dark:bg-[#121217] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800/60">
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-transparent text-xs font-semibold text-zinc-505 hover:text-zinc-800 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white rounded-lg shadow-lg"
                >
                  Commit Product Line
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ================= MODAL: GEMINI EMAIL AUTO-DRAFT WRITER ================= */}
      {showEmailModal && draftingProduct && (
        <div className="fixed inset-0 bg-[#000]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
            
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <FileText className="h-4.5 w-4.5 text-blue-500 dark:text-blue-400 animate-pulse" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Gemini Supplier Email Writer</h3>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Restock procurement mail drafted dynamically for {draftingProduct.sku}</p>
                </div>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="text-zinc-500 hover:text-zinc-850 dark:hover:text-white">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 font-mono text-xs leading-relaxed max-h-80 overflow-y-auto select-text text-zinc-700 dark:text-zinc-300">
                {isGeneratingEmail ? (
                  <div className="text-center py-12 space-y-3">
                    <Sparkles className="h-6 w-6 text-blue-500 animate-spin mx-auto" />
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Gemini LLM drafting B2B communication parameters...</p>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap">{generatedEmail}</pre>
                )}
              </div>

              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
                <button 
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 bg-zinc-200 dark:bg-zinc-900 hover:bg-zinc-300 dark:hover:bg-zinc-800 text-xs font-bold text-zinc-650 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg"
                >
                  Close Draft
                </button>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(generatedEmail);
                    showToast("Draft copied to clipboard!", "success");
                  }}
                  disabled={isGeneratingEmail}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white rounded-lg flex items-center gap-1.5"
                >
                  <Download className="h-4 w-4" />
                  <span>Copy to Clipboard</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ================= TOASTS RENDERER ================= */}
      <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className="bg-white dark:bg-[#0B0B0E] border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 pointer-events-auto animate-bounce"
          >
            <div className={`h-2.5 w-2.5 rounded-full ${
              toast.type === 'error' ? 'bg-rose-500' : toast.type === 'info' ? 'bg-blue-400' : 'bg-emerald-500'
            }`} />
            <span className="font-semibold">{toast.message}</span>
            <button 
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="ml-3 text-zinc-400 dark:text-zinc-505 hover:text-zinc-900 dark:hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}
