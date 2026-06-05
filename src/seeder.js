import { doc, setDoc, getDocs, collection, addDoc, writeBatch } from "firebase/firestore";

const INITIAL_WAREHOUSES = {
  newark: {
    name: "Newark Hub - Main",
    location: "New Jersey, USA",
    leadTimeDays: 7,
    leadTimeStdDev: 1.2,
    targetServiceLevel: 0.95,
    deadStockThresholdDays: 90,
    hwAlpha: 0.20,
    hwBeta: 0.10,
    hwGamma: 0.30,
    isPro: true
  },
  la_east: {
    name: "LA East Depot",
    location: "California, USA",
    leadTimeDays: 10,
    leadTimeStdDev: 2.1,
    targetServiceLevel: 0.95,
    deadStockThresholdDays: 90,
    hwAlpha: 0.20,
    hwBeta: 0.10,
    hwGamma: 0.30,
    isPro: true
  },
  frankfurt: {
    name: "Frankfurt Air Cargo Center",
    location: "Frankfurt, Germany",
    leadTimeDays: 5,
    leadTimeStdDev: 0.6,
    targetServiceLevel: 0.95,
    deadStockThresholdDays: 90,
    hwAlpha: 0.20,
    hwBeta: 0.10,
    hwGamma: 0.30,
    isPro: true
  }
};

const INITIAL_INVENTORY = [
  // Newark Inventory (Scaled by ~80 to INR)
  { warehouseId: 'newark', name: 'SmartHub Pro', sku: 'SH-901', category: 'Electronics', stock: 12, maxStock: 150, price: 10399.00, dailyDemand: 4.2, demandStdDev: 1.1, deadStockDays: 14 },
  { warehouseId: 'newark', name: 'AeroGlow Bulb', sku: 'AG-204', category: 'Smart Home', stock: 145, maxStock: 200, price: 1599.00, dailyDemand: 8.5, demandStdDev: 2.3, deadStockDays: 5 },
  { warehouseId: 'newark', name: 'Nebula Router', sku: 'NR-505', category: 'Networking', stock: 8, maxStock: 80, price: 15160.00, dailyDemand: 2.1, demandStdDev: 0.9, deadStockDays: 28 },
  { warehouseId: 'newark', name: 'Quantum Pad', sku: 'QP-112', category: 'Accessories', stock: 14, maxStock: 120, price: 3999.00, dailyDemand: 1.5, demandStdDev: 1.8, deadStockDays: 95 }, 
  { warehouseId: 'newark', name: 'SyncBand v2', sku: 'SB-883', category: 'Wearables', stock: 230, maxStock: 300, price: 6399.00, dailyDemand: 12.0, demandStdDev: 3.1, deadStockDays: 2 },
  { warehouseId: 'newark', name: 'Apex Charger', sku: 'AC-302', category: 'Accessories', stock: 5, maxStock: 100, price: 2399.00, dailyDemand: 3.5, demandStdDev: 1.2, deadStockDays: 19 },
  { warehouseId: 'newark', name: 'Ember Smart Mug', sku: 'EM-401', category: 'Smart Home', stock: 67, maxStock: 150, price: 7996.00, dailyDemand: 5.0, demandStdDev: 1.6, deadStockDays: 8 },
  { warehouseId: 'newark', name: 'Vortex VR Headset', sku: 'VX-770', category: 'Electronics', stock: 11, maxStock: 50, price: 39920.00, dailyDemand: 1.8, demandStdDev: 0.5, deadStockDays: 120 },

  // LA East Inventory
  { warehouseId: 'la_east', name: 'SmartHub Pro', sku: 'SH-901', category: 'Electronics', stock: 95, maxStock: 150, price: 9999.00, dailyDemand: 3.8, demandStdDev: 0.9, deadStockDays: 3 },
  { warehouseId: 'la_east', name: 'AeroGlow Bulb', sku: 'AG-204', category: 'Smart Home', stock: 12, maxStock: 250, price: 1480.00, dailyDemand: 11.2, demandStdDev: 3.5, deadStockDays: 4 },
  { warehouseId: 'la_east', name: 'Nebula Router', sku: 'NR-505', category: 'Networking', stock: 45, maxStock: 100, price: 14800.00, dailyDemand: 3.0, demandStdDev: 1.2, deadStockDays: 12 },
  { warehouseId: 'la_east', name: 'Quantum Pad', sku: 'QP-112', category: 'Accessories', stock: 110, maxStock: 120, price: 3600.00, dailyDemand: 0.8, demandStdDev: 0.4, deadStockDays: 110 }, 
  { warehouseId: 'la_east', name: 'SyncBand v2', sku: 'SB-883', category: 'Wearables', stock: 40, maxStock: 350, price: 5999.00, dailyDemand: 15.1, demandStdDev: 4.2, deadStockDays: 1 },
  { warehouseId: 'la_east', name: 'Apex Charger', sku: 'AC-302', category: 'Accessories', stock: 88, maxStock: 100, price: 2200.00, dailyDemand: 5.4, demandStdDev: 1.8, deadStockDays: 7 },

  // Frankfurt Inventory
  { warehouseId: 'frankfurt', name: 'SmartHub Pro', sku: 'SH-901', category: 'Electronics', stock: 40, maxStock: 180, price: 11199.00, dailyDemand: 5.1, demandStdDev: 1.3, deadStockDays: 6 },
  { warehouseId: 'frankfurt', name: 'AeroGlow Bulb', sku: 'AG-204', category: 'Smart Home', stock: 195, maxStock: 300, price: 1839.00, dailyDemand: 9.8, demandStdDev: 2.0, deadStockDays: 2 },
  { warehouseId: 'frankfurt', name: 'Nebula Router', sku: 'NR-505', category: 'Networking', stock: 4, maxStock: 90, price: 15999.00, dailyDemand: 2.5, demandStdDev: 1.1, deadStockDays: 45 }, 
  { warehouseId: 'frankfurt', name: 'Quantum Pad', sku: 'QP-112', category: 'Accessories', stock: 85, maxStock: 150, price: 4399.00, dailyDemand: 2.0, demandStdDev: 0.7, deadStockDays: 14 },
  { warehouseId: 'frankfurt', name: 'SyncBand v2', sku: 'SB-883', category: 'Wearables', stock: 15, maxStock: 250, price: 7199.00, dailyDemand: 10.4, demandStdDev: 2.9, deadStockDays: 3 }
];

export const seedDatabaseIfEmpty = async (db) => {
  try {
    // Check if warehouses are already seeded
    const warehousesSnap = await getDocs(collection(db, "warehouses"));
    
    if (warehousesSnap.empty) {
      console.log("Seeding warehouses database...");
      const batch = writeBatch(db);
      
      Object.entries(INITIAL_WAREHOUSES).forEach(([key, data]) => {
        const docRef = doc(db, "warehouses", key);
        batch.set(docRef, data);
      });
      
      await batch.commit();
      console.log("Seeded warehouses successfully.");
    }

    // Check if inventory is seeded
    const inventorySnap = await getDocs(collection(db, "inventory"));
    if (inventorySnap.empty) {
      console.log("Seeding inventory database...");
      const batch = writeBatch(db);
      
      INITIAL_INVENTORY.forEach((item, index) => {
        const docId = `${item.warehouseId}_${item.sku}`;
        const docRef = doc(db, "inventory", docId);
        
        batch.set(docRef, {
          id: index + 1,
          name: item.name,
          sku: item.sku,
          category: item.category,
          stock: item.stock,
          maxStock: item.maxStock,
          price: item.price,
          dailyDemand: item.dailyDemand,
          demandStdDev: item.demandStdDev,
          deadStockDays: item.deadStockDays,
          warehouseId: item.warehouseId
        });
      });
      
      await batch.commit();
      console.log("Seeded inventory successfully.");
    }

    // Seed default logs if empty
    const logsSnap = await getDocs(collection(db, "logs"));
    if (logsSnap.empty) {
      const initialLogs = [
        { timestamp: "12:00:00", text: "QuickStock Realtime Core Initialized on Cloud Nodes.", type: "system", createdAt: new Date().toISOString() },
        { timestamp: "12:01:05", text: "Connected securely to Firestore primary instance.", type: "success", createdAt: new Date().toISOString() }
      ];
      for (const log of initialLogs) {
        await addDoc(collection(db, "logs"), log);
      }
    }

    // Seed default notifications if empty
    const notifSnap = await getDocs(collection(db, "notifications"));
    if (notifSnap.empty) {
      const initialNotifs = [
        { text: "AI detected abnormal demand spike for 'SmartHub Pro'", time: "5m ago", unread: true, createdAt: new Date().toISOString() },
        { text: "Customs backup at Port of Newark: safety standards increased", time: "1h ago", unread: true, createdAt: new Date().toISOString() }
      ];
      for (const notif of initialNotifs) {
        await addDoc(collection(db, "notifications"), notif);
      }
    }
  } catch (error) {
    console.error("Error seeding Firestore database:", error);
  }
};
