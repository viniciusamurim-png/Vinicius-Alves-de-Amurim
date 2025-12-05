
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Employee, Shift, MonthlySchedule, AIRulesConfig, StaffingConfig, GridSelection } from '../types';
import { getDaysInMonth, validateSchedule } from '../services/schedulerService';
import { Tooltip } from './Tooltip';
import { HOLIDAYS } from '../constants';

interface Props {
  employees: Employee[];
  shifts: Shift[];
  currentSchedule: MonthlySchedule;
  setSchedule: React.Dispatch<React.SetStateAction<MonthlySchedule>>;
  rules: AIRulesConfig;
  staffingConfig: StaffingConfig; 
  onReorderEmployees?: (draggedId: string, targetId: string) => void;
  isReadOnly?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

interface ContextMenuState {
  visible: boolean;
  type: 'cell' | 'header'; 
  x: number;
  y: number;
  employeeId?: string;
  day?: number;
  columnKey?: string;
}

type ColumnKey = 'name' | 'id' | 'role' | 'cpf' | 'scale' | 'position' | 'council' | 'bh';

interface DailyStat {
  day: number;
  totalActive: number;
  roleCounts: Record<string, number>;
  roleIdeals: Record<string, number>;
}

export const RosterGrid: React.FC<Props> = ({ 
    employees, shifts, currentSchedule, setSchedule, rules, staffingConfig, 
    onReorderEmployees, isReadOnly = false, onUndo, onRedo 
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, type: 'cell', x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Single Container Ref
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Clipboard Ref
  const internalClipboard = useRef<string | null>(null);

  const [draggedEmployeeId, setDraggedEmployeeId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: ColumnKey | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [hiddenColumns, setHiddenColumns] = useState<ColumnKey[]>([]);
  
  // Frozen columns state (Array of keys)
  const [frozenColumns, setFrozenColumns] = useState<ColumnKey[]>([]);

  const [colWidths, setColWidths] = useState<Record<ColumnKey, number>>({
      name: 220, id: 80, role: 120, cpf: 100, scale: 80, position: 80, council: 100, bh: 60
  });
  const [resizingCol, setResizingCol] = useState<string | null>(null);
  const startResizeX = useRef(0);
  const startResizeWidth = useRef(0);

  // Selection State
  const [selection, setSelection] = useState<GridSelection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const daysInMonth = useMemo(() => 
    getDaysInMonth(currentSchedule.month, currentSchedule.year), 
    [currentSchedule.month, currentSchedule.year]
  );
  
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

  // Sorting logic
  const sortedEmployees = useMemo(() => {
    if (!sortConfig.key) return employees;
    return [...employees].sort((a, b) => {
        let valA = '';
        let valB = '';
        switch (sortConfig.key) {
            case 'name': valA = a.name; valB = b.name; break;
            case 'id': valA = a.id; valB = b.id; break;
            case 'role': valA = a.role; valB = b.role; break;
            case 'cpf': valA = a.cpf; valB = b.cpf; break;
            case 'scale': valA = a.shiftPattern; valB = b.shiftPattern; break;
            case 'position': valA = a.positionNumber; valB = b.positionNumber; break;
            case 'council': valA = a.categoryCode; valB = b.categoryCode; break;
            case 'bh': valA = a.bankHoursBalance; valB = b.bankHoursBalance; break;
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [employees, sortConfig]);

  const visibleColumns = (Object.keys(colWidths) as ColumnKey[]).filter(k => !hiddenColumns.includes(k));
  const totalLeftWidth = visibleColumns.reduce((acc, key) => acc + colWidths[key], 0);

  // Calculate offsets for frozen columns
  const getColumnLeftOffset = (key: ColumnKey) => {
      let offset = 0;
      for (const k of visibleColumns) {
          if (k === key) break;
          offset += colWidths[k];
      }
      return offset;
  };

  // Selection Handlers
  const handleMouseDown = (rowIndex: number, day: number) => {
    if (isReadOnly) return;
    setIsSelecting(true);
    setSelection({ startRow: rowIndex, startCol: day, endRow: rowIndex, endCol: day });
  };

  const handleMouseEnter = (rowIndex: number, day: number) => {
    if (isSelecting && selection) {
        setSelection({ ...selection, endRow: rowIndex, endCol: day });
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  // Keyboard Logic (Undo, Redo, Copy, Paste, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (isReadOnly) return;

        // UNDO (Ctrl+Z)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (onUndo) onUndo();
            return;
        }

        // REDO (Ctrl+Y or Ctrl+Shift+Z)
        if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
            e.preventDefault();
            if (onRedo) onRedo();
            return;
        }

        if (!selection) return;

        // DELETE / BACKSPACE (Clear Selection)
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            const minR = Math.min(selection.startRow, selection.endRow);
            const maxR = Math.max(selection.startRow, selection.endRow);
            const minC = Math.min(selection.startCol, selection.endCol);
            const maxC = Math.max(selection.startCol, selection.endCol);

            const newAssignments = { ...currentSchedule.assignments };
            let changed = false;

            for (let r = minR; r <= maxR; r++) {
                const emp = sortedEmployees[r];
                if (!emp) continue;
                
                if (newAssignments[emp.id]) {
                    const empSchedule = { ...newAssignments[emp.id] };
                    for (let c = minC; c <= maxC; c++) {
                        const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
                        if (empSchedule[dateKey]) {
                            delete empSchedule[dateKey];
                            changed = true;
                        }
                    }
                    newAssignments[emp.id] = empSchedule;
                }
            }
            if (changed) setSchedule(prev => ({ ...prev, assignments: newAssignments }));
        }

        // COPY (Ctrl+C)
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            const startR = Math.min(selection.startRow, selection.endRow);
            const startC = Math.min(selection.startCol, selection.endCol);
            const emp = sortedEmployees[startR];
            if (!emp) return;
            const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(startC).padStart(2, '0')}`;
            const shiftId = currentSchedule.assignments[emp.id]?.[dateKey];
            if (shiftId) internalClipboard.current = shiftId;
        }

        // PASTE (Ctrl+V)
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
             let shiftId = internalClipboard.current;
             if (shiftId) {
                const minR = Math.min(selection.startRow, selection.endRow);
                const maxR = Math.max(selection.startRow, selection.endRow);
                const minC = Math.min(selection.startCol, selection.endCol);
                const maxC = Math.max(selection.startCol, selection.endCol);

                const newAssignments = { ...currentSchedule.assignments };
                for (let r = minR; r <= maxR; r++) {
                    const emp = sortedEmployees[r];
                    if (!emp) continue;
                    if (!newAssignments[emp.id]) newAssignments[emp.id] = {};
                    const empSchedule = { ...newAssignments[emp.id] };

                    for (let c = minC; c <= maxC; c++) {
                        const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
                        empSchedule[dateKey] = shiftId;
                    }
                    newAssignments[emp.id] = empSchedule;
                }
                setSchedule(prev => ({ ...prev, assignments: newAssignments }));
             }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, currentSchedule, sortedEmployees, isReadOnly, setSchedule, onUndo, onRedo]);

  const isSelected = (rowIndex: number, day: number) => {
    if (!selection) return false;
    const minR = Math.min(selection.startRow, selection.endRow);
    const maxR = Math.max(selection.startRow, selection.endRow);
    const minC = Math.min(selection.startCol, selection.endCol);
    const maxC = Math.max(selection.startCol, selection.endCol);
    return rowIndex >= minR && rowIndex <= maxR && day >= minC && day <= maxC;
  };

  // Stats calculation
  const dailyStats = useMemo<DailyStat[]>(() => {
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
              
              // Count as work if it's explicitly Work OR it is undefined (Empty)
              const isWork = !shift || (shift.category !== 'dayoff' && shift.category !== 'absence' && shift.category !== 'leave');

              if (isWork) {
                  totalActive++;
                  roleCounts[emp.role] = (roleCounts[emp.role] || 0) + 1;
              }
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

  const getDayLabel = (day: number) => {
    const date = new Date(currentSchedule.year, currentSchedule.month, day);
    return weekDays[date.getDay()];
  };

  const isWeekendOrHoliday = (day: number) => {
    const date = new Date(currentSchedule.year, currentSchedule.month, day);
    const dayOfWeek = date.getDay(); 
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(currentSchedule.month + 1).padStart(2, '0');
    const holidayKey = `${dayStr}-${monthStr}`;
    return dayOfWeek === 0 || dayOfWeek === 6 || HOLIDAYS[holidayKey] !== undefined;
  }
  
  const getHolidayName = (day: number) => {
      const dayStr = String(day).padStart(2, '0');
      const monthStr = String(currentSchedule.month + 1).padStart(2, '0');
      return HOLIDAYS[`${dayStr}-${monthStr}`];
  }

  // Header click handlers...
   const handleHeaderClick = (key: ColumnKey) => {
      setSortConfig(prev => ({
          key,
          direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
      }));
  };

  const handleHeaderContextMenu = (e: React.MouseEvent, key: ColumnKey) => {
      e.preventDefault();
      setContextMenu({ visible: true, type: 'header', x: e.pageX, y: e.pageY, columnKey: key });
  };

  const startResizing = (e: React.MouseEvent, colName: ColumnKey) => {
      e.preventDefault(); e.stopPropagation();
      setResizingCol(colName);
      startResizeX.current = e.clientX;
      startResizeWidth.current = colWidths[colName];
      document.body.style.cursor = 'col-resize';
  };

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (resizingCol) {
              const diff = e.clientX - startResizeX.current;
              setColWidths(prev => ({ ...prev, [resizingCol]: Math.max(40, startResizeWidth.current + diff) }));
          }
      };
      const handleMouseUp = () => {
          if (resizingCol) { setResizingCol(null); document.body.style.cursor = 'default'; }
      };
      if (resizingCol) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); }
      return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [resizingCol]);

  const handleCellContextMenu = (e: React.MouseEvent, employeeId: string, day: number) => {
      e.preventDefault();
      if (isReadOnly) return;
      setContextMenu({ visible: true, type: 'cell', x: e.pageX, y: e.pageY, employeeId, day });
  };

  useEffect(() => {
      const handleClick = (e: MouseEvent) => {
          if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(prev => ({ ...prev, visible: false }));
      };
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleSelectShift = (shiftId: string) => {
      if (contextMenu.employeeId && contextMenu.day) {
          const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(contextMenu.day).padStart(2, '0')}`;
          setSchedule(prev => ({
            ...prev, assignments: { ...prev.assignments, [contextMenu.employeeId!]: { ...(prev.assignments[contextMenu.employeeId!] || {}), [dateKey]: shiftId } }
         }));
      }
      setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleClearCell = () => {
       if (contextMenu.employeeId && contextMenu.day) {
          const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(contextMenu.day).padStart(2, '0')}`;
          const newAssignments = { ...(currentSchedule.assignments[contextMenu.employeeId!] || {}) };
          delete newAssignments[dateKey];
          setSchedule(prev => ({ ...prev, assignments: { ...prev.assignments, [contextMenu.employeeId!]: newAssignments } }));
       }
       setContextMenu(prev => ({ ...prev, visible: false }));
  }

  const handleCellClick = (employeeId: string, day: number) => {
       if (isReadOnly) return;
       // Only trigger click change if NOT dragging selection
       if (selection && (selection.startRow !== selection.endRow || selection.startCol !== selection.endCol)) return;

       const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const currentAssignment = currentSchedule.assignments[employeeId]?.[dateKey];
        let nextShiftIndex = -1;
        if (currentAssignment) {
            const currentIdx = shifts.findIndex(s => s.id === currentAssignment);
            nextShiftIndex = (currentIdx + 1) % shifts.length;
        } else { nextShiftIndex = 0; }
        const nextShiftId = shifts[nextShiftIndex].id;
        setSchedule(prev => ({
        ...prev, assignments: { ...prev.assignments, [employeeId]: { ...(prev.assignments[employeeId] || {}), [dateKey]: nextShiftId } }
        }));
  }
  
  const calculateStats = (employeeId: string) => {
      let daysOff = 0;
      const assignments = currentSchedule.assignments[employeeId] || {};
      Object.values(assignments).forEach(shiftId => {
          const shift = shifts.find(s => s.id === shiftId);
          if (shift && shift.category === 'dayoff') daysOff++;
      });
      return { daysOff };
  };

  const handleDragStart = (e: React.DragEvent, id: string) => { 
      if (isReadOnly) return;
      setDraggedEmployeeId(id); 
      e.dataTransfer.effectAllowed = 'move'; 
  };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      if (isReadOnly) return;
      if (draggedEmployeeId && draggedEmployeeId !== targetId && onReorderEmployees) { onReorderEmployees(draggedEmployeeId, targetId); }
      setDraggedEmployeeId(null);
  };

  const toggleFreeze = (key: ColumnKey) => {
      if (frozenColumns.includes(key)) {
          setFrozenColumns(prev => prev.filter(k => k !== key));
      } else {
          setFrozenColumns(prev => [...prev, key]);
      }
      setContextMenu(prev => ({...prev, visible:false}));
  }

  const labelMap: Record<ColumnKey, string> = { 
      name: 'NOME COLABORADOR', id: 'ID', role: 'CARGO', cpf: 'CPF', 
      scale: 'ESCALA', position: 'Nº POSIÇÃO', council: 'REG. CONSELHO', bh: 'BH' 
  };

  return (
    <div 
        ref={gridContainerRef}
        className="bg-white rounded shadow-sm border border-slate-300 flex flex-col h-full w-full overflow-auto select-none relative print:border-none print:shadow-none" 
        onMouseUp={handleMouseUp}
    >
      
      {/* Restore Cols */}
      {hiddenColumns.length > 0 && (
          <button onClick={() => setHiddenColumns([])} className="absolute top-1 left-1 z-50 bg-blue-100 text-blue-700 p-1 rounded hover:bg-blue-200 shadow print:hidden text-xs">
             Restaurar Colunas
          </button>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
          <div ref={menuRef} className="fixed z-[100] bg-white shadow-xl rounded-lg border border-slate-200 py-1 min-w-[160px]" style={{ top: contextMenu.y, left: contextMenu.x }}>
              {contextMenu.type === 'header' ? (
                  <>
                    <button onClick={() => toggleFreeze(contextMenu.columnKey as ColumnKey)} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-slate-700">
                        {frozenColumns.includes(contextMenu.columnKey as ColumnKey) ? 'Descongelar Coluna' : 'Congelar Coluna'}
                    </button>
                    <button onClick={() => { if(contextMenu.columnKey) setHiddenColumns(prev => [...prev, contextMenu.columnKey as ColumnKey]); setContextMenu(prev => ({...prev, visible:false}))}} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs text-red-600 font-bold border-t">Ocultar Coluna</button>
                  </>
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

      {/* HEADER: Sticky Top */}
      <div className="flex bg-company-blue text-white z-40 shadow-md w-fit sticky top-0">
        {/* Left Columns Header */}
        <div className="flex-shrink-0 flex border-r border-blue-800 bg-company-blue z-40 sticky left-0">
            {visibleColumns.map((key) => {
                const isFrozen = frozenColumns.includes(key);
                const left = getColumnLeftOffset(key);
                return (
                <div key={key} 
                     style={{ 
                         width: colWidths[key],
                         position: isFrozen ? 'sticky' : 'relative',
                         left: isFrozen ? left : 'auto',
                         zIndex: isFrozen ? 50 : 'auto'
                     }} 
                     onClick={() => handleHeaderClick(key)} 
                     onContextMenu={(e) => handleHeaderContextMenu(e, key)} 
                     className={`relative p-2 font-bold text-[10px] border-r border-blue-800 flex items-center justify-center overflow-hidden whitespace-nowrap cursor-pointer hover:bg-blue-900 group ${isFrozen ? 'bg-company-blue shadow-[2px_0_5px_rgba(0,0,0,0.2)]' : ''}`}>
                    {labelMap[key]}
                    {sortConfig.key === key && <span className="ml-1 text-[8px]">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>}
                    {isFrozen && <span className="absolute top-0.5 right-0.5 text-[8px] opacity-50">❄</span>}
                    <div onMouseDown={(e) => startResizing(e, key)} onClick={(e) => e.stopPropagation()} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10" />
                </div>
            )})}
        </div>
        
        {/* Days Header */}
        <div className="flex min-w-max">
            {daysArray.map(day => {
                const isOff = isWeekendOrHoliday(day);
                return (
                <div key={day} className={`w-8 flex flex-col items-center justify-center border-r border-blue-800 ${isOff ? 'bg-sky-500/30' : ''}`} title={getHolidayName(day)}>
                    <span className="text-[9px] font-medium opacity-80 uppercase">{getDayLabel(day).substring(0, 1)}</span>
                    <span className="text-[10px] font-bold">{String(day).padStart(2, '0')}</span>
                </div>
            )})}
            {/* Extra Columns Header */}
             <div className="w-16 flex-shrink-0 p-2 font-bold text-[10px] border-r border-blue-800 flex items-center justify-center bg-company-blue">FOLGAS</div>
             <div className="w-10 flex-shrink-0 p-2 font-bold text-[10px] border-r border-blue-800 flex items-center justify-center bg-company-blue" title="Status CLT">ST</div>
        </div>
      </div>

      {/* BODY */}
      <div className="flex flex-col min-w-max">
        {sortedEmployees.map((employee, rowIndex) => {
        const validation = validateSchedule(employee.id, currentSchedule, shifts, rules);
        const stats = calculateStats(employee.id);

        return (
            <div 
                key={employee.id} 
                className={`flex border-b border-slate-300 bg-white hover:bg-blue-50 transition-colors group h-9 ${draggedEmployeeId === employee.id ? 'opacity-50' : ''}`}
            >
                {/* Left Columns (Data) */}
                <div 
                    draggable={!isReadOnly} 
                    onDragStart={(e) => handleDragStart(e, employee.id)} 
                    onDragOver={(e) => e.preventDefault()} 
                    onDrop={(e) => handleDrop(e, employee.id)}
                    className="flex-shrink-0 flex border-r border-slate-300 bg-white z-10 group-hover:bg-blue-50 cursor-move sticky left-0"
                >
                    {visibleColumns.map(key => {
                        const val = key === 'scale' ? employee.shiftPattern : key === 'position' ? employee.positionNumber : key === 'council' ? employee.categoryCode : key === 'bh' ? employee.bankHoursBalance : (employee as any)[key];
                        const colorClass = key === 'bh' ? (val.startsWith('-') ? 'text-red-600' : 'text-green-600 font-bold') : 'text-slate-500';
                        const align = key === 'name' ? 'justify-start px-2' : 'justify-center px-1';
                        const isFrozen = frozenColumns.includes(key);
                        const left = getColumnLeftOffset(key);
                        
                        return (
                            <div key={key} style={{ 
                                    width: colWidths[key],
                                    position: isFrozen ? 'sticky' : 'relative',
                                    left: isFrozen ? left : 'auto',
                                    zIndex: isFrozen ? 30 : 'auto'
                                }} 
                                className={`flex items-center ${align} border-r border-slate-100 overflow-hidden bg-white group-hover:bg-blue-50 ${isFrozen ? 'shadow-[2px_0_5px_rgba(0,0,0,0.05)]' : ''}`}>
                                <span className={`text-[9px] truncate uppercase font-medium ${colorClass}`} title={val}>{val}</span>
                            </div>
                        )
                    })}
                </div>
                
                {/* Grid Cells (Days) */}
                <div className="flex">
                    {daysArray.map(day => {
                        const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const shiftId = currentSchedule.assignments[employee.id]?.[dateKey];
                        const shift = shifts.find(s => s.id === shiftId);
                        const isOff = isWeekendOrHoliday(day);
                        const selected = isSelected(rowIndex, day);

                        return (
                            <div key={day} 
                                onMouseDown={() => handleMouseDown(rowIndex, day)}
                                onMouseEnter={() => handleMouseEnter(rowIndex, day)}
                                onClick={() => handleCellClick(employee.id, day)} 
                                onContextMenu={(e) => handleCellContextMenu(e, employee.id, day)}
                                className={`w-8 h-full border-r border-slate-300 flex items-center justify-center text-[10px] font-bold select-none
                                    ${!shift && isOff ? 'bg-sky-50' : ''} 
                                    ${shift ? shift.color : 'bg-transparent'} 
                                    ${shift?.textColor ? shift.textColor : 'text-slate-700'}
                                    ${selected ? 'ring-2 ring-inset ring-blue-600 bg-blue-100/50' : ''}
                                    hover:brightness-95 hover:z-10
                                    ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}
                                `}>
                                {shift ? shift.code : ''}
                            </div>
                        );
                    })}
                    
                    {/* Right Cols (Stats) - Inline now */}
                     <div className="w-16 flex-shrink-0 border-r border-slate-300 flex items-center justify-center text-[10px] bg-slate-50 font-bold text-slate-700">{stats.daysOff}</div>
                     <div className="w-10 flex-shrink-0 border-r border-slate-300 flex items-center justify-center bg-slate-50">
                        {validation.valid ? (
                            <span className="text-green-500 font-bold">✔</span>
                        ) : (
                            <Tooltip content={validation.messages.join('\n')}>
                                <span className="text-red-500 font-bold cursor-help text-xs">⚠</span>
                            </Tooltip>
                        )}
                    </div>
                </div>
            </div>
        );
        })}
      </div>

      {/* FOOTER: Sticky Bottom */}
      <div className="bg-slate-50 border-t border-slate-300 shadow-inner flex shrink-0 print:hidden w-fit sticky bottom-0 z-40">
          <div className="flex h-10 border-b border-slate-200 w-full">
             <div className="flex-shrink-0 flex items-center justify-end px-2 font-bold text-[10px] text-slate-700 uppercase bg-slate-100 border-r border-slate-300 sticky left-0 z-40" style={{ width: totalLeftWidth }}>
                 Total Ativos / Ideal
             </div>
             <div className="flex min-w-max"> 
                 {dailyStats.map(stat => {
                     const values = Object.values(stat.roleIdeals) as number[];
                     const globalIdeal = values.reduce((a, b) => a + b, 0);
                     const isDeficit = stat.totalActive < globalIdeal;
                     return (
                        <div key={stat.day} className="w-8 flex flex-col items-center justify-center border-r border-slate-200 text-[9px]">
                            <span className={`font-bold ${isDeficit ? 'text-red-600' : 'text-slate-800'}`}>{stat.totalActive}</span>
                        </div>
                     )
                 })}
                 {/* Spacer for Right Cols in Footer */}
                 <div className="w-16 border-r border-slate-200 bg-slate-100"></div>
                 <div className="w-10 border-r border-slate-200 bg-slate-100"></div>
             </div>
          </div>
      </div>
    </div>
  );
};
