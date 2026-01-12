
export const StorageService = {
    dbName: 'EscalaFacilDB',
    storeName: 'AppState',
    version: 1,

    async init(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error("IndexedDB not supported"));
                return;
            }
            const request = indexedDB.open(this.dbName, this.version);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    },

    async save(key: string, data: any): Promise<void> {
        // First try IndexedDB
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.storeName, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.put(data, key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error("IndexedDB Save Error, trying LocalStorage fallback", e);
            // Fallback to LocalStorage (likely to fail for large data, but standard fallback)
            try {
                 localStorage.setItem(key, JSON.stringify(data));
            } catch (lsError) {
                throw new Error("Armazenamento cheio (Quota Exceeded). O volume de dados excede o limite do navegador. Tente exportar um relatório ou usar um navegador com maior capacidade.");
            }
        }
    },

    async load(key: string): Promise<any> {
        // Try IndexedDB first
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.storeName, 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.warn("IndexedDB Load Error, trying LocalStorage", e);
            // Fallback LocalStorage
            const ls = localStorage.getItem(key);
            return ls ? JSON.parse(ls) : null;
        }
    }
};
