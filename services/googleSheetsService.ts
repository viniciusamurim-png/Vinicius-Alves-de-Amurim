
import { Employee, User, ScheduleChange } from "../types";
import { decimalToTime } from "./schedulerService";

/**
 * SERVIÇO DE INTEGRAÇÃO GOOGLE APPS SCRIPT
 * 
 * --- INSTRUÇÃO ---
 * 1. Faça o Deploy do seu Google Apps Script como "Web App".
 * 2. Defina "Quem pode acessar" como "Qualquer pessoa".
 * 3. Cole a URL gerada (termina com /exec) abaixo.
 */
const APPS_SCRIPT_API_URL = "https://script.google.com/macros/s/AKfycbz-SKJpQAaLErcT42oooLgmjhjYgiRilDcMdMoZYn8ZfnibUyt0nOD2b90Z_tFbIBFQ/exec"; 

export const GoogleSheetsService = {
    // --- EMPLOYEES ---
    async fetchEmployees(): Promise<Employee[]> {
        if (!APPS_SCRIPT_API_URL || APPS_SCRIPT_API_URL.includes("COLE_SUA_URL")) {
            console.warn("URL da API do Google Sheets não configurada no arquivo googleSheetsService.ts");
            return [];
        }

        try {
            console.log("Iniciando sincronização de COLABORADORES...");
            const response = await fetch(`${APPS_SCRIPT_API_URL}?type=employees`, {
                method: "GET",
                redirect: "follow",
                headers: { "Content-Type": "text/plain;charset=utf-8" }
            });

            if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
            
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("text/html")) {
                throw new Error("BLOQUEIO DE SEGURANÇA: A API retornou HTML. Verifique se o Script está publicado como 'Qualquer pessoa'.");
            }

            const data: any[][] = await response.json();
            if (!Array.isArray(data)) throw new Error("Formato de dados inválido.");

            return this.mapJsonToEmployees(data);

        } catch (error) {
            console.error("FALHA NA SINCRONIZAÇÃO (Colaboradores):", error);
            throw error;
        }
    },

    mapJsonToEmployees(data: any[][]): Employee[] {
        let startRow = 0;
        // Detect header row
        if (data.length > 0 && (String(data[0][0]).toUpperCase() === 'NOME' || String(data[0][0]).toUpperCase() === 'NAME')) {
            startRow = 1;
        }
        
        const employees: Employee[] = [];

        for (let i = startRow; i < data.length; i++) {
            const cols = data[i];
            if (!cols || cols.length < 2 || !cols[0] || !cols[1]) continue;

            let bh = String(cols[7] || '00:00');
            if (typeof cols[7] === 'number' || (bh.includes('.') || (bh.includes(',') && !bh.includes(':')))) {
                bh = decimalToTime(bh);
            }

            const birth = this.formatDate(cols[11]);
            const admission = this.formatDate(cols[12]);
            const term = this.formatDate(cols[17]);
            const lastOff = this.formatDate(cols[16]);

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
                shiftType: '',
                organizationalUnit: String(cols[10] || ''),
                birthDate: birth,
                admissionDate: admission,
                email: String(cols[13] || ''),
                gender: String(cols[14] || ''),
                workTime: String(cols[15] || ''),
                terminationDate: term,
                lastDayOff: lastOff,
                contractType: 'CLT'
            });
        }
        return employees;
    },

    formatDate(dateVal: any): string {
        if (!dateVal) return '';
        if (dateVal instanceof Date) return dateVal.toISOString().split('T')[0];
        if (typeof dateVal === 'string') {
            if (dateVal.includes('T')) return dateVal.split('T')[0];
            if (dateVal.includes('/')) {
                const parts = dateVal.split('/');
                if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }
        return String(dateVal);
    },

    // --- USERS MANAGEMENT ---

    async fetchUsers(): Promise<User[]> {
        if (!APPS_SCRIPT_API_URL || APPS_SCRIPT_API_URL.includes("COLE_SUA_URL")) return [];

        try {
            console.log("Buscando USUÁRIOS na nuvem...");
            const response = await fetch(`${APPS_SCRIPT_API_URL}?type=users`, {
                method: "GET",
                redirect: "follow",
                headers: { "Content-Type": "text/plain;charset=utf-8" }
            });

            if (!response.ok) throw new Error("Erro ao buscar usuários");
            
            const data: any = await response.json();
            
            if (!Array.isArray(data)) return [];

            // Detect header row for Users tab (New Header: NOME COMPLETO...)
            let startRow = 0;
            if (data.length > 0 && Array.isArray(data[0]) && (String(data[0][0]).toUpperCase().includes('NOME'))) {
                startRow = 1;
            }

            const users: User[] = [];
            for(let i = startRow; i < data.length; i++) {
                const row = data[i];
                if (!Array.isArray(row) || row.length < 3) continue; 

                // MAPPING BASED ON NEW ORDER:
                // 0: NOME
                // 1: USUÁRIO
                // 2: SENHA
                // 3: NÍVEL
                // 4: UNIDADES (JSON)
                // 5: SETORES (JSON)
                // 6: ID (Hidden/System)

                let allowedUnits = [];
                let allowedSectors = [];
                try { allowedUnits = row[4] ? JSON.parse(row[4]) : []; } catch(e) {}
                try { allowedSectors = row[5] ? JSON.parse(row[5]) : []; } catch(e) {}
                
                // Use Column 6 for ID, fallback to username if missing (legacy rows)
                const id = row[6] ? String(row[6]) : String(row[1]);

                users.push({
                    id: id,
                    name: String(row[0]),
                    username: String(row[1]),
                    password: String(row[2]),
                    role: String(row[3]) as any,
                    allowedUnits,
                    allowedSectors
                });
            }
            
            console.log(`Usuários carregados: ${users.length}`);
            return users;

        } catch (error) {
            console.warn("Não foi possível buscar usuários da nuvem.", error);
            return []; 
        }
    },

    async syncUser(user: User): Promise<void> {
        if (!APPS_SCRIPT_API_URL || APPS_SCRIPT_API_URL.includes("COLE_SUA_URL")) {
            alert("Configure a URL do Script para salvar na nuvem.");
            return;
        }

        const payload = JSON.stringify({
            action: 'upsert_user',
            user: {
                ...user,
                allowedUnits: JSON.stringify(user.allowedUnits || []),
                allowedSectors: JSON.stringify(user.allowedSectors || [])
            }
        });

        try {
            await fetch(APPS_SCRIPT_API_URL, {
                method: 'POST',
                mode: 'no-cors', 
                headers: { 'Content-Type': 'text/plain' },
                body: payload
            });
            console.log("Usuário enviado para sincronização.");
        } catch (e) {
            console.error("Erro ao enviar usuário:", e);
            throw new Error("Erro de conexão ao salvar usuário na nuvem.");
        }
    },

    async deleteUser(userId: string): Promise<void> {
        if (!APPS_SCRIPT_API_URL || APPS_SCRIPT_API_URL.includes("COLE_SUA_URL")) return;

        const payload = JSON.stringify({
            action: 'delete_user',
            userId: userId
        });

        try {
            await fetch(APPS_SCRIPT_API_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: payload
            });
            console.log("Solicitação de exclusão enviada.");
        } catch (e) {
            console.error("Erro ao deletar usuário:", e);
        }
    },

    // --- SCHEDULE SYNC (BACKUP & REALTIME) ---

    async syncScheduleChanges(changes: ScheduleChange[], user: User): Promise<void> {
         if (!APPS_SCRIPT_API_URL || APPS_SCRIPT_API_URL.includes("COLE_SUA_URL")) return;

         // Ensure the employee object is clean of potential circular refs or large unnecessary data if any
         // Map to send structure expected by GAS
         const cleanChanges = changes.map(c => ({
             employee: {
                 id: c.employee.id,
                 name: c.employee.name,
                 role: c.employee.role,
                 cpf: c.employee.cpf,
                 shiftPattern: c.employee.shiftPattern,
                 workTime: c.employee.workTime,
                 shiftType: c.employee.shiftType,
                 positionNumber: c.employee.positionNumber,
                 categoryCode: c.employee.categoryCode,
                 bankHoursBalance: c.employee.bankHoursBalance,
                 lastDayOff: c.employee.lastDayOff
             },
             day: c.day,
             shiftCode: c.shiftCode,
             totalDaysOff: c.totalDaysOff
         }));

         const payload = JSON.stringify({
             action: 'sync_schedule',
             changes: cleanChanges,
             user: { name: user.name, username: user.username }
         });

         try {
             // using fetch with no-cors doesn't allow reading response, but is faster/standard for GAS calls from web
             // However, for sync, we might want confirmation. GAS Web App needs proper CORS headers for normal fetch.
             // Assuming no-cors for simplicity unless error handling needed.
             await fetch(APPS_SCRIPT_API_URL, {
                 method: 'POST',
                 mode: 'no-cors',
                 headers: { 'Content-Type': 'text/plain' },
                 body: payload
             });
         } catch (e) {
             console.error("Erro ao sincronizar escala:", e);
         }
    },

    async fetchScheduleState(month: number, year: number): Promise<Record<string, Record<string, string>> | null> {
        if (!APPS_SCRIPT_API_URL || APPS_SCRIPT_API_URL.includes("COLE_SUA_URL")) return null;

        const payload = JSON.stringify({
            action: 'get_schedule',
            month,
            year
        });

        try {
             const response = await fetch(APPS_SCRIPT_API_URL, {
                 method: 'POST',
                 // Need normal mode to read response
                 headers: { 'Content-Type': 'text/plain' },
                 body: payload
             });
             
             if (!response.ok) return null;
             const data = await response.json();
             
             // Data format from GAS: { assignments: { empId: { dayNumber: shiftCode } } }
             // We need to convert to local format: assignments[empId][YYYY-MM-DD] = shiftId
             // BUT wait, GAS returns Codes (F, M, T). We need to map back to IDs if possible, or just use Codes?
             // The system uses Shift IDs internally.
             // Strategy: The frontend will receive Codes and match to Shifts to find IDs.
             return data.assignments || {};

        } catch (e) {
            console.error("Erro ao buscar estado da escala:", e);
            return null;
        }
    }
};
