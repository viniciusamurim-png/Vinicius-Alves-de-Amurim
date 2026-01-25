
import { GoogleGenAI, Type } from "@google/genai";
import { Employee, Shift, MonthlySchedule, AIRulesConfig, StaffingConfig } from "../types";
import { HOLIDAYS } from "../constants";

export const getDaysInMonth = (month: number, year: number) => {
  return new Date(year, month + 1, 0).getDate();
};

export const decimalToTime = (decimalStr: string | number): string => {
    if (!decimalStr) return "00:00";
    let num = typeof decimalStr === 'string' ? parseFloat(decimalStr.replace(',', '.')) : decimalStr;
    
    if (isNaN(num)) return decimalStr.toString(); // Return as is if not a number
    
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
    
    // Safety check: if last day off is in the future relative to month start, ignore
    if (lastOffDate >= startOfMonth) return 0;

    // Difference in time
    const diffTime = Math.abs(startOfMonth.getTime() - lastOffDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays - 1);
};

export const calculateRequiredDaysOff = (month: number, year: number, shiftPattern: string): number => {
    // 12x36 Rule: Technically works 15 days, rests 15 (as DSR). Plus 1 or 2 extra Folgas.
    // For grid target purpose, let's count DSRs + 2 (approximate for fortnightly rule)
    if (shiftPattern.includes('12x36') || shiftPattern.includes('12X36')) {
        return Math.floor(getDaysInMonth(month, year) / 2) + 2; 
    }
    
    const daysInMonth = getDaysInMonth(month, year);
    let count = 0;
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
        const holidayKey = `${String(day).padStart(2, '0')}-${String(month + 1).padStart(2, '0')}`;
        const isHoliday = HOLIDAYS[holidayKey] !== undefined;

        if (shiftPattern.includes('5x2') || shiftPattern.includes('5X2')) {
            // 5x2: Saturdays, Sundays AND Holidays count as required days off
            if (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday) {
                count++;
            }
        } else {
            // 6x1 (Default): Sundays AND Holidays count
            // Note: If holiday falls on Sunday, it's just 1 day off (logic handles this as else-if usually, but here OR covers it)
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
  employees?: Employee[] // Pass employees to get UF
): { valid: boolean, messages: string[], invalidDays: number[] } => {
  const messages: string[] = [];
  const invalidDays: number[] = [];
  
  const assignments = schedule.assignments[employeeId] || {};
  const daysInMonth = getDaysInMonth(schedule.month, schedule.year);
  
  // Find employee to get UF and Pattern
  const emp = employees?.find(e => e.id === employeeId);
  if (!emp) return { valid: false, messages: ["Colaborador não encontrado"], invalidDays: [] };

  const maxConsecutive = rules?.maxConsecutiveDays || 6;
  let consecutiveWorkDays = getInitialConsecutiveDays(emp.lastDayOff, schedule.month, schedule.year);
  
  let actualDaysOffCount = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${schedule.year}-${String(schedule.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const shiftId = assignments[dateKey];
    const shift = shifts.find(s => s.id === shiftId);
    
    // LÓGICA ATUALIZADA (2501):
    // Apenas legendas com categoria EXATA 'dayoff' (Folga/DSR) zeram o contador de dias consecutivos.
    // Qualquer outra coisa (Trabalho, Vazio, Faltas, Atestados, Férias, Abonos) CONTA como dia corrido
    // para fins de verificação de limite de dias consecutivos sem folga.
    const isRealFolga = shift && shift.category === 'dayoff';

    if (isRealFolga) {
      consecutiveWorkDays = 0;
      actualDaysOffCount++;
    } else {
      // Incrementa para Trabalho, Vazio, ou (Ausência/Licença/Abono)
      consecutiveWorkDays++;
    }

    if (consecutiveWorkDays > maxConsecutive) {
      // ONLY flag the exact day that breaks the limit (e.g., the 7th day)
      // Do NOT flag subsequent days (8th, 9th) to avoid clutter, as the error is at the 7th day.
      if (consecutiveWorkDays === maxConsecutive + 1) {
          invalidDays.push(day);
          messages.push(`CLT: Mais de ${maxConsecutive} dias sem Folga válida (Dia ${day}).`);
      }
    }
  }

  // Validate Total Days Off Count
  // IMPORTANT: If 0 days off, force error regardless of target calculation (CLT safety)
  const targetDaysOff = calculateRequiredDaysOff(schedule.month, schedule.year, emp.shiftPattern);
  
  if (actualDaysOffCount === 0 && daysInMonth > 0) {
      messages.push("Nenhuma folga atribuída.");
  } else if (actualDaysOffCount < targetDaysOff) {
      const diff = targetDaysOff - actualDaysOffCount;
      messages.push(`Faltam ${diff} dia(s) para atingir a meta de ${targetDaysOff}.`);
  }

  return { valid: messages.length === 0, messages, invalidDays };
};

// OTIMIZAÇÃO: Aumento do Batch Size para reduzir chamadas API
const BATCH_SIZE = 30; 

// Helper para processar um único lote
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
    
    // --- TRADUÇÃO DINÂMICA DE REGRAS PARA O PROMPT ---
    
    // 1. Preferência de Domingo
    const ruleSunday6x1 = rules.preferSundayOff 
        ? "- PRIORIDADE DOMINGO [ON]: Tente alocar folgas aos Domingos sempre que a escala permitir (respeitando o mínimo de equipe). Para mulheres, PRIORIDADE MÁXIMA." 
        : "- PRIORIDADE DOMINGO [OFF]: As folgas devem ser distribuídas ao longo da semana. Não priorize domingos.";

    const ruleSunday5x2 = rules.preferSundayOff
        ? "- PRIORIDADE DOMINGO [ON]: As folgas DEVEM ser preferencialmente Sábado e Domingo."
        : "- PRIORIDADE DOMINGO [OFF]: As folgas podem cair em dias úteis (Ex: Seg/Ter). Distribua aleatoriamente, evite fixar em Sáb/Dom.";

    // 2. Frequência de Domingos (Lei)
    const ruleSundayFreq = `- FREQUÊNCIA: Garanta pelo menos 1 folga no Domingo a cada ${rules.sundayOffFrequency} semanas (para mulheres, tente a cada 15 dias).`;

    // 3. Dobradinhas (Dias Consecutivos)
    const ruleConsecutive = rules.preferConsecutiveDaysOff
        ? "- DOBRADINHAS [ON]: Se o colaborador tiver mais de 1 folga na semana, AGRUPE OS DIAS (Ex: Sábado+Domingo, ou Domingo+Segunda). Evite folgas isoladas."
        : "- DOBRADINHAS [OFF]: Não é necessário agrupar as folgas. Podem ser espaçadas.";

    // 4. Folgas Extras
    const ruleExtra = rules.allowExtraDaysOff
        ? `- FOLGAS EXTRAS [ON]: Você TEM PERMISSÃO para adicionar até ${rules.extraDaysOffCount} dias de folga EXTRAS no mês se ajudar a resolver conflitos de escala ou regras de descanso.`
        : "- FOLGAS EXTRAS [OFF]: Gere estritamente a quantidade de folgas obrigatórias (Domingos + Feriados). Não dê folgas a mais.";

    // 5. Intervalo
    const ruleRest = `- INTERVALO: Respeite rigorosamente o intervalo mínimo de ${rules.minRestHours} horas entre turnos.`;


    const prompt = `
      Atue como especialista em escalas de trabalho CLT e gere o cronograma de folgas.
      
      OBJETIVO:
      Gere os dias de FOLGA ("${folgaId}") e DESCANSO ("${dsrId}") para o período ${startDate} a ${endDate}.
      Retorne APENAS os dias que NÃO são trabalho. Dias de trabalho = null.

      REGRAS GLOBAIS DE COMPORTAMENTO (ATENÇÃO MÁXIMA):
      1. ${ruleRest}
      2. Respeite o limite máximo de ${rules.maxConsecutiveDays} dias de trabalho consecutivos SEM EXCEÇÃO. Use 'lastDayOff' para calcular o início.
      3. ${ruleSundayFreq}

      REGRAS POR TIPO DE ESCALA:
      
      [ESCALA 12x36]
      - Padrão: Trabalho (null) / Descanso ("${dsrId}") alternados.
      - Verifique 'lastDayOff' para manter a paridade correta.
      - FOLGA EXTRA: Além do DSR dia sim/dia não, insira 1 folga extra ("${folgaId}") a cada quinzena, substituindo um dia de trabalho.
      
      [ESCALA 6x1]
      - Trabalha 6, Folga 1.
      - Quantidade Base: Domingos + Feriados do mês.
      - Use "${folgaId}" para todas as folgas.
      ${ruleSunday6x1}
      ${ruleConsecutive}
      ${ruleExtra}

      [ESCALA 5x2]
      - Trabalha 5, Folga 2.
      - Quantidade Base: Sábados + Domingos + Feriados.
      - Use "${folgaId}" para todas as folgas.
      ${ruleSunday5x2}
      ${ruleConsecutive}
      ${ruleExtra}

      COLABORADORES PARA PROCESSAR:
      ${JSON.stringify(batch.map(e => ({ 
          id: e.id, 
          pattern: e.shiftPattern,
          gender: e.gender,
          lastDayOff: e.lastDayOff,
          initialConsecutiveDays: getInitialConsecutiveDays(e.lastDayOff, month, year)
      })))}

      FORMATO DE SAÍDA:
      JSON estrito com array 'schedules'. Cada item tem 'employeeId' e 'days' (array de {date: "YYYY-MM-DD", shiftId: "${folgaId}" ou "${dsrId}"}).
    `;

    try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
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

    // Find shift IDs
    const folgaShift = shifts.find(s => s.code === 'F');
    const folgaId = folgaShift ? folgaShift.id : 'folga';
    const dsrShift = shifts.find(s => s.code === 'DSR');
    const dsrId = dsrShift ? dsrShift.id : 'dsr';

    let combinedAssignments: Record<string, Record<string, string>> = {};
    
    // Create Batches
    const batches: Employee[][] = [];
    for (let i = 0; i < employees.length; i += BATCH_SIZE) {
        batches.push(employees.slice(i, i + BATCH_SIZE));
    }

    let completedBatches = 0;
    const totalEmployees = employees.length;

    // Process all batches in PARALLEL (concurrency handled by Promise.all)
    // For very large lists (>500), we might need to chunk the promises, but for < 200, Promise.all is fine with Gemini 2.5 Flash limits.
    const promises = batches.map(async (batch) => {
        const result = await processBatch(ai, batch, shifts, month, year, rules, folgaId, dsrId, startDate, endDate);
        
        // Update progress atomically
        completedBatches++;
        // Rough estimate of progress: (completed batches / total batches) * total employees
        if (onProgress) {
            onProgress(Math.min(completedBatches * BATCH_SIZE, totalEmployees), totalEmployees);
        }
        
        return result;
    });

    const resultsArray = await Promise.all(promises);

    // Merge results
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
