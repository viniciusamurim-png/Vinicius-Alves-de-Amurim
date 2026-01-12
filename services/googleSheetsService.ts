
import { Employee } from "../types";
import { decimalToTime } from "./schedulerService";

/**
 * SERVIÇO DE INTEGRAÇÃO GOOGLE APPS SCRIPT
 * 
 * URL ATUAL CONFIGURADA:
 * Certifique-se que esta URL abre em uma guia ANÔNIMA sem pedir login.
 * Se pedir login, o App não conseguirá ler os dados.
 */
const APPS_SCRIPT_API_URL = "https://script.google.com/macros/s/AKfycbxlEDRfQXZqTD1hOYl_lUH8ehuiuWpBZKYX4yiWmTVSTAt3hTheb7xOXy_YRmYtmtKv/exec"; 

export const GoogleSheetsService = {
    async fetchEmployees(): Promise<Employee[]> {
        if (!APPS_SCRIPT_API_URL || APPS_SCRIPT_API_URL.includes("COLE_AQUI")) {
            console.warn("URL da API do Google Sheets não configurada.");
            return [];
        }

        try {
            console.log("Iniciando sincronização com:", APPS_SCRIPT_API_URL);
            
            const response = await fetch(APPS_SCRIPT_API_URL, {
                method: "GET",
                redirect: "follow", // Seguir redirecionamentos do Google
                headers: {
                    "Content-Type": "text/plain;charset=utf-8",
                }
            });

            if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
            
            // Verifica se o retorno é JSON ou uma página de erro/login HTML
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("text/html")) {
                throw new Error("BLOQUEIO DE SEGURANÇA: A API retornou uma página de Login. Verifique se a implantação está como 'Qualquer Pessoa' e se a organização permite acesso anônimo.");
            }

            const data: any[][] = await response.json();
            console.log("Dados recebidos da planilha:", data);

            if (!Array.isArray(data)) {
                throw new Error("Formato de dados inválido recebido da API.");
            }

            return this.mapJsonToEmployees(data);

        } catch (error) {
            console.error("FALHA NA SINCRONIZAÇÃO:", error);
            alert(`Erro ao buscar dados: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    },

    mapJsonToEmployees(data: any[][]): Employee[] {
        // Tenta identificar onde começam os dados reais (pula cabeçalho se houver)
        // Procura pela linha que NÃO tem "Nome" ou "NOME" na primeira coluna
        let startRow = 0;
        if (data.length > 0 && (String(data[0][0]).toUpperCase() === 'NOME' || String(data[0][0]).toUpperCase() === 'NAME')) {
            startRow = 1;
        }
        
        const employees: Employee[] = [];

        for (let i = startRow; i < data.length; i++) {
            const cols = data[i];
            
            // Pula linhas vazias ou sem ID/Nome
            if (!cols || cols.length < 2 || !cols[0] || !cols[1]) continue;

            let bh = String(cols[7] || '00:00');
            // Corrige formatações numéricas de Excel para BH (ex: 0.5 -> 12:00) se necessário, 
            // ou mantém se já for string texto
            if (typeof cols[7] === 'number' || (bh.includes('.') || (bh.includes(',') && !bh.includes(':')))) {
                bh = decimalToTime(bh);
            }

            // Garante que datas venham como string
            const birth = this.formatDate(cols[11]);
            const admission = this.formatDate(cols[12]);
            const term = this.formatDate(cols[17]);
            const lastOff = this.formatDate(cols[16]); // Se houver coluna de UF manual na planilha

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
                shiftType: '', // O Turno (Manhã/Tarde) geralmente é definido na operação, não no RH
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
        
        console.log(`Processados ${employees.length} colaboradores com sucesso.`);
        return employees;
    },

    formatDate(dateVal: any): string {
        if (!dateVal) return '';
        
        // Se for objeto Date do JS
        if (dateVal instanceof Date) {
            return dateVal.toISOString().split('T')[0];
        }

        // Se vier como string ISO do Google (ex: 2023-01-01T00:00:00.000Z)
        if (typeof dateVal === 'string') {
            if (dateVal.includes('T')) {
                return dateVal.split('T')[0];
            }
            // Tenta converter DD/MM/YYYY para YYYY-MM-DD se necessário
            if (dateVal.includes('/')) {
                const parts = dateVal.split('/');
                if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }
        return String(dateVal);
    }
};
