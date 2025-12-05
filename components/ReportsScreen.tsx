
import React from 'react';
import { Employee, MonthlySchedule, Shift } from '../types';
import { getDaysInMonth } from '../services/schedulerService';

interface Props {
  employees: Employee[];
  schedule: MonthlySchedule;
  shifts: Shift[];
}

export const ReportsScreen: React.FC<Props> = ({ employees, schedule, shifts }) => {
  
  const generateCSV = () => {
    const daysInMonth = getDaysInMonth(schedule.month, schedule.year);
    
    // Transactional Layout: ID | Data | Legenda
    let csvContent = `ID;NOME;CARGO;DATA;LEGENDA\n`;

    employees.forEach(emp => {
      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${schedule.year}-${String(schedule.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const shiftId = schedule.assignments[emp.id]?.[dateKey];
        const shift = shifts.find(s => s.id === shiftId);
        
        // Formatted Date DD/MM/YYYY
        const dateFormatted = `${String(day).padStart(2, '0')}/${String(schedule.month + 1).padStart(2, '0')}/${schedule.year}`;
        const shiftCode = shift ? shift.code : '';

        // Generate row for every day
        csvContent += `${emp.id};${emp.name};${emp.role};${dateFormatted};${shiftCode}\n`;
      }
    });

    // BOM for Excel
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Escala_Transacional_${schedule.month + 1}_${schedule.year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-8 w-full overflow-y-auto">
       <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 max-w-4xl mx-auto w-full">
          <h2 className="text-2xl font-bold text-slate-800 mb-2 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-company-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Central de Relatórios
          </h2>
          <p className="text-slate-500 mb-8">Gere arquivos para exportação e análise gerencial.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Report Card */}
              <div className="border rounded-lg p-6 hover:shadow-md transition-shadow bg-slate-50 border-slate-200">
                  <h3 className="font-bold text-lg text-slate-800 mb-2">Escala Transacional (.CSV)</h3>
                  <p className="text-sm text-slate-600 mb-4">
                      Exporta a escala em formato de Banco de Dados, gerando uma linha por dia para cada colaborador. Ideal para importar em BI.
                      <br/>Layout: ID | Nome | Cargo | Data | Legenda
                  </p>
                  <button 
                    onClick={generateCSV}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded flex items-center justify-center gap-2"
                  >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                     Baixar Relatório
                  </button>
              </div>
          </div>
       </div>
    </div>
  );
};
