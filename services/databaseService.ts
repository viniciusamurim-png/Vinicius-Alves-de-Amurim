
import { Employee, MonthlySchedule, Shift, AIRulesConfig, StaffingConfig } from '../types';
import { INITIAL_EMPLOYEES, INITIAL_SHIFTS } from '../constants';

// Keys Prefix
const DB_PREFIX = 'DB_v1_';

// "Tables"
const TBL_EMPLOYEES = `${DB_PREFIX}employees`;
const TBL_SHIFTS = `${DB_PREFIX}shifts`;
const TBL_SETTINGS = `${DB_PREFIX}settings`;

// Helper to simulate network latency (optional, currently 0 for speed)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const DatabaseService = {
    // --- EMPLOYEES (Loaded once) ---
    async loadEmployees(): Promise<Employee[]> {
        const data = localStorage.getItem(TBL_EMPLOYEES);
        if (data) return JSON.parse(data);
        // Seed initial
        return INITIAL_EMPLOYEES;
    },

    async saveEmployees(employees: Employee[]): Promise<void> {
        localStorage.setItem(TBL_EMPLOYEES, JSON.stringify(employees));
    },

    // --- SHIFTS & SETTINGS ---
    async loadShifts(): Promise<Shift[]> {
        const data = localStorage.getItem(TBL_SHIFTS);
        return data ? JSON.parse(data) : INITIAL_SHIFTS;
    },

    async saveShifts(shifts: Shift[]): Promise<void> {
        localStorage.setItem(TBL_SHIFTS, JSON.stringify(shifts));
    },

    async loadSettings(): Promise<{ aiRules: AIRulesConfig | null, staffing: StaffingConfig | null }> {
        const data = localStorage.getItem(TBL_SETTINGS);
        if (data) return JSON.parse(data);
        return { aiRules: null, staffing: null };
    },

    async saveSettings(aiRules: AIRulesConfig, staffing: StaffingConfig): Promise<void> {
        localStorage.setItem(TBL_SETTINGS, JSON.stringify({ aiRules, staffing }));
    },

    // --- SCHEDULES (Sharded by Month - The Performance Key) ---
    // Instead of one giant file, we save 'DB_v1_schedule_2025_09', 'DB_v1_schedule_2025_10', etc.
    async loadMonthlySchedule(month: number, year: number): Promise<MonthlySchedule> {
        const key = `${DB_PREFIX}schedule_${year}_${month}`;
        const data = localStorage.getItem(key);
        
        if (data) {
            return JSON.parse(data);
        }

        // Return empty structure if not found
        return {
            month,
            year,
            assignments: {},
            attachments: {},
            comments: {}
        };
    },

    async saveMonthlySchedule(schedule: MonthlySchedule): Promise<void> {
        const key = `${DB_PREFIX}schedule_${schedule.year}_${schedule.month}`;
        // Prune empty keys to save space before saving
        const optimized = { ...schedule };
        // (Optional: Add logic here to remove empty objects from assignments)
        localStorage.setItem(key, JSON.stringify(optimized));
    }
};
