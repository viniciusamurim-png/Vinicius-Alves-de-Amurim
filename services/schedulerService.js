import { GoogleGenAI } from "@google/genai";
import { HOLIDAYS } from "../constants.js";

// Helper para type do Schema do GenAI
// Se possível, importe SchemaType do SDK real: import { SchemaType } from "@google/genai";
const SchemaType = {
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  INTEGER: 'INTEGER',
  BOOLEAN: 'BOOLEAN',
  ARRAY: 'ARRAY',
  OBJECT: 'OBJECT'
};

export const getDaysInMonth = (month, year) => {
  return new Date(year, month + 1, 0).getDate();
};

export const decimalToTime = (decimalStr) => {
  if (!decimalStr) return "00:00";
  
  // Tratamento para números já passados como number
  let num = decimalStr;
  if (typeof decimalStr === 'string') {
    num = parseFloat(decimalStr.replace(',', '.'));
  }
  
  if (isNaN(num)) return String(decimalStr); // Retorna original se falhar

  const isNegative = num < 0;
  num = Math.abs(num);
  const hours = Math.floor(num);
  const minutes = Math.round((num - hours) * 60);

  return `${isNegative ? '-' : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

// Calculate initial consecutive days based on UF (Last Day Off)
// Otimizado para evitar erros de fuso horário usando UTC ou Zera Horas consistentemente
const getInitialConsecutiveDays = (lastDayOff, currentMonth, currentYear) => {
    if (!lastDayOff) return 0;
    
    // Força a data para meio-dia para evitar problemas de fuso horário (DST) na virada do dia
    const lastOffDate = new Date(lastDayOff);
    lastOffDate.setHours(12, 0, 0, 0);

    const startOfMonth = new Date(currentYear, currentMonth, 1);
    startOfMonth.setHours(12, 0, 0, 0);
    
    // Safety check: if last day off is in the future relative to month start, ignore
    if (lastOffDate >= startOfMonth) return 0;

    // Difference in time
    const diffTime = Math.abs(startOfMonth.getTime() - lastOffDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays - 1);
};

// Helper to determine if 12x36 starts with DSR or WORK on day 1
const determine12x36Start = (lastDayOffStr, currentMonth, currentYear) => {
    if (!lastDayOffStr) return 'UNKNOWN';
    
    // Robust parsing (YYYY-MM-DD)
    const parts = lastDayOffStr.split('-');
    if (parts.length !== 3) return 'UNKNOWN';
    
    const y = parseInt(parts[0]);
    const m = parseInt(parts[1]) - 1; // JS months are 0-based
    const d = parseInt(parts[2]);
    
    const lastOff = new Date(y, m, d);
    const firstOfMonth = new Date(currentYear, currentMonth, 1);
    
    // Normalização agressiva para evitar bugs de timezone
    lastOff.setHours(12, 0, 0, 0);
    firstOfMonth.setHours(12, 0, 0, 0);

    const diffTime = firstOfMonth.getTime() - lastOff.getTime();
    // Round é mais seguro que floor/ceil aqui devido a milissegundos flutuantes
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'UNKNOWN'; 

    // Logic: 
    // Diff 1 (Ontem foi folga) -> Hoje TRABALHO (WORK)
    // Diff 2 (Anteontem foi folga) -> Ontem Trabalho -> Hoje FOLGA (DSR)
    // Pattern: Odd (Impar) = WORK, Even (Par) = DSR.
    return (diffDays % 2 !== 0) ? 'WORK' : 'DSR';
};

export const calculateRequiredDaysOff = (month, year, shiftPattern) => {
    if (shiftPattern && (shiftPattern.includes('12x36') || shiftPattern.includes('12X36'))) {
        // Regra aproximada para 12x36 + 2 folgas extras
        return Math.floor(getDaysInMonth(month, year) / 2) + 2; 
    }
    
    const daysInMonth = getDaysInMonth(month, year);
    let count = 0;
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
        const holidayKey = `${String(day).padStart(2, '0')}-${String(month + 1).padStart(2, '0')}`;
        const isHoliday = HOLIDAYS[holidayKey] !== undefined;

        // Normalização de string uppercase para comparação segura
        const pattern = shiftPattern ? shiftPattern.toUpperCase() : '';

        if (pattern.includes('5X2')) {
            // 5x2: Saturdays, Sundays AND Holidays count as required days off
            if (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday) {
                count++;
            }
        } else {
            // 6x1 (Default): Sundays AND Holidays count
            if (dayOfWeek === 0 || isHoliday) {
                count++;
            }
        }
    }
    
    return count;
};

export const validateSchedule = (
  employeeId,
  schedule,
  shifts,
  rules,
  employees
) => {
  const messages = [];
  // Proteção contra schedule nulo/indefinido
  if (!schedule || !schedule.assignments) return { valid: true, messages: [] };

  const assignments = schedule.assignments[employeeId] || {};
  const daysInMonth = getDaysInMonth(schedule.month, schedule.year);
  
  const maxConsecutive = rules?.maxConsecutiveDays || 6;
  
  // Find employee to get UF
  const emp = employees?.find(e => e.id === employeeId);
  let consecutiveWorkDays = getInitialConsecutiveDays(emp?.lastDayOff, schedule.month, schedule.year);

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${schedule.year}-${String(schedule.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const shiftId = assignments[dateKey];
    
    const shift = shifts.find(s => s.id === shiftId);
    
    // Lógica corrigida: Se shiftId existe E é folga -> reseta.
    // Se shiftId não existe (null/undefined) -> assume Trabalho.
    
    const isDayOff = shift && shift.isDayOff;

    if (isDayOff) {
      consecutiveWorkDays = 0;
    } else {
      // Trabalho explícito ou dia vazio (Trabalho implícito)
      consecutiveWorkDays++;
    }

    if (consecutiveWorkDays > maxConsecutive) {
      messages.push(`CLT: Mais de ${maxConsecutive} dias consecutivos (Dia ${day}).`);
      // Não resetamos o contador aqui para apontar erro contínuo se necessário, 
      // ou resetamos para não spammar erros. O original resetava.
      consecutiveWorkDays = 0; 
    }
  }

  return { valid: messages.length === 0, messages };
};

const BATCH_SIZE = 15;

export const generateAISchedule = async (
  employees,
  shifts,
  month,
  year,
  rules,
  onProgress
) => {
  try {
    // ⚠️ SEGURANÇA: Chave movida para variável de ambiente
    // Certifique-se de ter VITE_GEMINI_API_KEY ou REACT_APP_GEMINI_API_KEY configurado no seu .env
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        throw new Error("Chave de API do Google Gemini não encontrada nas variáveis de ambiente.");
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    const daysInMonth = getDaysInMonth(month, year);
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`;

    const folgaShift = shifts.find(s => s.code === 'F');
    const folgaId = folgaShift ? folgaShift.id : 'folga';
    const dsrShift = shifts.find(s => s.code === 'DSR');
    const dsrId = dsrShift ? dsrShift.id : 'dsr';

    let combinedAssignments = {};
    const totalEmployees = employees.length;

    for (let i = 0; i < totalEmployees; i += BATCH_SIZE) {
        const batch = employees.slice(i, i + BATCH_SIZE);
        
        if (onProgress) {
            onProgress(i, totalEmployees);
        }

        const prompt = `
          Atue como especialista em escalas de trabalho.
          Gere os dias de FOLGA ("${folgaId}") e DESCANSO ("${dsrId}") para o período ${startDate} a ${endDate}.
          
          IMPORTANTE: Retorne APENAS os dias que NÃO são trabalho (F ou DSR). 
          Dias de trabalho devem ser omitidos ou nulos.

          REGRAS POR TIPO DE ESCALA:
          
          [ESCALA 12x36]
          - Campo 'patternStart12x36' define o dia 01:
          - 'DSR': Dia 01=Descanso, Dia 02=Trabalho, Dia 03=Descanso...
          - 'WORK': Dia 01=Trabalho, Dia 02=Descanso, Dia 03=Trabalho...
          - OBRIGATÓRIO: Preencha toda a alternância padrão com "${dsrId}".
          - FOLGA EXTRA: Insira 1 "${folgaId}" extra a cada 15 dias substituindo um dia de trabalho.
          
          [ESCALA 6x1]
          - Folgas (${folgaId}) = Domingos + Feriados.
          - Mulheres: Priorizar domingo quinzenal.
          - Homens: Priorizar 1 domingo a cada 3.
          - Máximo ${rules?.maxConsecutiveDays || 6} dias consecutivos de trabalho.

          [ESCALA 5x2]
          - Use "${folgaId}" para sábados, domingos e feriados.

          DADOS (Lote ${Math.floor(i / BATCH_SIZE) + 1}):
          ${JSON.stringify(batch.map(e => ({ 
              id: e.id, 
              pattern: e.shiftPattern,
              gender: e.gender,
              lastDayOff: e.lastDayOff,
              patternStart12x36: determine12x36Start(e.lastDayOff, month, year),
              initialConsecutiveDays: getInitialConsecutiveDays(e.lastDayOff, month, year)
          })))}
        `;

        try {
            const response = await ai.models.generateContent({
              model: "gemini-1.5-flash", // Recomendo o 1.5-flash (mais estável/rápido) ou o gemini-2.0-flash-exp
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: SchemaType.OBJECT,
                  properties: {
                     schedules: {
                        type: SchemaType.ARRAY,
                        items: {
                           type: SchemaType.OBJECT,
                           properties: {
                              employeeId: { type: SchemaType.STRING },
                              days: {
                                 type: SchemaType.ARRAY,
                                 items: {
                                    type: SchemaType.OBJECT,
                                    properties: {
                                        date: { type: SchemaType.STRING },
                                        shiftId: { type: SchemaType.STRING }
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

            // Parse seguro: algumas vezes o SDK retorna o texto direto, outras dentro de candidates
            let jsonString = response.text ? response.text() : null; 
            
            // Fallback se .text() for function ou propriedade dependendo da versão do SDK
            if (!jsonString && response.response) {
                jsonString = response.response.text();
            }

            if (jsonString) {
                const json = JSON.parse(jsonString);
                if (json.schedules && Array.isArray(json.schedules)) {
                    json.schedules.forEach((sch) => {
                        const empMap = {};
                        if (sch.days && Array.isArray(sch.days)) {
                            sch.days.forEach((d) => {
                                if (d.date && d.shiftId) {
                                    empMap[d.date] = d.shiftId;
                                }
                            });
                        }
                        combinedAssignments[sch.employeeId] = empMap;
                    });
                }
            }
        } catch (batchError) {
            console.error(`Erro no lote ${i}:`, batchError);
            // Continua para o próximo lote em vez de falhar tudo
        }
    }

    if (onProgress) onProgress(totalEmployees, totalEmployees);
    return combinedAssignments;

  } catch (error) {
    console.error("Erro fatal ao gerar escala com IA:", error);
    return null;
  }
};
