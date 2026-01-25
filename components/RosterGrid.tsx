
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Employee, Shift, MonthlySchedule, AIRulesConfig, StaffingConfig, GridSelection, ExtendedColumnKey, ScheduleChange } from '../types';
import { getDaysInMonth, validateSchedule, calculateRequiredDaysOff } from '../services/schedulerService';
import { Tooltip } from './Tooltip';
import { HOLIDAYS, COMMENTS_OPTIONS, MONTH_NAMES } from '../constants';

interface Props {
  employees: Employee[];
  shifts: Shift[];
  currentSchedule: MonthlySchedule;
  setSchedule: React.Dispatch<React.SetStateAction<MonthlySchedule>>;
  rules: AIRulesConfig;
  staffingConfig: StaffingConfig; 
  onReorderEmployees?: (draggedId: string, targetId: string) => void;
  onUpdateEmployee?: (id: string, field: string, value: string) => void;
  onScheduleChange?: (changes: ScheduleChange[]) => void;
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
  isCommentMenu?: boolean;
}

interface DailyStat {
  day: number;
  totalActive: number;
  roleCounts: Record<string, number>;
  roleIdeals: Record<string, number>;
}

const ITEMS_PER_PAGE = 50; 

// --- HELPERS PARA DATA UF ---
const toDisplayDate = (val: string) => {
    if (!val) return '';
    
    // Se for formato ISO YYYY-MM-DD, converte para DD/MM/AA
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const [y, m, d] = val.split('-');
        return `${d}/${m}/${y.slice(2)}`;
    }

    // Se for formato longo ou "sujo" (ex: Tue Jan 13 2026...), tenta parsear
    // Limpeza para remover conteúdo entre parênteses que pode quebrar o Date.parse
    const cleanVal = val.replace(/\(.*\)/, '').trim();
    const d = new Date(cleanVal);
    
    if (!isNaN(d.getTime())) {
         const day = String(d.getDate()).padStart(2, '0');
         const month = String(d.getMonth() + 1).padStart(2, '0');
         const year = String(d.getFullYear()).slice(2);
         return `${day}/${month}/${year}`;
    }

    // Fallback via Regex se o Date.parse falhar para strings verbosas (ex: Tue Jan 13 2026)
    const match = val.match(/(\w{3}) (\w{3}) (\d{1,2}) (\d{4})/);
    if (match) {
        const months: Record<string, string> = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
        const m = months[match[2]] || '01';
        const day = match[3].padStart(2, '0');
        const year = match[4].slice(2);
        return `${day}/${m}/${year}`;
    }

    // Último recurso: Se a string for muito longa e não conseguimos parsear, 
    // retorna 'Data Inv.' ou string vazia para não quebrar o layout
    if (val.length > 15) return 'Data Inv.';

    return val;
};

const normalizeDateInput = (val: string) => {
    // Remove tudo que não for dígito ou barra
    const clean = val.replace(/[^0-9/]/g, '');
    
    // DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(clean)) {
        const [d, m, y] = clean.split('/');
        return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    // DD/MM/YY
    if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(clean)) {
        const [d, m, y] = clean.split('/');
        return `20${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    // 250925 (DDMMAA)
    if (/^\d{6}$/.test(clean)) {
        const d = clean.slice(0,2);
        const m = clean.slice(2,4);
        const y = clean.slice(4,6);
        return `20${y}-${m}-${d}`;
    }
    // 25092025 (DDMMAAAA)
    if (/^\d{8}$/.test(clean)) {
        const d = clean.slice(0,2);
        const m = clean.slice(2,4);
        const y = clean.slice(4,8);
        return `${y}-${m}-${d}`;
    }
    
    return val;
}

export const RosterGrid: React.FC<Props> = ({ 
    employees, shifts, currentSchedule, setSchedule, rules, staffingConfig, 
    onReorderEmployees, onUpdateEmployee, onScheduleChange, isReadOnly = false, onUndo, onRedo, currentUserId
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, type: 'cell', x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Refs for scrolling synchronization
  const gridContainerRef = useRef<HTMLDivElement>(null); 
  const footerScrollRef = useRef<HTMLDivElement>(null); 
  
  const internalClipboard = useRef<string | null>(null);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);

  const [draggedEmployeeId, setDraggedEmployeeId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: ExtendedColumnKey | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  
  const [hiddenColumns, setHiddenColumns] = useState<ExtendedColumnKey[]>([]);
  const [frozenColumns, setFrozenColumns] = useState<ExtendedColumnKey[]>(['name']);
  const [colWidths, setColWidths] = useState<Record<ExtendedColumnKey, number>>({
      name: 220, id: 80, role: 120, cpf: 100, scale: 60, time: 80, shiftType: 100, position: 80, council: 100, bh: 60, uf: 95
  });

  // Load User Preferences
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

  // Save User Preferences
  useEffect(() => {
      if (currentUserId) {
          localStorage.setItem(`USER_PREFS_${currentUserId}`, JSON.stringify({ hiddenColumns, frozenColumns, colWidths }));
      }
  }, [hiddenColumns, frozenColumns, colWidths, currentUserId]);

  const [resizing, setResizing] = useState<{ key: ExtendedColumnKey, startX: number, startWidth: number } | null>(null);
  const [selection, setSelection] = useState<GridSelection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [focusedCell, setFocusedCell] = useState<{empIndex: number, day: number} | null>(null);

  const daysInMonth = useMemo(() => getDaysInMonth(currentSchedule.month, currentSchedule.year), [currentSchedule.month, currentSchedule.year]);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

  // Sorting
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

  // Reset page when employees filter changes
  useEffect(() => {
      setCurrentPage(1);
  }, [employees.length]);

  // PAGINATION LOGIC
  const paginatedEmployees = useMemo(() => {
      // IN PRINT MODE: Show ALL employees (disable pagination logic visually, though data might need handling if list is HUGE)
      // For now, we still use pagination on screen, but print CSS will try to show everything if we restructure.
      // Actually, standard approach is: On screen (paginated), On print (usually print what's on screen or need a "Print View" mode).
      // Given the requirement, let's keep screen paginated.
      const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
      return sortedEmployees.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedEmployees, currentPage]);

  const totalPages = Math.ceil(sortedEmployees.length / ITEMS_PER_PAGE);

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

  // Helper to calculate total days off for an employee
  const calculateTotalDaysOff = (empId: string, schedule: MonthlySchedule) => {
      let count = 0;
      Object.values(schedule.assignments[empId] || {}).forEach(sid => {
          const s = shifts.find(sh => sh.id === sid);
          if (s?.category === 'dayoff') count++;
      });
      return count;
  };

  // Sync Footer Scroll with Grid Scroll
  const handleGridScroll = () => {
    if (gridContainerRef.current && footerScrollRef.current) {
        footerScrollRef.current.scrollLeft = gridContainerRef.current.scrollLeft;
    }
  };

  // --- CLICK OUTSIDE ---
  useEffect(() => {
    const handleBackgroundClick = (e: MouseEvent) => {
      // If clicking inside the menu, do nothing
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
          return;
      }

      if (gridContainerRef.current && gridContainerRef.current.contains(e.target as Node)) {
          const target = e.target as HTMLElement;
          // Check if clicked exactly on the background container (the scroll area), not a cell
          if (target === gridContainerRef.current || target.classList.contains('roster-bg')) {
             setSelection(null);
             setFocusedCell(null);
             setContextMenu(prev => ({...prev, visible: false}));
          } else {
             // Clicked on a cell or header, let the specific handlers deal with it, 
             // BUT if it's a left click, we generally want to close context menu unless it opened one
             if (e.button === 0) { // Left click
                 setContextMenu(prev => ({...prev, visible: false}));
             }
          }
      } else {
          // Clicked outside grid entirely
          setContextMenu(prev => ({...prev, visible: false}));
      }
    };
    document.addEventListener('mousedown', handleBackgroundClick);
    return () => document.removeEventListener('mousedown', handleBackgroundClick);
  }, []);

  // --- RESIZING ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!resizing) return;
        const delta = e.pageX - resizing.startX;
        setColWidths(prev => ({ ...prev, [resizing.key]: Math.max(40, resizing.startWidth + delta) }));
    };
    const handleMouseUp = () => { if (resizing) { setResizing(null); document.body.style.cursor = 'default'; } };
    if (resizing) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); document.body.style.cursor = 'col-resize'; }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [resizing]);

  const handleResizeStart = (e: React.MouseEvent, key: ExtendedColumnKey) => {
      e.preventDefault(); e.stopPropagation();
      setResizing({ key, startX: e.pageX, startWidth: colWidths[key] });
  };

  // --- INTERACTION ---
  const handleMouseDown = (e: React.MouseEvent, rowIndex: number, day: number) => {
    // Only allow Left Click (0) to start selection
    if (e.button !== 0 || isReadOnly) return;
    
    setIsSelecting(true);
    setSelection({ startRow: rowIndex, startCol: day, endRow: rowIndex, endCol: day });
    setFocusedCell({ empIndex: rowIndex, day });
    // IMPORTANT: Close menu on left click
    setContextMenu(prev => ({...prev, visible: false}));
  };

  const handleMouseEnter = (rowIndex: number, day: number) => {
    if (isSelecting && selection) setSelection({ ...selection, endRow: rowIndex, endCol: day });
  };

  const handleMouseUp = () => setIsSelecting(false);
  const handleMouseLeaveGrid = () => setIsSelecting(false);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (isReadOnly) return;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            if (document.activeElement?.tagName === 'INPUT') return;
            e.preventDefault();
            if (!focusedCell) { setFocusedCell({ empIndex: 0, day: 1 }); setSelection({ startRow: 0, startCol: 1, endRow: 0, endCol: 1 }); return; }
            let { empIndex, day } = focusedCell;
            if (e.key === 'ArrowUp') empIndex = Math.max(0, empIndex - 1);
            if (e.key === 'ArrowDown') empIndex = Math.min(paginatedEmployees.length - 1, empIndex + 1);
            if (e.key === 'ArrowLeft') day = Math.max(1, day - 1);
            if (e.key === 'ArrowRight') day = Math.min(daysInMonth, day + 1);
            setFocusedCell({ empIndex, day });
            if (e.shiftKey && selection) setSelection({ ...selection, endRow: empIndex, endCol: day });
            else setSelection({ startRow: empIndex, startCol: day, endRow: empIndex, endCol: day });
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); if (onUndo) onUndo(); return; }
        if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) { e.preventDefault(); if (onRedo) onRedo(); return; }
        if (!selection) return;

        // DELETE Logic
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (document.activeElement?.tagName === 'INPUT') return;
            e.preventDefault();
            const minR = Math.min(selection.startRow, selection.endRow);
            const maxR = Math.max(selection.startRow, selection.endRow);
            const minC = Math.min(selection.startCol, selection.endCol);
            const maxC = Math.max(selection.startCol, selection.endCol);

            const newAssignments = { ...currentSchedule.assignments };
            const changes: ScheduleChange[] = [];
            
            let changed = false;
            for (let r = minR; r <= maxR; r++) {
                const emp = paginatedEmployees[r]; 
                if (!emp) continue;
                for (let c = minC; c <= maxC; c++) {
                    const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
                    if(newAssignments[emp.id]?.[dateKey]) { 
                        delete newAssignments[emp.id][dateKey]; 
                        changed = true;
                        
                        const tempSchedule = { ...currentSchedule, assignments: newAssignments };
                        const totalDaysOff = calculateTotalDaysOff(emp.id, tempSchedule);

                        changes.push({ 
                            employeeId: emp.id, 
                            day: c, 
                            shiftCode: '', 
                            employee: emp,
                            totalDaysOff: totalDaysOff,
                            month: currentSchedule.month,
                            year: currentSchedule.year
                        });
                    }
                }
            }
            if (changed) {
                setSchedule(prev => ({ ...prev, assignments: newAssignments }));
                if (onScheduleChange) onScheduleChange(changes);
            }
        }

        // COPY
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            const startR = Math.min(selection.startRow, selection.endRow);
            const startC = Math.min(selection.startCol, selection.endCol);
            const emp = paginatedEmployees[startR];
            if (!emp) return;
            const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(startC).padStart(2, '0')}`;
            const shiftId = currentSchedule.assignments[emp.id]?.[dateKey];
            if (shiftId) internalClipboard.current = shiftId;
        }

        // PASTE
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
             let shiftId = internalClipboard.current;
             if (shiftId) {
                const shift = shifts.find(s => s.id === shiftId);
                const minR = Math.min(selection.startRow, selection.endRow);
                const maxR = Math.max(selection.startRow, selection.endRow);
                const minC = Math.min(selection.startCol, selection.endCol);
                const maxC = Math.max(selection.startCol, selection.endCol);

                const newAssignments = { ...currentSchedule.assignments };
                const changes: ScheduleChange[] = [];

                for (let r = minR; r <= maxR; r++) {
                    const emp = paginatedEmployees[r];
                    if (!emp) continue;
                    if (!newAssignments[emp.id]) newAssignments[emp.id] = {};
                    const empSchedule = { ...newAssignments[emp.id] };
                    for (let c = minC; c <= maxC; c++) {
                        const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
                        empSchedule[dateKey] = shiftId;
                        newAssignments[emp.id] = empSchedule; // update immediately for next iter calculation if needed
                        
                        const tempSchedule = { ...currentSchedule, assignments: newAssignments };
                        const totalDaysOff = calculateTotalDaysOff(emp.id, tempSchedule);

                        changes.push({ 
                            employeeId: emp.id, 
                            day: c, 
                            shiftCode: shift?.code || '',
                            employee: emp,
                            totalDaysOff: totalDaysOff,
                            month: currentSchedule.month,
                            year: currentSchedule.year
                        });
                    }
                }
                setSchedule(prev => ({ ...prev, assignments: newAssignments }));
                if (onScheduleChange) onScheduleChange(changes);
             }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, currentSchedule, paginatedEmployees, isReadOnly, focusedCell, setSchedule, onUndo, onRedo, shifts, onScheduleChange]);

  const isSelected = (rowIndex: number, day: number) => {
    if (!selection) return false;
    const minR = Math.min(selection.startRow, selection.endRow);
    const maxR = Math.max(selection.startRow, selection.endRow);
    const minC = Math.min(selection.startCol, selection.endCol);
    const maxC = Math.max(selection.startCol, selection.endCol);
    return rowIndex >= minR && rowIndex <= maxR && day >= minC && day <= maxC;
  };

  // --- STATS (Calculated on FULL List for accuracy) ---
  const dailyStats = useMemo<DailyStat[]>(() => {
      // Avoid expensive calc if 16k employees and user is just navigating
      // Optimization: Only recalc if employees or schedule changes
      return daysArray.map(day => {
          const date = new Date(currentSchedule.year, currentSchedule.month, day);
          const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const dayKey = dayKeys[date.getDay()];
          const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          
          let totalActive = 0;
          const roleCounts: Record<string, number> = {};

          // Iterate FULL list for stats
          employees.forEach(emp => {
              const shiftId = currentSchedule.assignments[emp.id]?.[dateKey];
              const shift = shifts.find(s => s.id === shiftId);
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

  const getDayLabel = (day: number) => weekDays[new Date(currentSchedule.year, currentSchedule.month, day).getDay()];
  const isWeekendOrHoliday = (day: number) => {
    const dayOfWeek = new Date(currentSchedule.year, currentSchedule.month, day).getDay();
    const holidayKey = `${String(day).padStart(2, '0')}-${String(currentSchedule.month + 1).padStart(2, '0')}`;
    return dayOfWeek === 0 || dayOfWeek === 6 || HOLIDAYS[holidayKey] !== undefined;
  }
  const getHolidayName = (day: number) => HOLIDAYS[`${String(day).padStart(2, '0')}-${String(currentSchedule.month + 1).padStart(2, '0')}`];

  // --- MENU HANDLERS ---
  const handleCellContextMenu = (e: React.MouseEvent, employeeId: string, day: number) => {
      e.preventDefault(); 
      e.stopPropagation(); // Stop bubbling to prevent immediate closure or parent conflicts
      if (isReadOnly) return;
      
      const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const shiftId = currentSchedule.assignments[employeeId]?.[dateKey];
      const shift = shifts.find(s => s.id === shiftId);
      let assignmentType: ContextMenuState['assignmentType'] = 'other';
      if (shift?.category === 'absence' || shift?.category === 'leave') assignmentType = 'leave';
      
      setContextMenu({ visible: true, type: 'cell', x: e.clientX, y: e.clientY, employeeId, day, assignmentType, isCommentMenu: false });
  };

  const handleHeaderContextMenu = (e: React.MouseEvent, key: ExtendedColumnKey) => { 
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ visible: true, type: 'header', x: e.clientX, y: e.clientY, columnKey: key }); 
  };
  
  const handleAddComment = (comment: string) => { if (contextMenu.employeeId && contextMenu.day) { const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(contextMenu.day).padStart(2, '0')}`; setSchedule(prev => ({ ...prev, comments: { ...prev.comments, [contextMenu.employeeId!]: { ...(prev.comments?.[contextMenu.employeeId!] || {}), [dateKey]: comment } } })); } setContextMenu(prev => ({...prev, visible: false, isCommentMenu: false})); }
  
  const handleSelectShift = (shiftId: string) => { 
      if (contextMenu.employeeId && contextMenu.day) { 
          const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(contextMenu.day).padStart(2, '0')}`; 
          const shift = shifts.find(s => s.id === shiftId);
          
          // Optimistic update
          const newAssignments = { ...currentSchedule.assignments };
          if (!newAssignments[contextMenu.employeeId]) newAssignments[contextMenu.employeeId] = {};
          newAssignments[contextMenu.employeeId][dateKey] = shiftId;
          
          setSchedule(prev => ({ ...prev, assignments: newAssignments })); 
          
          if (onScheduleChange) {
              const emp = employees.find(e => e.id === contextMenu.employeeId);
              if (emp) {
                  // Calc new total
                  const tempSchedule = { ...currentSchedule, assignments: newAssignments };
                  const totalDaysOff = calculateTotalDaysOff(emp.id, tempSchedule);

                  onScheduleChange([{ 
                      employeeId: emp.id, 
                      day: contextMenu.day!, 
                      shiftCode: shift?.code || '',
                      employee: emp,
                      totalDaysOff: totalDaysOff,
                      month: currentSchedule.month,
                      year: currentSchedule.year
                  }]);
              }
          }
      } 
      setContextMenu(prev => ({ ...prev, visible: false })); 
  };
  
  const handleClearCell = () => { 
      if (contextMenu.employeeId && contextMenu.day) { 
          const dateKey = `${currentSchedule.year}-${String(currentSchedule.month + 1).padStart(2, '0')}-${String(contextMenu.day).padStart(2, '0')}`; 
          const newAssignments = { ...(currentSchedule.assignments[contextMenu.employeeId!] || {}) }; 
          delete newAssignments[dateKey]; 
          // Note: Attachments cleanup removed as feature is disabled
          const newComments = { ...(currentSchedule.comments?.[contextMenu.employeeId!] || {}) }; if(newComments[dateKey]) delete newComments[dateKey]; 
          
          // Update Schedule State
          const updatedAssignments = { ...currentSchedule.assignments, [contextMenu.employeeId!]: newAssignments };
          
          setSchedule(prev => ({ ...prev, assignments: updatedAssignments, comments: { ...prev.comments, [contextMenu.employeeId!]: newComments } })); 
          
          if (onScheduleChange) {
              const emp = employees.find(e => e.id === contextMenu.employeeId);
              if (emp) {
                  const tempSchedule = { ...currentSchedule, assignments: updatedAssignments };
                  const totalDaysOff = calculateTotalDaysOff(emp.id, tempSchedule);

                  onScheduleChange([{ 
                      employeeId: emp.id, 
                      day: contextMenu.day!, 
                      shiftCode: '',
                      employee: emp,
                      totalDaysOff: totalDaysOff,
                      month: currentSchedule.month,
                      year: currentSchedule.year
                  }]);
              }
          }
      } 
      setContextMenu(prev => ({ ...prev, visible: false })); 
  }

  const handleDragStart = (e: React.DragEvent, id: string) => { if (isReadOnly) return; setDraggedEmployeeId(id); e.dataTransfer.effectAllowed = 'move'; };
  const handleDrop = (e: React.DragEvent, targetId: string) => { e.preventDefault(); if (isReadOnly) return; if (draggedEmployeeId && draggedEmployeeId !== targetId && onReorderEmployees) { onReorderEmployees(draggedEmployeeId, targetId); } setDraggedEmployeeId(null); };

  const labelMap: Record<ExtendedColumnKey, string> = { name: 'NOME COLABORADOR', id: 'ID', role: 'CARGO', cpf: 'CPF', scale: 'ESCALA', time: 'HORÁRIO', shiftType: 'TURNO', position: 'Nº POSIÇÃO', council: 'REG. CONSELHO', bh: 'BH', uf: 'UF' };

  return (
    <div className="roster-bg bg-white rounded shadow-sm border border-slate-300 flex flex-col h-full w-full overflow-hidden select-none relative print:border-none print:shadow-none print:block print:overflow-visible" onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeaveGrid}>
      
      {/* --- CABEÇALHO DE IMPRESSÃO (Visível apenas ao imprimir) --- */}
      <div className="hidden print:flex flex-col mb-4 px-2 pt-2 border-b-2 border-slate-800 pb-2">
           <div className="flex justify-between items-end">
               <div>
                   <h1 className="text-2xl font-bold uppercase text-company-blue tracking-tight">ESCALA MENSAL - PREVENT SENIOR</h1>
                   <h2 className="text-lg font-bold text-slate-700 uppercase">{MONTH_NAMES[currentSchedule.month]} / {currentSchedule.year}</h2>
               </div>
               <div className="text-right">
                   <p className="text-xs text-slate-500 uppercase">Gerado via EscalaFácil AI</p>
                   <p className="text-xs text-slate-500">{new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
               </div>
           </div>
      </div>

      {/* Hidden Columns Button - Highest Z-Index in Grid Context */}
      {hiddenColumns.length > 0 && <button onClick={() => setHiddenColumns([])} title="Restaurar Colunas" className="absolute top-1 left-1 z-[90] bg-blue-100 text-blue-700 p-1.5 rounded-full shadow hover:bg-blue-200 print:hidden transition-all w-fit h-fit"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" /><path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg></button>}

      {/* Context Menu - Fixed Position to avoid clipping */}
      {contextMenu.visible && (
          <div ref={menuRef} className="fixed z-[9999] bg-white shadow-xl rounded-lg border border-slate-200 py-1 min-w-[180px]" style={{ top: Math.min(contextMenu.y, window.innerHeight - 300), left: Math.min(contextMenu.x, window.innerWidth - 200) }}>
              {contextMenu.type === 'header' ? (
                  <>
                    <button onClick={() => { if(contextMenu.columnKey) { setFrozenColumns(prev => prev.includes(contextMenu.columnKey as any) ? prev.filter(k=>k!==contextMenu.columnKey) : [...prev, contextMenu.columnKey as any]); setContextMenu(prev=>({...prev, visible:false})); }}} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-slate-700">Congelar/Descongelar</button>
                    <button onClick={() => { if(contextMenu.columnKey) setHiddenColumns(prev => [...prev, contextMenu.columnKey as ExtendedColumnKey]); setContextMenu(prev => ({...prev, visible:false}))}} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs text-red-600 font-bold border-t">Ocultar Coluna</button>
                    {hiddenColumns.length > 0 && <button onClick={() => { setHiddenColumns([]); setContextMenu(prev=>({...prev, visible:false})); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs text-blue-600 font-bold border-t">Mostrar Todas</button>}
                  </>
              ) : contextMenu.isCommentMenu ? (
                  <>
                      <button onClick={() => setContextMenu(prev => ({...prev, isCommentMenu: false}))} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs text-slate-500 border-b">◄ Voltar</button>
                      {COMMENTS_OPTIONS.map(opt => <button key={opt} onClick={() => handleAddComment(opt)} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-xs font-bold text-slate-700">{opt}</button>)}
                  </>
              ) : (
                  <>
                    <button onClick={() => setContextMenu(prev => ({...prev, isCommentMenu: true}))} className="w-full text-left px-4 py-2 hover:bg-orange-50 text-xs font-bold text-orange-700 border-b flex items-center gap-2">💬 Adicionar Observação</button>
                    <button onClick={handleClearCell} className="w-full text-left px-4 py-2 hover:bg-red-50 text-xs text-red-600 font-bold border-b">Limpar</button>
                    <div className="max-h-60 overflow-y-auto">{shifts.map(shift => <button key={shift.id} onClick={() => handleSelectShift(shift.id)} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-xs text-slate-700 flex items-center gap-2"><span className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold border ${shift.color} ${shift.textColor || 'text-slate-800'}`}>{shift.code}</span><span>{shift.name}</span></button>)}</div>
                  </>
              )}
          </div>
      )}

      {/* UNIFIED SCROLLABLE AREA */}
      <div 
        ref={gridContainerRef}
        className="flex-1 overflow-auto w-full relative print:overflow-visible print:h-auto"
        onScroll={handleGridScroll}
      >
        {/* HEADER - STICKY TOP */}
        <div className="sticky top-0 z-[60] bg-company-blue text-white shadow-md w-fit flex min-w-max print:static print:shadow-none">
            <div className="flex-shrink-0 flex border-r border-blue-800 bg-company-blue z-50 print:border-slate-300">
                {visibleColumns.map((key) => {
                    const isFrozen = frozenColumns.includes(key); const left = getStickyLeft(key);
                    return (
                    <div key={key} style={{ width: colWidths[key], position: isFrozen ? 'sticky' : 'relative', left: isFrozen ? left : 'auto', zIndex: isFrozen ? 60 : 'auto' }} onClick={() => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }))} onContextMenu={(e) => handleHeaderContextMenu(e, key)} className={`relative p-2 font-bold text-[10px] border-r border-blue-800 flex items-center justify-center overflow-hidden whitespace-nowrap cursor-pointer hover:bg-blue-900 group ${isFrozen ? 'bg-company-blue shadow-[2px_0_5px_rgba(0,0,0,0.2)]' : ''} print:border-slate-300 print:shadow-none`}>
                        {labelMap[key]} {sortConfig.key === key && <span className="ml-1 text-[8px]">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>}
                        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-50 group-hover:bg-blue-600/50 print:hidden" onMouseDown={(e) => handleResizeStart(e, key)} onClick={(e) => e.stopPropagation()}/>
                    </div>
                )})}
            </div>
            <div className="flex min-w-max">
                {daysArray.map(day => (<div key={day} className={`w-8 flex flex-col items-center justify-center border-r border-blue-800 print:border-slate-300 ${isWeekendOrHoliday(day) ? 'bg-sky-500/30' : ''}`} title={getHolidayName(day)}><span className="text-[9px] font-medium opacity-80 uppercase">{getDayLabel(day).substring(0, 1)}</span><span className="text-[10px] font-bold">{String(day).padStart(2, '0')}</span></div>))}
                 <div className="w-16 flex-shrink-0 p-2 font-bold text-[10px] border-r border-blue-800 flex items-center justify-center bg-company-blue print:border-slate-300">FOLGAS</div>
                 <div className="w-10 flex-shrink-0 p-2 font-bold text-[10px] border-r border-blue-800 flex items-center justify-center bg-company-blue print:border-slate-300">ST</div>
            </div>
        </div>

        {/* BODY */}
        <div className="flex flex-col min-w-max">
            {paginatedEmployees.map((employee, idx) => {
            const rowIndex = (currentPage - 1) * ITEMS_PER_PAGE + idx;
            const validation = validateSchedule(employee.id, currentSchedule, shifts, rules, employees);
            let daysOffCount = 0; Object.values(currentSchedule.assignments[employee.id] || {}).forEach(sid => { if (shifts.find(s=>s.id===sid)?.category === 'dayoff') daysOffCount++; });
            const targetDaysOff = calculateRequiredDaysOff(currentSchedule.month, currentSchedule.year, employee.shiftPattern);
            const isExcessDaysOff = daysOffCount > targetDaysOff;

            return (
                <div key={employee.id} className="flex border-b border-slate-300 bg-white hover:bg-blue-50 transition-colors group h-9 print:h-auto">
                    {/* Left Cols */}
                    <div draggable={!isReadOnly} onDragStart={(e) => handleDragStart(e, employee.id)} onDrop={(e) => handleDrop(e, employee.id)} onDragOver={(e) => e.preventDefault()} className="flex-shrink-0 flex border-r border-slate-300 bg-white z-10 group-hover:bg-blue-50 cursor-move">
                        {visibleColumns.map(key => {
                            let val = key === 'scale' ? employee.shiftPattern : key === 'time' ? employee.workTime : key === 'position' ? employee.positionNumber : key === 'council' ? employee.categoryCode : key === 'bh' ? employee.bankHoursBalance : key === 'uf' ? employee.lastDayOff : (employee as any)[key];
                            
                            // Formatação especial para UF
                            let displayVal = val;
                            if (key === 'uf') {
                                displayVal = toDisplayDate(val);
                            }

                            const colorClass = key === 'bh' ? (val && val.startsWith('-') ? 'text-red-600' : 'text-green-600 font-bold') : 'text-slate-500';
                            const isFrozen = frozenColumns.includes(key); const left = getStickyLeft(key);
                            const canEditCell = !isReadOnly && (key === 'shiftType' || key === 'uf');

                            return (
                                <div key={key} style={{ width: colWidths[key], position: isFrozen ? 'sticky' : 'relative', left: isFrozen ? left : 'auto', zIndex: isFrozen ? 50 : 'auto' }} className={`flex items-center px-2 border-r border-slate-100 overflow-hidden bg-white group-hover:bg-blue-50 ${isFrozen ? 'shadow-[2px_0_5px_rgba(0,0,0,0.05)]' : ''} print:shadow-none`}>
                                    {canEditCell ? (
                                        key === 'uf' ? (
                                            <div className="relative w-full h-full flex items-center justify-between px-1 group/uf">
                                                <input 
                                                    type="text" 
                                                    className="w-full h-full bg-transparent border-none text-[10px] uppercase font-medium focus:ring-1 focus:ring-blue-500 rounded px-1 min-w-0"
                                                    placeholder="DD/MM/AA"
                                                    value={displayVal || ''} 
                                                    onChange={(e) => { if (onUpdateEmployee) onUpdateEmployee(employee.id, 'lastDayOff', e.target.value); }}
                                                    onBlur={(e) => { if (onUpdateEmployee) onUpdateEmployee(employee.id, 'lastDayOff', normalizeDateInput(e.target.value)); }}
                                                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); }}
                                                />
                                                <div className="relative w-5 h-full flex items-center justify-center cursor-pointer text-slate-400 hover:text-blue-500 pr-1 print:hidden">
                                                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 pointer-events-none">
                                                        <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                                                     </svg>
                                                     <input 
                                                        type="date" 
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                                                        value={/^\d{4}-\d{2}-\d{2}$/.test(val) ? val : ''} 
                                                        onChange={(e) => { if (onUpdateEmployee) onUpdateEmployee(employee.id, 'lastDayOff', e.target.value); }} 
                                                     />
                                                </div>
                                            </div>
                                        ) : (
                                            <input type="text" className="w-full bg-transparent border-none text-[10px] uppercase font-medium focus:ring-1 focus:ring-blue-500 rounded px-1 min-w-0 h-full" value={val || ''} onChange={(e) => { if (onUpdateEmployee) onUpdateEmployee(employee.id, 'shiftType', e.target.value); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); }} />
                                        )
                                    ) : (<span className={`text-[9px] truncate uppercase font-medium ${colorClass}`} title={val}>{displayVal}</span>)}
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
                            const comment = currentSchedule.comments?.[employee.id]?.[dateKey];
                            const isViolation = validation.invalidDays.includes(day);

                            // Background Priority: Shift Color > Weekend/Holiday Column Color > Transparent
                            // Using bg-sky-500/10 for weekend columns to match header style but lighter.
                            const cellBackground = shift ? shift.color : (isOff ? 'bg-sky-500/10' : 'bg-transparent');

                            return (
                                <div key={day} onMouseDown={(e) => handleMouseDown(e, rowIndex, day)} onMouseEnter={() => handleMouseEnter(rowIndex, day)} onContextMenu={(e) => handleCellContextMenu(e, employee.id, day)} 
                                className={`w-8 h-full flex items-center justify-center text-[10px] font-bold select-none relative 
                                    ${isViolation ? 'border border-red-400 z-10' : 'border-r border-slate-300'}
                                    ${cellBackground}
                                    ${shift?.textColor ? shift.textColor : 'text-slate-700'} 
                                    ${selected ? 'ring-2 ring-inset ring-blue-600 bg-blue-100/50 print:ring-0' : ''} 
                                    ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}>
                                    {shift ? shift.code : ''}
                                    {comment && <Tooltip content={`Obs: ${comment}`}><span className="absolute bottom-0 right-0 w-0 h-0 border-l-[6px] border-l-transparent border-b-[6px] border-b-orange-500 print:hidden"></span></Tooltip>}
                                </div>
                            );
                        })}
                         <div className={`w-16 flex-shrink-0 border-r border-slate-300 flex items-center justify-center text-[10px] bg-slate-50 font-bold ${isExcessDaysOff ? 'text-red-600' : 'text-slate-700'} print:bg-white`}>{String(daysOffCount).padStart(2, '0')}/{String(targetDaysOff).padStart(2, '0')}</div>
                         <div className="w-10 flex-shrink-0 border-r border-slate-300 flex items-center justify-center bg-slate-50 relative group/st print:bg-white">
                             {validation.valid ? <span className="text-green-500 font-bold print:hidden">✔</span> : (
                                <div className="relative flex justify-center w-full h-full items-center">
                                    <span className="text-red-500 font-bold cursor-help text-xs print:hidden">⚠</span>
                                    {/* Tooltip fixed to left to avoid overflow off screen */}
                                    <div className="absolute top-full right-0 mt-1 hidden group-hover/st:block z-[9999] w-72 bg-gray-900 text-white text-[10px] p-2 rounded shadow-xl whitespace-pre-line text-left border border-gray-700 print:hidden">
                                        {validation.messages.join('\n')}
                                    </div>
                                </div>
                             )}
                        </div>
                    </div>
                </div>
            )})}
        </div>
        
        {/* --- RODAPÉ DE IMPRESSÃO (Legendas e Assinaturas) --- */}
        <div className="hidden print:block mt-8 break-inside-avoid px-2">
            <h3 className="font-bold text-sm uppercase mb-2 border-b border-black pb-1">Legendas</h3>
            <div className="flex flex-wrap gap-4 mb-8">
               {shifts.map(s => (
                   <div key={s.id} className="flex items-center gap-2">
                       <div className={`w-5 h-5 border border-black flex items-center justify-center text-[10px] font-bold ${s.color} ${s.textColor || 'text-black'}`}>{s.code}</div>
                       <span className="text-[10px] uppercase font-bold">{s.name}</span>
                   </div>
               ))}
            </div>

            <div className="flex justify-between mt-16">
               <div className="w-1/3 text-center">
                   <div className="border-t border-black pt-1">
                       <p className="font-bold text-xs uppercase">Assinatura do Responsável</p>
                   </div>
               </div>
               <div className="w-1/3 text-center">
                   <div className="border-t border-black pt-1">
                       <p className="font-bold text-xs uppercase">Assinatura da Gestão</p>
                   </div>
               </div>
            </div>
        </div>

      </div>
      
      {/* FOOTER - STATS & PAGINATION (Escondido na impressão padrão) */}
      <div className="bg-slate-50 border-t border-slate-300 shadow-inner flex flex-col shrink-0 print:hidden z-50">
          <div className="flex h-10 border-b border-slate-200 w-full overflow-hidden" ref={footerScrollRef}>
             {/* Sticky label in Footer (Synced to grid's frozen columns width) */}
             <div className="flex-shrink-0 flex items-center justify-end px-2 font-bold text-[10px] text-slate-700 uppercase bg-slate-100 border-r border-slate-300 sticky left-0 z-40" style={{ width: totalLeftWidth }}>Total Ativos / Ideal</div>
             <div className="flex min-w-max"> 
                 {dailyStats.map(stat => {
                     const values = Object.values(stat.roleIdeals) as number[];
                     const globalIdeal = values.reduce((a, b) => a + b, 0);
                     const isDeficit = stat.totalActive < globalIdeal;
                     return (<div key={stat.day} className="w-8 flex flex-col items-center justify-center border-r border-slate-200 text-[9px]"><span className={`font-bold ${isDeficit ? 'text-red-600' : 'text-slate-800'}`}>{stat.totalActive}</span></div>)
                 })}
                 <div className="w-16 border-r border-slate-200 bg-slate-100"></div><div className="w-10 border-r border-slate-200 bg-slate-100"></div>
             </div>
          </div>
          
          {/* PAGINATION CONTROLS */}
          <div className="flex items-center justify-between p-2 bg-white text-xs border-t border-slate-200">
             <div className="text-slate-500">
                 Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, sortedEmployees.length)} de {sortedEmployees.length} colaboradores
             </div>
             <div className="flex items-center gap-2">
                 <button 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
                    disabled={currentPage === 1}
                    className="px-3 py-1 bg-slate-100 border rounded hover:bg-slate-200 disabled:opacity-50"
                 >
                     Anterior
                 </button>
                 <span className="font-bold text-slate-700">Página {currentPage} de {totalPages}</span>
                 <button 
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 bg-slate-100 border rounded hover:bg-slate-200 disabled:opacity-50"
                 >
                     Próxima
                 </button>
             </div>
          </div>
      </div>
    </div>
  );
};
