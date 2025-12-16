
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Employee, Shift, MonthlySchedule, AIRulesConfig, StaffingConfig, GridSelection, ExtendedColumnKey } from '../types';
import { getDaysInMonth, validateSchedule, calculateRequiredDaysOff } from '../services/schedulerService';
import { Tooltip } from './Tooltip';
import { HOLIDAYS, COMMENTS_OPTIONS } from '../constants';

// --- PERFORMANCE CONSTANTS ---
const ROW_HEIGHT = 36; // Height in pixels for virtualization
const BUFFER_ROWS = 10; // Number of rows to render outside viewport

interface Props {
  employees: Employee[];
  shifts: Shift[];
  currentSchedule: MonthlySchedule;
  setSchedule: React.Dispatch<React.SetStateAction<MonthlySchedule>>;
  rules: AIRulesConfig;
  staffingConfig: StaffingConfig; 
  onReorderEmployees?: (draggedId: string, targetId: string) => void;
  onUpdateEmployee?: (id: string, field: string, value: string) => void;
  isReadOnly?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  currentUserId?: string;
}

interface ContextMenuState {
  visible: boolean;
  type: 'cell' | 'header'; 
  x: number;
  y: number;
  employeeId?: string;
  day?: number;
  columnKey?: string;
  assignmentType?: 'absence' | 'leave' | 'other';
  hasAttachment?: boolean;
  isCommentMenu?: boolean;
}

interface DailyStat {
  day: number;
  totalActive: number;
  roleCounts: Record<string, number>;
  roleIdeals: Record<string, number>;
}

export const RosterGrid: React.FC<Props> = ({ 
    employees, shifts, currentSchedule, setSchedule, rules, staffingConfig, 
    onReorderEmployees, onUpdateEmployee, isReadOnly = false, onUndo, onRedo, currentUserId
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, type: 'cell', x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const internalClipboard = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentTarget = useRef<{employeeId: string, day: number} | null>(null);

  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: ExtendedColumnKey | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [draggedEmployeeId, setDraggedEmployeeId] = useState<string | null>(null);

  // --- VIRTUALIZATION STATE ---
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600); // Default, updated by resize observer

  // User Preferences
  const [hiddenColumns, setHiddenColumns] = useState<ExtendedColumnKey[]>([]);
  const [frozenColumns, setFrozenColumns] = useState<ExtendedColumnKey[]>(['name']);
  const [colWidths, setColWidths] = useState<Record<ExtendedColumnKey, number>>({
      name: 220, id: 80, role: 120, cpf: 100, scale: 60, time: 80, shiftType: 100, position: 80, council: 100, bh: 60, uf: 95
  });

  // Load Prefs
  useEffect(() => {
      if (currentUserId) {
          const stored = localStorage.getItem(`USER_PREFS_${currentUserId}`);
          if (stored) {
              const prefs = JSON.parse(stored);
              if (prefs.hiddenColumns) setHiddenColumns(prefs.hiddenColumns);
              if (prefs.frozenColumns) setFrozenColumns(prefs.frozenColumns);
              if (prefs.colWidths) setColWidths(prefs.colWidths);
          }
      }
  }, [currentUserId]);

  // Save Prefs
  useEffect(() => {
      if (currentUserId) {
          localStorage.setItem(`USER_PREFS_${currentUserId}`, JSON.stringify({ hiddenColumns, frozenColumns, colWidths }));
      }
  }, [hiddenColumns, frozenColumns, colWidths, currentUserId]);

  // Grid Height Observer
  useEffect(() => {
      if (gridContainerRef.current) {
          const observer = new ResizeObserver(entries => {
             for (let entry of entries) { setContainerHeight(entry.contentRect.height); }
          });
          observer.observe(gridContainerRef.current);
          return () => observer.disconnect();
      }
  }, []);

  const [resizing, setResizing] = useState<{ key: ExtendedColumnKey, startX: number, startWidth: number } | null>(null);
  const [selection, setSelection] = useState<GridSelection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [focusedCell, setFocusedCell] = useState<{empIndex: number, day: number} | null>(null);

  const daysInMonth = useMemo(() => getDaysInMonth(currentSchedule.month, currentSchedule.year), [currentSchedule.month, currentSchedule.year]);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

  // Sorting Logic
  const sortedEmployees = useMemo(() => {
    if (!sortConfig.key) return employees;
    return [...employees].sort((a, b) => {
        let valA = ''; let valB = '';
        switch (sortConfig.key) {
            case 'name': valA = a.name; valB = b.name; break;
            case 'id': valA = a.id; valB = b.id; break;
            case 'role': valA = a.role; valB = b.role; break;
            case 'cpf': valA = a.cpf; valB = b.cpf; break;
            case 'scale': valA = a.shiftPattern; valB = b.shiftPattern; break;
            case 'time': valA = a.workTime || ''; valB = b.workTime || ''; break;
            case 'shiftType': valA = a.shiftType || ''; valB = b.shiftType || ''; break;
            case 'position': valA = a.positionNumber; valB = b.positionNumber; break;
            case 'council': valA = a.categoryCode; valB = b.categoryCode; break;
            case 'bh': valA = a.bankHoursBalance; valB = b.bankHoursBalance; break;
            case 'uf': valA = a.lastDayOff || ''; valB = b.lastDayOff || ''; break;
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [employees, sortConfig]);

  // --- VIRTUALIZATION CALCS ---
  const totalRows = sortedEmployees.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const endIndex = Math.min(totalRows, Math.floor((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS);
  
  // The subset of employees to render
  const visibleEmployees = sortedEmployees.slice(startIndex, endIndex);
  
  // Padding to simulate the full list height
  const paddingTop = startIndex * ROW_HEIGHT;
  const paddingBottom = (totalRows - endIndex) * ROW_HEIGHT;


  const orderedKeys: ExtendedColumnKey[] = ['name', 'id', 'role', 'cpf', 'scale', 'time', 'shiftType', 'position', 'council', 'bh', 'uf'];
  const visibleColumns = useMemo(() => orderedKeys.filter(k => !hiddenColumns.includes(k)), [hiddenColumns]);
  const totalLeftWidth = visibleColumns.reduce((acc, key) => acc + colWidths[key], 0);

  const getStickyLeft = (key: ExtendedColumnKey) => {
      let offset = 0;
      for (const k of visibleColumns) {
          if (k === key) break;
          if (frozenColumns.includes(k)) offset += colWidths[k];
      }
      return offset;
  }

  // --- EVENTS ---
  useEffect(() => {
    const handleBackgroundClick = (e: MouseEvent) => {
      if (gridContainerRef.current && gridContainerRef.current.contains(e.target as Node)) {
          const target = e.target as HTMLElement;
          if (target === gridContainerRef.current || target.classList.contains('roster-bg')) {
             setSelection(null); setFocusedCell(null); setContextMenu(prev => ({...prev, visible: false}));
          }
      } else {
          setContextMenu(prev => ({...prev, visible: false}));
      }
    };
    document.addEventListener('mousedown', handleBackgroundClick);
    return () => document.removeEventListener('mousedown', handleBackgroundClick);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!resizing) return;
        setColWidths(prev => ({ ...prev, [resizing.key]: Math.max(40, resizing.startWidth + (e.pageX - resizing.startX)) }));
    };
    const handleMouseUp = () => { if (resizing) { setResizing(null); document.body.style.cursor = 'default'; } };
    if (resizing) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); document.body.style.cursor = 'col-resize'; }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [resizing]);

  const handleResizeStart = (e: React.MouseEvent, key: ExtendedColumnKey) => { e.preventDefault(); e.stopPropagation(); setResizing({ key, startX: e.pageX, startWidth: colWidths[key] }); };
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop);

  // Interaction handlers (Simplified for brevity)
  const handleMouseDown = (rowIndex: number, day: number) => { if (isReadOnly) return; setIsSelecting(true); setSelection({ startRow: rowIndex, startCol: day, endRow: rowIndex, endCol: day }); setFocusedCell({ empIndex: rowIndex, day }); setContextMenu(prev => ({...prev, visible: false})); };
  const handleMouseEnter = (rowIndex: number, day: number) => { if (isSelecting && selection) setSelection({ ...selection, endRow: rowIndex, endCol: day }); };
  const handleMouseUp = () => setIsSelecting(false);

  // Stats
  const dailyStats = useMemo<DailyStat[]>(() => {
      // Calculation optimized to only loop active data (could be optimized further but usually fast enough)
      return daysArray.map(day => {
          const date = new Date(currentSchedule.year, currentSchedule.month, day);
          const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const dayKey = dayKeys[date.getDay()];
          const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          
          let totalActive = 0;
          const roleCounts: Record<string, number> = {};

          employees.forEach(emp => {
              const shiftId = currentSchedule.assignments[emp.id]?.[dateKey];
              const shift = shifts.find(s => s.id === shiftId);
              const isWork = !shift || (shift.category !== 'dayoff' && shift.category !== 'absence' && shift.category !== 'leave');
              if (isWork) { totalActive++; roleCounts[emp.role] = (roleCounts[emp.role] || 0) + 1; }
          });
          const roleIdeals: Record<string, number> = {};
          Object.keys(staffingConfig).forEach(role => {
              const cfg = staffingConfig[role];
              const specific = (cfg as any)[dayKey];
              roleIdeals[role] = specific !== undefined ? specific : cfg.default;
          });
          return { day, totalActive, roleCounts, roleIdeals };
      });
  }, [employees, currentSchedule, shifts, daysArray, staffingConfig]);

  // Context Menu Actions
  const handleCellContextMenu = (e: React.MouseEvent, employeeId: string, day: number) => { e.preventDefault(); if(isReadOnly) return; const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const shiftId = currentSchedule.assignments[employeeId]?.[dateKey]; const shift = shifts.find(s => s.id === shiftId); let assignmentType: ContextMenuState['assignmentType'] = 'other'; if (shift?.category === 'absence' || shift?.category === 'leave') assignmentType = 'leave'; const hasAttachment = !!currentSchedule.attachments?.[employeeId]?.[dateKey]; setContextMenu({ visible: true, type: 'cell', x: e.pageX, y: e.pageY, employeeId, day, assignmentType, hasAttachment, isCommentMenu: false }); };
  const handleSelectShift = (shiftId: string) => { if (contextMenu.employeeId && contextMenu.day) { const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(contextMenu.day).padStart(2, '0')}`; setSchedule(prev => ({ ...prev, assignments: { ...prev.assignments, [contextMenu.employeeId!]: { ...(prev.assignments[contextMenu.employeeId!] || {}), [dateKey]: shiftId } } })); } setContextMenu(prev => ({ ...prev, visible: false })); };
  const handleClearCell = () => { if (contextMenu.employeeId && contextMenu.day) { const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(contextMenu.day).padStart(2, '0')}`; const newAssignments = { ...(currentSchedule.assignments[contextMenu.employeeId!] || {}) }; delete newAssignments[dateKey]; setSchedule(prev => ({ ...prev, assignments: { ...prev.assignments, [contextMenu.employeeId!]: newAssignments } })); } setContextMenu(prev => ({ ...prev, visible: false })); }
  
  const isSelected = (rowIndex: number, day: number) => { if (!selection) return false; return rowIndex >= Math.min(selection.startRow, selection.endRow) && rowIndex <= Math.max(selection.startRow, selection.endRow) && day >= Math.min(selection.startCol, selection.endCol) && day <= Math.max(selection.startCol, selection.endCol); };
  const isWeekendOrHoliday = (day: number) => { const dayOfWeek = new Date(currentSchedule.year, currentSchedule.month, day).getDay(); const holidayKey = `${String(day).padStart(2, '0')}-${String(currentSchedule.month + 1).padStart(2, '0')}`; return dayOfWeek === 0 || dayOfWeek === 6 || HOLIDAYS[holidayKey] !== undefined; }
  const getDayLabel = (day: number) => weekDays[new Date(currentSchedule.year, currentSchedule.month, day).getDay()];
  const labelMap: Record<ExtendedColumnKey, string> = { name: 'NOME COLABORADOR', id: 'ID', role: 'CARGO', cpf: 'CPF', scale: 'ESCALA', time: 'HORÁRIO', shiftType: 'TURNO', position: 'Nº POSIÇÃO', council: 'REG. CONSELHO', bh: 'BH', uf: 'UF' };

  // --- RENDER ---
  return (
    <div ref={gridContainerRef} className="roster-bg bg-white rounded shadow-sm border border-slate-300 flex flex-col h-full w-full overflow-hidden select-none relative print:border-none print:shadow-none" onMouseUp={handleMouseUp}>
      {hiddenColumns.length > 0 && <button onClick={() => setHiddenColumns([])} className="absolute top-1 left-1 z-[70] bg-blue-100 text-blue-700 p-1.5 rounded-full shadow hover:bg-blue-200 print:hidden transition-all w-fit h-fit">👁️</button>}
      
      {/* HEADER */}
      <div className="flex bg-company-blue text-white z-40 shadow-md w-fit sticky top-0 overflow-hidden min-w-full">
         <div className="flex-shrink-0 flex border-r border-blue-800 bg-company-blue z-40">
            {visibleColumns.map((key) => {
                const isFrozen = frozenColumns.includes(key); const left = getStickyLeft(key);
                return (
                <div key={key} style={{ width: colWidths[key], position: isFrozen ? 'sticky' : 'relative', left: isFrozen ? left : 'auto', zIndex: isFrozen ? 50 : 'auto' }} onClick={() => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }))} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ visible: true, type: 'header', x: e.pageX, y: e.pageY, columnKey: key }); }} className={`relative p-2 font-bold text-[10px] border-r border-blue-800 flex items-center justify-center overflow-hidden whitespace-nowrap cursor-pointer hover:bg-blue-900 group ${isFrozen ? 'bg-company-blue shadow-[2px_0_5px_rgba(0,0,0,0.2)]' : ''}`}>
                    {labelMap[key]} {sortConfig.key === key && <span className="ml-1 text-[8px]">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>}
                    <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-50 group-hover:bg-blue-600/50" onMouseDown={(e) => handleResizeStart(e, key)} onClick={(e) => e.stopPropagation()}/>
                </div>
            )})}
        </div>
        <div className="flex min-w-max">
            {daysArray.map(day => (
                <div key={day} className={`w-8 flex flex-col items-center justify-center border-r border-blue-800 ${isWeekendOrHoliday(day) ? 'bg-sky-500/30' : ''}`}><span className="text-[9px] font-medium opacity-80 uppercase">{getDayLabel(day).substring(0, 1)}</span><span className="text-[10px] font-bold">{String(day).padStart(2, '0')}</span></div>
            ))}
             <div className="w-16 flex-shrink-0 p-2 font-bold text-[10px] border-r border-blue-800 flex items-center justify-center bg-company-blue">FOLGAS</div>
             <div className="w-10 flex-shrink-0 p-2 font-bold text-[10px] border-r border-blue-800 flex items-center justify-center bg-company-blue">ST</div>
        </div>
      </div>

      {/* BODY - VIRTUALIZED */}
      <div className="flex-1 overflow-auto w-full relative" onScroll={handleScroll}>
        <div style={{ height: totalRows * ROW_HEIGHT, position: 'relative' }}>
          {/* Filler top */}
          <div style={{ height: paddingTop }}></div>

          {/* Rendered Items */}
          {visibleEmployees.map((employee, idx) => {
            const rowIndex = startIndex + idx; // Actual index in full list
            const validation = validateSchedule(employee.id, currentSchedule, shifts, rules, employees);
            let daysOffCount = 0;
            Object.values(currentSchedule.assignments[employee.id] || {}).forEach(sid => { if (shifts.find(s=>s.id===sid)?.category === 'dayoff') daysOffCount++; });
            const targetDaysOff = calculateRequiredDaysOff(currentSchedule.month, currentSchedule.year, employee.shiftPattern);
            const isExcessDaysOff = daysOffCount > targetDaysOff;

            return (
                <div key={employee.id} style={{ height: ROW_HEIGHT }} className="flex border-b border-slate-300 bg-white hover:bg-blue-50 transition-colors group">
                    {/* Left Cols */}
                    <div className="flex-shrink-0 flex border-r border-slate-300 bg-white z-10 group-hover:bg-blue-50">
                        {visibleColumns.map(key => {
                            let val = key === 'scale' ? employee.shiftPattern : key === 'time' ? employee.workTime : key === 'position' ? employee.positionNumber : key === 'council' ? employee.categoryCode : key === 'bh' ? employee.bankHoursBalance : key === 'uf' ? employee.lastDayOff : (employee as any)[key];
                            if (key === 'uf' && val) { const [y, m, d] = val.split('-'); if (y && m && d) val = `${d}/${m}`; }
                            const colorClass = key === 'bh' ? (val && val.startsWith('-') ? 'text-red-600' : 'text-green-600 font-bold') : 'text-slate-500';
                            const isFrozen = frozenColumns.includes(key); const left = getStickyLeft(key);
                            return (
                                <div key={key} style={{ width: colWidths[key], position: isFrozen ? 'sticky' : 'relative', left: isFrozen ? left : 'auto', zIndex: isFrozen ? 30 : 'auto' }} className={`flex items-center px-2 border-r border-slate-100 overflow-hidden bg-white group-hover:bg-blue-50 ${isFrozen ? 'shadow-[2px_0_5px_rgba(0,0,0,0.05)]' : ''}`}>
                                    <span className={`text-[9px] truncate uppercase font-medium ${colorClass}`} title={val}>{val}</span>
                                </div>
                            )
                        })}
                    </div>
                    {/* Grid */}
                    <div className="flex">
                        {daysArray.map(day => {
                            const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const shiftId = currentSchedule.assignments[employee.id]?.[dateKey];
                            const shift = shifts.find(s => s.id === shiftId);
                            const isOff = isWeekendOrHoliday(day);
                            const selected = isSelected(rowIndex, day);
                            const attachment = currentSchedule.attachments?.[employee.id]?.[dateKey];
                            const comment = currentSchedule.comments?.[employee.id]?.[dateKey];
                            return (
                                <div key={day} onMouseDown={() => handleMouseDown(rowIndex, day)} onMouseEnter={() => handleMouseEnter(rowIndex, day)} onContextMenu={(e) => handleCellContextMenu(e, employee.id, day)}
                                    className={`w-8 h-full border-r border-slate-300 flex items-center justify-center text-[10px] font-bold select-none relative
                                        ${!shift && isOff ? 'bg-sky-50' : ''} ${shift ? shift.color : 'bg-transparent'} ${shift?.textColor ? shift.textColor : 'text-slate-700'}
                                        ${selected ? 'ring-2 ring-inset ring-blue-600 bg-blue-100/50' : ''} ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}
                                    `}>
                                    {shift ? shift.code : ''}
                                    {attachment && <Tooltip content={`Anexo: ${attachment.name}`}><span className="absolute top-0 right-0 text-[8px] cursor-help">📎</span></Tooltip>}
                                    {comment && <Tooltip content={`Obs: ${comment}`}><span className="absolute bottom-0 right-0 w-0 h-0 border-l-[6px] border-l-transparent border-b-[6px] border-b-orange-500"></span></Tooltip>}
                                </div>
                            );
                        })}
                         <div className={`w-16 flex-shrink-0 border-r border-slate-300 flex items-center justify-center text-[10px] bg-slate-50 font-bold ${isExcessDaysOff ? 'text-red-600' : 'text-slate-700'}`}>{String(daysOffCount).padStart(2, '0')}/{String(targetDaysOff).padStart(2, '0')}</div>
                         <div className="w-10 flex-shrink-0 border-r border-slate-300 flex items-center justify-center bg-slate-50 relative group/st">
                            {validation.valid ? <span className="text-green-500 font-bold">✔</span> : (<div className="relative flex justify-center w-full h-full items-center"><span className="text-red-500 font-bold cursor-help text-xs">⚠</span></div>)}
                        </div>
                    </div>
                </div>
            );
          })}
          
          {/* Filler bottom */}
          <div style={{ height: paddingBottom }}></div>
        </div>
      </div>
      
      {/* Context Menu (Copied from original, essential logic) */}
      {contextMenu.visible && (
          <div ref={menuRef} className="fixed z-[100] bg-white shadow-xl rounded-lg border border-slate-200 py-1 min-w-[180px]" style={{ top: contextMenu.y, left: contextMenu.x }}>
              {contextMenu.type === 'header' ? (
                  <button onClick={() => { if(contextMenu.columnKey) setHiddenColumns(prev => [...prev, contextMenu.columnKey as ExtendedColumnKey]); setContextMenu(prev => ({...prev, visible:false}))}} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs text-red-600 font-bold">Ocultar Coluna</button>
              ) : (
                  <>
                    <button onClick={handleClearCell} className="w-full text-left px-4 py-2 hover:bg-red-50 text-xs text-red-600 font-bold border-b">Limpar</button>
                    <div className="max-h-60 overflow-y-auto">
                        {shifts.map(shift => (
                            <button key={shift.id} onClick={() => handleSelectShift(shift.id)} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-xs text-slate-700 flex items-center gap-2">
                                <span className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold border ${shift.color} ${shift.textColor || 'text-slate-800'}`}>{shift.code}</span>
                                <span>{shift.name}</span>
                            </button>
                        ))}
                    </div>
                  </>
              )}
          </div>
      )}

      {/* FOOTER */}
      <div className="bg-slate-50 border-t border-slate-300 shadow-inner flex shrink-0 print:hidden w-fit sticky bottom-0 z-40">
          <div className="flex h-10 border-b border-slate-200 w-full">
             <div className="flex-shrink-0 flex items-center justify-end px-2 font-bold text-[10px] text-slate-700 uppercase bg-slate-100 border-r border-slate-300 sticky left-0 z-40" style={{ width: totalLeftWidth }}>Total Ativos / Ideal</div>
             <div className="flex min-w-max"> 
                 {dailyStats.map(stat => (<div key={stat.day} className="w-8 flex flex-col items-center justify-center border-r border-slate-200 text-[9px]"><span className={`font-bold ${stat.totalActive < (Object.values(stat.roleIdeals) as number[]).reduce((a,b)=>a+b,0) ? 'text-red-600' : 'text-slate-800'}`}>{stat.totalActive}</span></div>))}
                 <div className="w-16 border-r border-slate-200 bg-slate-100"></div><div className="w-10 border-r border-slate-200 bg-slate-100"></div>
             </div>
          </div>
      </div>
    </div>
  );
};
