
import { GoogleGenAI, Type } from "@google/genai";
import { Employee, Shift, MonthlySchedule, AIRulesConfig, StaffingConfig } from "../types";
import { HOLIDAYS } from "../constants";

export const getDaysInMonth = (month: number, year: number) => {
  return new Date(year, month + 1, 0).getDate();
};

export const decimalToTime = (decimalStr: string | number): string => {
    if (!decimalStr) return "00:00";
    let num = typeof decimalStr === 'string' ? parseFloat(decimalStr.replace(',', '.')) : decimalStr;
    
    if (isNaN(num)) return decimalStr.toString(); 
    
    const isNegative = num < 0;
    num = Math.abs(num);
    const hours = Math.floor(num);
    const minutes = Math.round((num - hours) * 60);

    return `${isNegative ? '-' : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

// Calculate initial consecutive days based on UF (Last Day Off)
const getInitialConsecutiveDays = (lastDayOff: string | undefined, currentMonth: number, currentYear: number): number => {
    if (!lastDayOff) return 0;
    
    const lastOffDate = new Date(lastDayOff);
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    
    if (lastOffDate >= startOfMonth) return 0;

    const diffTime = Math.abs(startOfMonth.getTime() - lastOffDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays - 1);
};

export const calculateRequiredDaysOff = (month: number, year: number, shiftPattern: string): number => {
    if (shiftPattern.includes('12x36') || shiftPattern.includes('12X36')) {
        return Math.floor(getDaysInMonth(month, year) / 2) + 2; 
    }
    
    const daysInMonth = getDaysInMonth(month, year);
    let count = 0;
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay(); 
        const holidayKey = `${String(day).padStart(2, '0')}-${String(month + 1).padStart(2, '0')}`;
        const isHoliday = HOLIDAYS[holidayKey] !== undefined;

        if (shiftPattern.includes('5x2') || shiftPattern.includes('5X2')) {
            if (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday) {
                count++;
            }
        } else {
            // 6x1 (Default)
            if (dayOfWeek === 0 || isHoliday) {
                count++;
            }
        }
    }
    
    return count;
};

export const validateSchedule = (
  employeeId: string,
  schedule: MonthlySchedule,
  shifts: Shift[],
  rules?: AIRulesConfig,
  employees?: Employee[] 
): { valid: boolean, messages: string[], invalidDays: number[] } => {
  const messages: string[] = [];
  const invalidDays: number[] = [];
  
  const assignments = schedule.assignments[employeeId] || {};
  const daysInMonth = getDaysInMonth(schedule.month, schedule.year);
  
  const emp = employees?.find(e => e.id === employeeId);
  if (!emp) return { valid: false, messages: ["Colaborador não encontrado"], invalidDays: [] };

  const maxConsecutive = rules?.maxConsecutiveDays || 6;
  let consecutiveWorkDays = getInitialConsecutiveDays(emp.lastDayOff, schedule.month, schedule.year);
  
  let actualDaysOffCount = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${schedule.year}-${String(schedule.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const shiftId = assignments[dateKey];
    const shift = shifts.find(s => s.id === shiftId);
    
    const isRealFolga = shift && shift.category === 'dayoff';

    if (isRealFolga) {
      consecutiveWorkDays = 0;
      actualDaysOffCount++;
    } else {
      consecutiveWorkDays++;
    }

    if (consecutiveWorkDays > maxConsecutive) {
      if (consecutiveWorkDays === maxConsecutive + 1) {
          invalidDays.push(day);
          messages.push(`CLT: Mais de ${maxConsecutive} dias sem Folga válida (Dia ${day}).`);
      }
    }
  }

  const targetDaysOff = calculateRequiredDaysOff(schedule.month, schedule.year, emp.shiftPattern);
  
  if (actualDaysOffCount === 0 && daysInMonth > 0) {
      messages.push("Nenhuma folga atribuída.");
  } else if (actualDaysOffCount < targetDaysOff) {
      const diff = targetDaysOff - actualDaysOffCount;
      messages.push(`Faltam ${diff} dia(s) para atingir a meta de ${targetDaysOff}.`);
  }

  return { valid: messages.length === 0, messages, invalidDays };
};

const BATCH_SIZE = 30; 

const processBatch = async (
    ai: GoogleGenAI,
    batch: Employee[],
    shifts: Shift[],
    month: number,
    year: number,
    rules: AIRulesConfig,
    folgaId: string,
    dsrId: string,
    startDate: string,
    endDate: string
): Promise<Record<string, Record<string, string>>> => {
    
    // --- 1. CÁLCULO DE LIMITES GLOBAIS (COBERTURA 70/30) ---
    const maxFolgasPorDia = Math.floor(batch.length * 0.30);
    const ruleCoverage = `REGRA DE OURO (COBERTURA 70/30): Neste grupo de ${batch.length} pessoas, é ESTRITAMENTE PROIBIDO alocar mais de ${maxFolgasPorDia} folgas no MESMO dia (exceto Feriados Nacionais). Você deve espalhar as folgas para garantir que 70% trabalhem.`;

    // --- 2. CÁLCULO DE LIMITES INDIVIDUAIS (MIN/MAX FOLGAS) ---
    const employeesData = batch.map((e, idx) => {
        const requiredOff = calculateRequiredDaysOff(month, year, e.shiftPattern);
        const daysSinceLast = getInitialConsecutiveDays(e.lastDayOff, month, year);
        const maxExtras = rules.allowExtraDaysOff ? rules.extraDaysOffCount : 0;
        
        // Definição Estrita da Regra de Domingo baseada no Sexo
        const isFemale = e.gender && ['feminino', 'f', 'mulher'].includes(e.gender.toLowerCase());
        const sundayRule = isFemale 
            ? "LEI (MULHER): Obrigatório 1 folga no Domingo a cada 15 dias (escala quinzenal)." 
            : `LEI (HOMEM): Obrigatório 1 folga no Domingo a cada ${rules.sundayOffFrequency || 3} semanas.`;

        return {
            id: e.id,
            pattern: e.shiftPattern,
            gender: e.gender,
            lastDayOff: e.lastDayOff,
            daysComingIn: daysSinceLast,
            MIN_FOLGAS: requiredOff,
            MAX_FOLGAS: requiredOff + maxExtras,
            SUNDAY_RULE: sundayRule
        };
    });

    // --- 3. REGRAS AUXILIARES REFINADAS ---
    
    // REGRA DE TRABALHO: Intervalo 3 a N dias.
    const ruleWorkPattern = `PADRÃO DE TRABALHO: Não use o limite máximo (${rules.maxConsecutiveDays} dias) como meta fixa. A escala deve ser dinâmica. O funcionário deve trabalhar entre 3 a ${rules.maxConsecutiveDays} dias consecutivos antes de folgar. Use essa variabilidade para resolver conflitos de cobertura. O LIMITE ABSOLUTO é ${rules.maxConsecutiveDays}.`;
    
    // REGRA DE DOBRADINHAS
    const rulePairs = rules.preferConsecutiveDaysOff
        ? "DOBRADINHAS [ATIVADO]: Se o saldo de folgas permitir, você PODE agrupar 2 folgas consecutivas (ex: Sáb+Dom)."
        : "DOBRADINHAS [DESATIVADO]: É ESTRITAMENTE PROIBIDO dar 2 ou mais folgas consecutivas.";

    // REGRA DE DOMINGOS (LEI SUPREMA)
    const ruleSundayOverride = `REGRA SUPREMA DE DOMINGOS: Verifique o campo 'SUNDAY_RULE' de cada colaborador. Se, para cumprir a regra do Domingo (ex: Mulher a cada 15 dias), você precisar exceder o 'MAX_FOLGAS', VOCÊ ESTÁ AUTORIZADO A CRIAR UMA FOLGA EXTRA. A Lei do Domingo tem prioridade sobre a contagem de folgas.`;
    
    // REGRA DE VARIEDADE (NOVA)
    const ruleVariety = `VARIEDADE DE DIAS (ANTI-VÍCIO): Não repita sempre o mesmo dia da semana de folga. Se na semana 1 a folga foi Terça, na semana 2 tente Quarta ou Quinta (exceto se for Domingo obrigatório). Evite padrões repetitivos monótonos.`;

    const prompt = `
      ATUE COMO ALGORITMO DE ESCALA RÍGIDO. GERE JSON.
      Período: ${startDate} até ${endDate}.
      IDs FOLGA: "${folgaId}" ou "${dsrId}".
      TRABALHO: null.

      >>> REGRAS INVIOLÁVEIS (PENALIDADE MÁXIMA SE FALHAR) <<<
      1. ${ruleCoverage}
      2. QUANTIDADE DE FOLGAS: Tente respeitar 'MIN_FOLGAS' e 'MAX_FOLGAS'. PORÉM, leia a regra 5 abaixo.
      3. ${ruleWorkPattern}
      4. ${rulePairs}
      5. ${ruleSundayOverride}
      
      >>> DIRETRIZES SECUNDÁRIAS <<<
      - ${ruleVariety}
      - Use 'daysComingIn' para calcular a primeira folga.
      - Intervalo entre turnos: ${rules.minRestHours}h.

      DADOS DOS COLABORADORES:
      ${JSON.stringify(employeesData)}

      SAÍDA (JSON):
      { "schedules": [{ "employeeId": "...", "days": [{ "date": "YYYY-MM-DD", "shiftId": "..." }] }] }
    `;

    try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.4, 
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                 schedules: {
                    type: Type.ARRAY,
                    items: {
                       type: Type.OBJECT,
                       properties: {
                          employeeId: { type: Type.STRING },
                          days: {
                             type: Type.ARRAY,
                             items: {
                                type: Type.OBJECT,
                                properties: {
                                   date: { type: Type.STRING, description: "YYYY-MM-DD" },
                                   shiftId: { type: Type.STRING }
                                },
                                required: ["date", "shiftId"]
                             }
                          }
                       },
                       required: ["employeeId", "days"]
                    }
                 }
              },
              required: ["schedules"]
            }
          }
        });

        const json = JSON.parse(response.text);
        const batchResults: Record<string, Record<string, string>> = {};
        
        if (json.schedules && Array.isArray(json.schedules)) {
            json.schedules.forEach((sch: any) => {
                const empMap: Record<string, string> = {};
                if (sch.days && Array.isArray(sch.days)) {
                    sch.days.forEach((d: any) => {
                        if (d.date && d.shiftId) {
                            empMap[d.date] = d.shiftId;
                        }
                    });
                }
                batchResults[sch.employeeId] = empMap;
            });
        }
        return batchResults;

    } catch (batchError) {
        console.error(`Erro no processamento do lote:`, batchError);
        return {};
    }
};

export const generateAISchedule = async (
  employees: Employee[],
  shifts: Shift[],
  month: number,
  year: number,
  rules: AIRulesConfig,
  onProgress?: (current: number, total: number) => void
): Promise<Record<string, Record<string, string>> | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const daysInMonth = getDaysInMonth(month, year);
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`;

    const folgaShift = shifts.find(s => s.code === 'F');
    const folgaId = folgaShift ? folgaShift.id : 'folga';
    const dsrShift = shifts.find(s => s.code === 'DSR');
    const dsrId = dsrShift ? dsrShift.id : 'dsr';

    let combinedAssignments: Record<string, Record<string, string>> = {};
    
    const batches: Employee[][] = [];
    for (let i = 0; i < employees.length; i += BATCH_SIZE) {
        batches.push(employees.slice(i, i + BATCH_SIZE));
    }

    let completedBatches = 0;
    const totalEmployees = employees.length;

    const promises = batches.map(async (batch) => {
        const result = await processBatch(ai, batch, shifts, month, year, rules, folgaId, dsrId, startDate, endDate);
        completedBatches++;
        if (onProgress) {
            onProgress(Math.min(completedBatches * BATCH_SIZE, totalEmployees), totalEmployees);
        }
        return result;
    });

    const resultsArray = await Promise.all(promises);

    resultsArray.forEach(batchResult => {
        combinedAssignments = { ...combinedAssignments, ...batchResult };
    });

    if (onProgress) onProgress(totalEmployees, totalEmployees);
    return combinedAssignments;

  } catch (error) {
    console.error("Erro fatal ao gerar escala com IA:", error);
    return null;
  }
};
