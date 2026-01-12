
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
            
            request.onerror = (event) => {
                console.error("IndexedDB Open Error:", (event.target as any).error);
                reject((event.target as any).error);
            };
            
            request.onsuccess = (event) => {
                resolve((event.target as IDBOpenDBRequest).result);
            };
            
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    },

    async save(key: string, data: any): Promise<void> {
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.storeName, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                
                // Deep clone/sanitize to ensure no non-clonable types (like Functions) are passed
                const safeData = JSON.parse(JSON.stringify(data));
                
                const request = store.put(safeData, key);
                
                request.onsuccess = () => resolve();
                request.onerror = (event) => {
                    console.error("IndexedDB Save Error:", (event.target as any).error);
                    reject((event.target as any).error);
                };
            });
        } catch (e) {
            console.warn("IndexedDB failed, attempting LocalStorage fallback...", e);
            try {
                 localStorage.setItem(key, JSON.stringify(data));
            } catch (lsError) {
                console.error("LocalStorage failed (Quota Exceeded):", lsError);
                throw new Error("Erro Crítico: Não há espaço suficiente no navegador para salvar os dados. Tente limpar o cache ou usar outro navegador.");
            }
        }
    },

    async load(key: string): Promise<any> {
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.storeName, 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(key);
                
                request.onsuccess = () => {
                    // If result is undefined, try localStorage (migration path)
                    if (request.result === undefined) {
                        console.log("IndexedDB empty for key, checking LocalStorage...");
                        const ls = localStorage.getItem(key);
                        resolve(ls ? JSON.parse(ls) : null);
                    } else {
                        resolve(request.result);
                    }
                };
                request.onerror = (event) => reject((event.target as any).error);
            });
        } catch (e) {
            console.warn("IndexedDB load failed, trying LocalStorage", e);
            const ls = localStorage.getItem(key);
            return ls ? JSON.parse(ls) : null;
        }
    }
};
