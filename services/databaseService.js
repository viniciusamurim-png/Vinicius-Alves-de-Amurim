
import { INITIAL_EMPLOYEES, INITIAL_SHIFTS, INITIAL_USERS } from '../constants.js';
import { db } from './firebaseConfig.js';
import { doc, getDoc, setDoc } from "firebase/firestore";

// Coleção principal para dados globais da empresa
const DATA_COLLECTION = 'company_data';
// Coleção para escalas mensais
const SCHEDULES_COLLECTION = 'schedules';

export const DatabaseService = {
    // --- EMPLOYEES ---
    async loadEmployees() {
        if (!db) return INITIAL_EMPLOYEES; // Segurança: Retorna dados locais se Firebase off

        try {
            const docRef = doc(db, DATA_COLLECTION, 'employees');
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data().list;
            } else {
                await this.saveEmployees(INITIAL_EMPLOYEES);
                return INITIAL_EMPLOYEES;
            }
        } catch (error) {
            console.error("Erro ao carregar colaboradores do Firestore:", error);
            return INITIAL_EMPLOYEES;
        }
    },

    async saveEmployees(employees) {
        if (!db) { 
            console.warn("Salvamento ignorado: Firebase não configurado."); 
            return; 
        }

        try {
            await setDoc(doc(db, DATA_COLLECTION, 'employees'), { list: employees });
        } catch (error) {
            console.error("Erro ao salvar colaboradores:", error);
            alert("Erro ao salvar no banco de dados.");
        }
    },

    // --- USERS ---
    async loadUsers() {
        if (!db) return INITIAL_USERS;

        try {
            const docRef = doc(db, DATA_COLLECTION, 'users');
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data().list;
            } else {
                await this.saveUsers(INITIAL_USERS);
                return INITIAL_USERS;
            }
        } catch (error) {
            console.error("Erro ao carregar usuários:", error);
            return INITIAL_USERS;
        }
    },

    async saveUsers(users) {
        if (!db) return;
        try {
            await setDoc(doc(db, DATA_COLLECTION, 'users'), { list: users });
        } catch (error) {
            console.error("Erro ao salvar usuários:", error);
        }
    },

    // --- SHIFTS ---
    async loadShifts() {
        if (!db) return INITIAL_SHIFTS;

        try {
            const docRef = doc(db, DATA_COLLECTION, 'shifts');
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data().list;
            } else {
                await this.saveShifts(INITIAL_SHIFTS);
                return INITIAL_SHIFTS;
            }
        } catch (error) {
            console.error("Erro ao carregar turnos:", error);
            return INITIAL_SHIFTS;
        }
    },

    async saveShifts(shifts) {
        if (!db) return;
        try {
            await setDoc(doc(db, DATA_COLLECTION, 'shifts'), { list: shifts });
        } catch (error) {
            console.error("Erro ao salvar turnos:", error);
        }
    },

    // --- SETTINGS ---
    async loadSettings() {
        if (!db) return { aiRules: null, staffing: null };

        try {
            const docRef = doc(db, DATA_COLLECTION, 'settings');
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data();
            }
            return { aiRules: null, staffing: null };
        } catch (error) {
            console.error("Erro ao carregar configurações:", error);
            return { aiRules: null, staffing: null };
        }
    },

    async saveSettings(aiRules, staffing) {
        if (!db) return;
        try {
            await setDoc(doc(db, DATA_COLLECTION, 'settings'), { aiRules, staffing });
        } catch (error) {
            console.error("Erro ao salvar configurações:", error);
        }
    },

    // --- MONTHLY SCHEDULES ---
    async loadMonthlySchedule(month, year) {
        // Retorno padrão vazio se não houver DB
        const emptySchedule = { month, year, assignments: {}, attachments: {}, comments: {} };
        if (!db) return emptySchedule;

        const docId = `schedule_${year}_${month}`; 
        try {
            const docRef = doc(db, SCHEDULES_COLLECTION, docId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data();
            }
            return emptySchedule;
        } catch (error) {
            console.error("Erro ao carregar escala:", error);
            return emptySchedule;
        }
    },

    async saveMonthlySchedule(schedule) {
        if (!db) { 
            alert("Firebase não configurado! Dados não salvos na nuvem."); 
            return; 
        }

        const docId = `schedule_${schedule.year}_${schedule.month}`;
        try {
            const cleanSchedule = JSON.parse(JSON.stringify(schedule));
            await setDoc(doc(db, SCHEDULES_COLLECTION, docId), cleanSchedule);
        } catch (error) {
            console.error("Erro ao salvar escala:", error);
            throw error;
        }
    }
};
