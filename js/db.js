/* IndexedDB Wrapper — SriKP Fitness
   ---------------------------------- */
(function () {
  const STORES = [
    { name: 'admins',    key: 'id', indexes: [{ name: 'username', keyPath: 'username', unique: true }] },
    { name: 'members',   key: 'id', indexes: [
        { name: 'memberCode', keyPath: 'memberCode', unique: true },
        { name: 'phone', keyPath: 'phone', unique: false },
        { name: 'status', keyPath: 'status', unique: false }
      ] },
    { name: 'plans',     key: 'id', indexes: [{ name: 'name', keyPath: 'name', unique: true }] },
    { name: 'payments',  key: 'id', indexes: [
        { name: 'memberId', keyPath: 'memberId', unique: false },
        { name: 'paymentDate', keyPath: 'paymentDate', unique: false },
        { name: 'receiptNo', keyPath: 'receiptNo', unique: true }
      ] },
    { name: 'attendance', key: 'id', indexes: [
        { name: 'memberId', keyPath: 'memberId', unique: false },
        { name: 'date', keyPath: 'date', unique: false }
      ] },
    { name: 'expenses',  key: 'id', indexes: [{ name: 'date', keyPath: 'date', unique: false }] },
    { name: 'settings',  key: 'key', indexes: [] },
    { name: 'snapshots', key: 'id', indexes: [{ name: 'createdAt', keyPath: 'createdAt', unique: false }] }
  ];

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(APP_CONFIG.dbName, APP_CONFIG.dbVersion);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        STORES.forEach(s => {
          let store;
          if (!db.objectStoreNames.contains(s.name)) {
            store = db.createObjectStore(s.name, { keyPath: s.key });
          } else {
            store = e.target.transaction.objectStore(s.name);
          }
          (s.indexes || []).forEach(ix => {
            if (!store.indexNames.contains(ix.name)) {
              store.createIndex(ix.name, ix.keyPath, { unique: !!ix.unique });
            }
          });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  async function tx(storeName, mode) {
    const db = await openDB();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function req2promise(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  const DB = {
    uid,
    open: openDB,
    async put(storeName, obj) {
      if (!obj.id && !obj.key) obj.id = uid();
      const store = await tx(storeName, 'readwrite');
      await req2promise(store.put(obj));
      return obj;
    },
    async add(storeName, obj) {
      if (!obj.id && !obj.key) obj.id = uid();
      const store = await tx(storeName, 'readwrite');
      await req2promise(store.add(obj));
      return obj;
    },
    async get(storeName, id) {
      const store = await tx(storeName, 'readonly');
      return req2promise(store.get(id));
    },
    async getByIndex(storeName, indexName, value) {
      const store = await tx(storeName, 'readonly');
      const ix = store.index(indexName);
      return req2promise(ix.get(value));
    },
    async all(storeName) {
      const store = await tx(storeName, 'readonly');
      return req2promise(store.getAll());
    },
    async remove(storeName, id) {
      const store = await tx(storeName, 'readwrite');
      return req2promise(store.delete(id));
    },
    async clear(storeName) {
      const store = await tx(storeName, 'readwrite');
      return req2promise(store.clear());
    },
    async count(storeName) {
      const store = await tx(storeName, 'readonly');
      return req2promise(store.count());
    },
    STORE_NAMES: STORES.map(s => s.name)
  };

  window.DB = DB;
})();
