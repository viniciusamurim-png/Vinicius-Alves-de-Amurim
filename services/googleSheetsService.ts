
import { Employee, User, ScheduleChange } from "../types";
import { decimalToTime } from "./schedulerService";

/**
 * SERVIÇO DE INTEGRAÇÃO GOOGLE APPS SCRIPT
 */
const APPS_SCRIPT_API_URL = "https://script.google.com/macros/s/AKfycbw42p9nvsW_8x9qQ2VquL_ScXxyH0nndj5QQdScoTkhJZB6IeB4cNVq4Irb0ZBtA9Sc/exec"; 

const MONTH_NAMES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export interface ScheduleSyncResponse {
    assignments: Record<string, Record<string, string>>;
    metadata?: Record<string, { shiftType: string, lastDayOff: string }>;
}

export const GoogleSheetsService = {
    // --- COLABORADORES ---
    async fetchEmployees(): Promise<Employee[]> {
        if (!APPS_SCRIPT_API_URL || APPS_SCRIPT_API_URL.includes("COLE_SUA_URL")) return [];
        try {
            const response = await fetch(`${APPS_SCRIPT_API_URL}?type=employees`, {
                method: "GET",
                redirect: "follow",
                headers: { "Content-Type": "text/plain;charset=utf-8" }
            });
            if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
            const data: any[][] = await response.json();
            return this.mapJsonToEmployees(data);
        } catch (error) {
            console.error("Erro ao buscar colaboradores:", error);
            throw error;
        }
    },

    mapJsonToEmployees(data: any[][]): Employee[] {
        let startRow = (data.length > 0 && (String(data[0][0]).toUpperCase() === 'NOME' || String(data[0][0]).toUpperCase() === 'NAME')) ? 1 : 0;
        const employees: Employee[] = [];
        for (let i = startRow; i < data.length; i++) {
            const cols = data[i];
            if (!cols || cols.length < 2 || !cols[0] || !cols[1]) continue;
            let bh = String(cols[7] || '00:00');
            if (typeof cols[7] === 'number' || (bh.includes('.') || (bh.includes(',') && !bh.includes(':')))) {
                bh = decimalToTime(bh);
            }
            employees.push({
                name: String(cols[0]).toUpperCase(),
                id: String(cols[1]),
                role: String(cols[2] || 'COLABORADOR').toUpperCase(),
                cpf: String(cols[3] || ''),
                shiftPattern: String(cols[4] || '5X2').toUpperCase(),
                positionNumber: String(cols[5] || ''),
                categoryCode: String(cols[6] || '').toUpperCase(),
                bankHoursBalance: bh,
                unit: String(cols[8] || 'Unidade Central'),
                sector: String(cols[9] || 'Geral'),
                shiftType: String(cols[18] || ''), 
                organizationalUnit: String(cols[10] || ''),
                birthDate: this.formatDate(cols[11]),
                admissionDate: this.formatDate(cols[12]),
                email: String(cols[13] || ''),
                gender: String(cols[14] || ''),
                workTime: String(cols[15] || ''),
                lastDayOff: this.formatDate(cols[16]), 
                terminationDate: this.formatDate(cols[17]),
                contractType: 'CLT'
            });
        }
        return employees;
    },

    formatDate(dateVal: any): string {
        if (!dateVal) return '';
        if (dateVal instanceof Date) return dateVal.toISOString().split('T')[0];
        if (typeof dateVal === 'string') {
            // YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;

            if (dateVal.includes('T')) return dateVal.split('T')[0];
            if (dateVal.includes('/')) {
                const parts = dateVal.split('/');
                if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
            }

            // Limpa strings verbosas (remove fuso horário em parênteses, ex: "(HORÁRIO PADRÃO...)")
            // Isso corrige o erro de parse em alguns navegadores
            const cleanVal = dateVal.replace(/\(.*\)/, '').trim();

            // Tenta parsear formatos longos/verbosos
            const d = new Date(cleanVal);
            if (!isNaN(d.getTime())) {
                return d.toISOString().split('T')[0];
            }
        }
        return String(dateVal);
    },

    // --- HELPER PARA GARANTIR OBJETO COMPLETO ---
    sanitizeEmployeeForSync(emp: Employee) {
        // Retorna um objeto plano com TODAS as propriedades que o Apps Script espera na ordem correta ou acessíveis por chave
        return {
            name: emp.name || "",
            id: String(emp.id),
            role: emp.role || "",
            cpf: emp.cpf || "",
            shiftPattern: emp.shiftPattern || "",
            workTime: emp.workTime || "",
            shiftType: emp.shiftType || "",
            positionNumber: emp.positionNumber || "",
            categoryCode: emp.categoryCode || "",
            bankHoursBalance: emp.bankHoursBalance || "00:00",
            lastDayOff: emp.lastDayOff || "",
            // Campos extras que podem ser úteis mas não são cruciais para a visualização da escala imediata
            unit: emp.unit || "",
            sector: emp.sector || ""
        };
    },

    // --- USUÁRIOS ---
    async fetchUsers(): Promise<User[]> {
        if (!APPS_SCRIPT_API_URL || APPS_SCRIPT_API_URL.includes("COLE_SUA_URL")) return [];
        try {
            const response = await fetch(`${APPS_SCRIPT_API_URL}?type=users`, { method: "GET", redirect: "follow" });
            const data: any = await response.json();
            if (!Array.isArray(data)) return [];
            let startRow = (data.length > 0 && String(data[0][0]).toUpperCase().includes('NOME')) ? 1 : 0;
            const users: User[] = [];
            for(let i = startRow; i < data.length; i++) {
                const row = data[i];
                let allowedUnits = []; let allowedSectors = [];
                try { allowedUnits = row[4] ? JSON.parse(row[4]) : []; } catch(e) {}
                try { allowedSectors = row[5] ? JSON.parse(row[5]) : []; } catch(e) {}
                users.push({
                    id: row[6] ? String(row[6]) : String(row[1]),
                    name: String(row[0]),
                    username: String(row[1]),
                    password: String(row[2]),
                    role: String(row[3]) as any,
                    allowedUnits,
                    allowedSectors
                });
            }
            return users;
        } catch (error) { return []; }
    },

    async syncUser(user: User): Promise<void> {
        const payload = JSON.stringify({ action: 'upsert_user', user: { ...user, allowedUnits: JSON.stringify(user.allowedUnits || []), allowedSectors: JSON.stringify(user.allowedSectors || []) } });
        await fetch(APPS_SCRIPT_API_URL, { method: 'POST', mode: 'no-cors', body: payload });
    },

    async deleteUser(userId: string): Promise<void> {
        const payload = JSON.stringify({ action: 'delete_user', userId: userId });
        await fetch(APPS_SCRIPT_API_URL, { method: 'POST', mode: 'no-cors', body: payload });
    },

    // --- ESCALAS E METADADOS ---
    async syncScheduleChanges(changes: ScheduleChange[], user: User): Promise<void> {
         if (!APPS_SCRIPT_API_URL || APPS_SCRIPT_API_URL.includes("COLE_SUA_URL")) return;
         
         const cleanChanges = changes.map(c => ({
             employee: this.sanitizeEmployeeForSync(c.employee), 
             day: c.day,
             shiftCode: c.shiftCode,
             totalDaysOff: c.totalDaysOff,
             periodLabel: `${MONTH_NAMES_PT[c.month]}/${c.year}`,
             month: c.month,
             year: c.year
         }));
         
         const payload = JSON.stringify({ action: 'sync_schedule', changes: cleanChanges, user: { name: user.name, username: user.username } });
         await fetch(APPS_SCRIPT_API_URL, { method: 'POST', mode: 'no-cors', body: payload });
    },

    async syncEmployeesMetadata(employees: Employee[], month: number, year: number, user: User): Promise<void> {
        if (!APPS_SCRIPT_API_URL || APPS_SCRIPT_API_URL.includes("COLE_SUA_URL")) return;
        
        // 1. Atualizar a planilha da Escala Mensal (Linha Completa)
        // Usamos day: 0 para indicar que não é uma mudança de dia específico (célula), mas sim da linha (metadados)
        const metadataChanges = employees.map(emp => ({
            employee: this.sanitizeEmployeeForSync(emp),
            day: 0,
            shiftCode: "METADATA_ONLY", 
            month: month,
            year: year,
            periodLabel: `${MONTH_NAMES_PT[month]}/${year}`
        }));

        const payload = JSON.stringify({
            action: 'sync_schedule',
            changes: metadataChanges,
            user: { name: user.name, username: user.username }
        });
        
        await fetch(APPS_SCRIPT_API_URL, { method: 'POST', mode: 'no-cors', body: payload });
        
        // 2. Atualizar a base principal de Colaboradores (para consistência futura)
        const basePayload = JSON.stringify({
            action: 'sync_metadata',
            employees: employees.map(e => this.sanitizeEmployeeForSync(e))
        });
        await fetch(APPS_SCRIPT_API_URL, { method: 'POST', mode: 'no-cors', body: basePayload });
    },

    async fetchScheduleState(month: number, year: number): Promise<ScheduleSyncResponse | null> {
        if (!APPS_SCRIPT_API_URL || APPS_SCRIPT_API_URL.includes("COLE_SUA_URL")) return null;
        const payload = JSON.stringify({ action: 'get_schedule', month, year });
        try {
             const response = await fetch(APPS_SCRIPT_API_URL, { 
                 method: 'POST', 
                 headers: { 'Content-Type': 'text/plain' }, 
                 body: payload 
             });
             if (!response.ok) return null;
             const data = await response.json();

             // Sanitiza metadados para evitar formatos de data inválidos ou verbosos
             if (data.metadata) {
                 Object.keys(data.metadata).forEach(k => {
                     if (data.metadata[k].lastDayOff) {
                         data.metadata[k].lastDayOff = this.formatDate(data.metadata[k].lastDayOff);
                     }
                 });
             }

             return { 
                 assignments: data.assignments || {}, 
                 metadata: data.metadata || {} 
             };
        } catch (e) {
            console.error("Erro ao buscar estado da escala:", e);
            return null;
        }
    }
};
