import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { INITIAL_EMPLOYEES, INITIAL_SHIFTS, MONTH_NAMES, INITIAL_UNITS, INITIAL_SECTORS, INITIAL_SHIFT_TYPES } from './constants.ts';
import { Employee, MonthlySchedule, Shift, AIRulesConfig, StaffingConfig, User, ScheduleChange } from './types.ts';
import { EmployeeManager } from './components/EmployeeManager.tsx';
import { ShiftManager } from './components/ShiftManager.tsx';
import { RosterGrid } from './components/RosterGrid.tsx';
import { RulesModal } from './components/RulesModal.tsx';
import { StaffingModal } from './components/StaffingModal.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { UserManagement } from './components/UserManagement.tsx';
import { FilterManagerModal } from './components/FilterManagerModal.tsx';
import { generateAISchedule, getDaysInMonth } from './services/schedulerService.ts';
import { Tooltip } from './components/Tooltip.tsx';
import { EmployeeDatabaseScreen } from './components/EmployeeDatabaseScreen.tsx';
import { MultiSelect } from './components/MultiSelect.tsx';
import { ReportsScreen } from './components/ReportsScreen.tsx';
import { GenerationScopeModal } from './components/GenerationScopeModal.tsx';
import { ConfirmationModal } from './components/ConfirmationModal.tsx';
import { GoogleSheetsService } from './services/googleSheetsService.ts';
import { StorageService } from './services/storageService.ts';

// Icons
const SaveIcon = ({ saved, saving }: { saved: boolean, saving: boolean }) => (
    saving ? (
        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${saved ? 'text-green-400' : 'text-white'}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d={saved ? "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" : "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"} />
        </svg>
    )
);
const PrintIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015-1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>;
const TagIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>;
const MegaphoneIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 018.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.467a23.879 23.879 0 00-1.014-5.395m0 3.467c-.291 1.126-.541 2.274-.75 3.446M12.5 12h.008v.008H12.5V12z" /></svg>;
const ChartBarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>;
const RefreshIcon = ({ spinning }: { spinning: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${spinning ? 'animate-spin' : ''}`}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
);
const CloudSyncIcon = ({ syncing }: { syncing: boolean }) => (
    <div className={`relative ${syncing ? 'text-blue-200' : 'text-green-400'}`} title={syncing ? "Sincronizando com a Nuvem..." : "Conectado"}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${syncing ? 'animate-pulse' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
        </svg>
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500 border border-company-blue"></span>
    </div>
);


const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<'roster' | 'database' | 'reports'>('roster');

  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [shifts, setShifts] = useState<Shift[]>(INITIAL_SHIFTS);
  const [currentDate, setCurrentDate] = useState(new Date());

  const [units, setUnits] = useState<string[]>(INITIAL_UNITS);
  const [sectors, setSectors] = useState<string[]>(INITIAL_SECTORS);
  const [shiftTypesList, setShiftTypesList] = useState<string[]>(INITIAL_SHIFT_TYPES);

  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedShiftTypes, setSelectedShiftTypes] = useState<string[]>([]);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');

  const [aiRules, setAiRules] = useState<AIRulesConfig>({ 
      maxConsecutiveDays: 6, minRestHours: 11, preferSundayOff: true, sundayOffFrequency: 2, preferConsecutiveDaysOff: true,
      allowExtraDaysOff: false, extraDaysOffCount: 1 
  });
  const [staffingConfig, setStaffingConfig] = useState<StaffingConfig>({});
  
  const [schedule, setScheduleState] = useState<MonthlySchedule>({ month: currentDate.getMonth(), year: currentDate.getFullYear(), assignments: {}, attachments: {}, comments: {} });
  
  const dirtyRegisters = useRef(new Map<string, ScheduleChange>());
  const dirtyEmployeeMetadata = useRef(new Set<string>());

  const [historyPast, setHistoryPast] = useState<MonthlySchedule[]>([]);
  const [historyFuture, setHistoryFuture] = useState<MonthlySchedule[]>([]);
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  
  // GERAÇÃO IA
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);

  const [isSaved, setIsSaved] = useState(false);
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [showShifts, setShowShifts] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showStaffing, setShowStaffing] = useState(false);
  const [showGenerationScope, setShowGenerationScope] = useState(false);
  const [clearScopeModalOpen, setClearScopeModalOpen] = useState(false);
  const [filterManager, setFilterManager] = useState<{ isOpen: boolean; type: 'Unit' | 'Sector' | 'Shift' | null }>({ isOpen: false, type: null });

  const handleUndo = useCallback(() => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryFuture(future => [schedule, ...future]);
    setHistoryPast(past => past.slice(0, -1));
    setScheduleState(previous);
    setHasUnsavedChanges(true);
  }, [historyPast, schedule]);

  const handleRedo = useCallback(() => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryPast(past => [...past, schedule]);
    setHistoryFuture(future => future.slice(1));
    setScheduleState(next);
    setHasUnsavedChanges(true);
  }, [historyFuture, schedule]);

  const setSchedule = useCallback((value: React.SetStateAction<MonthlySchedule>) => {
      setScheduleState(prev => {
          const next = typeof value === 'function' ? value(prev) : value;
          if (next !== prev) { setHistoryPast(past => [...past, prev]); setHistoryFuture([]); }
          return next;
      });
  }, []);

  const handleScheduleChange = useCallback((changes: ScheduleChange[]) => {
      changes.forEach(change => {
          const key = `${change.employeeId}-${change.year}-${change.month}-${change.day}`;
          dirtyRegisters.current.set(key, change);
      });
      setHasUnsavedChanges(true);
  }, []);

  useEffect(() => {
      if (!currentUser || hasUnsavedChanges) return;
      
      const pollSchedule = async () => {
          setIsCloudSyncing(true);
          try {
              const response = await GoogleSheetsService.fetchScheduleState(currentDate.getMonth(), currentDate.getFullYear());
              if (response) {
                  const { assignments, metadata } = response;
                  
                  if (metadata) {
                      setEmployees(prev => {
                          let empChanged = false;
                          const next = prev.map(emp => {
                              const remoteMeta = metadata[emp.id];
                              if (remoteMeta && (emp.shiftType !== remoteMeta.shiftType || emp.lastDayOff !== remoteMeta.lastDayOff)) {
                                  // Verificação para não sobrescrever se o usuário local estiver editando agora
                                  if (dirtyEmployeeMetadata.current.has(emp.id)) return emp;

                                  empChanged = true;
                                  return { ...emp, shiftType: remoteMeta.shiftType, lastDayOff: remoteMeta.lastDayOff };
                              }
                              return emp;
                          });
                          return empChanged ? next : prev;
                      });
                  }

                  setScheduleState(prev => {
                      if (prev.month !== currentDate.getMonth() || prev.year !== currentDate.getFullYear()) return prev;
                      const newAssignments = { ...prev.assignments };
                      let changed = false;
                      
                      Object.keys(assignments).forEach(empId => {
                          const remoteDays = assignments[empId];
                          if (!newAssignments[empId]) newAssignments[empId] = {};
                          
                          Object.keys(remoteDays).forEach(dayNum => {
                                const code = remoteDays[dayNum];
                                const dateKey = `${prev.year}-${String(prev.month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                                
                                // CRITICAL: Check if this cell is currently "dirty" (unsaved local change)
                                // The key format in dirtyRegisters is: employeeId-year-monthIndex-day
                                const dirtyKey = `${empId}-${prev.year}-${prev.month}-${dayNum}`;
                                if (dirtyRegisters.current.has(dirtyKey)) {
                                    // Skip this update because local user has unsaved changes that take precedence
                                    return;
                                }

                                const shift = shifts.find(s => s.code === code);
                                const currentShiftId = newAssignments[empId][dateKey];
                                
                                if (shift && currentShiftId !== shift.id) {
                                    newAssignments[empId][dateKey] = shift.id;
                                    changed = true;
                                }
                          });

                          const daysInMonthCount = getDaysInMonth(prev.month, prev.year);
                          for (let d = 1; d <= daysInMonthCount; d++) {
                              const dk = `${prev.year}-${String(prev.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                              
                              // Check if we are deleting locally (dirty) - if so, don't let remote "undelete" it
                              const dirtyKey = `${empId}-${prev.year}-${prev.month}-${d}`;
                              if (dirtyRegisters.current.has(dirtyKey)) {
                                  continue;
                              }

                              if (newAssignments[empId][dk] && !remoteDays[d]) {
                                  delete newAssignments[empId][dk];
                                  changed = true;
                              }
                          }
                      });
                      
                      return changed ? { ...prev, assignments: newAssignments } : prev;
                  });
              }
          } catch (e) { console.error("Polling error", e); } 
          finally { setIsCloudSyncing(false); }
      };

      const interval = setInterval(pollSchedule, 20000); 
      pollSchedule(); 
      return () => clearInterval(interval);
  }, [currentUser, currentDate, shifts, hasUnsavedChanges]); 

  const handleLogin = (user: User) => { 
      setCurrentUser(user); 
      sessionStorage.setItem('CURRENT_SESSION', JSON.stringify(user)); 
  };
  
  const handleLogout = () => { 
      if (hasUnsavedChanges && !confirm("Deseja sair sem salvar?")) return;
      setCurrentUser(null); 
      sessionStorage.removeItem('CURRENT_SESSION'); 
  };

  const handleSaveData = async () => {
      setIsSaving(true);
      try {
          // 1. Sincronizar alterações na escala (dias específicos)
          const changesToSync = Array.from(dirtyRegisters.current.values()) as ScheduleChange[];
          if (changesToSync.length > 0 && currentUser) {
              await GoogleSheetsService.syncScheduleChanges(changesToSync, currentUser);
          }

          // 2. Sincronizar metadados (Turno/UF)
          // Se houve alteração de metadados, enviamos para as abas mensais e base
          if (dirtyEmployeeMetadata.current.size > 0 && currentUser) {
              const changedEmployees = employees.filter(e => dirtyEmployeeMetadata.current.has(e.id));
              await GoogleSheetsService.syncEmployeesMetadata(changedEmployees, schedule.month, schedule.year, currentUser);
          }

          const dataToSave = { employees, shifts, aiRules, staffingConfig, units, sectors, shiftTypesList };
          await StorageService.save('ESCALA_FACIL_DATA', dataToSave);
          
          dirtyRegisters.current.clear();
          dirtyEmployeeMetadata.current.clear();
          setHasUnsavedChanges(false);
          setIsSaved(true);
          setTimeout(() => setIsSaved(false), 2000);
      } catch (e) { alert("Erro ao salvar dados."); } 
      finally { setIsSaving(false); }
  };

  const handleUpdateEmployee = (id: string, field: string, value: string) => {
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
      dirtyEmployeeMetadata.current.add(id);
      setHasUnsavedChanges(true);
  };

  const availableEmployees = useMemo(() => {
      if (currentUser?.role !== 'admin' && currentUser?.allowedUnits?.length) return employees.filter(e => currentUser.allowedUnits!.includes(e.unit));
      return employees;
  }, [employees, currentUser]);

  const activeUnits = useMemo(() => Array.from(new Set(availableEmployees.map(e => e.unit).filter(Boolean))).sort(), [availableEmployees]);
  const activeSectors = useMemo(() => {
      let relevant = selectedUnits.length ? availableEmployees.filter(e => selectedUnits.includes(e.unit)) : availableEmployees;
      let raw = Array.from(new Set(relevant.map(e => e.sector).filter(Boolean))).sort();
      if (currentUser?.role !== 'admin' && currentUser?.allowedSectors?.length) raw = raw.filter(s => currentUser.allowedSectors!.includes(s));
      return raw;
  }, [availableEmployees, currentUser, selectedUnits]);

  const activeShiftTypes = useMemo(() => {
      let relevant = availableEmployees;
      if (selectedUnits.length) relevant = relevant.filter(e => selectedUnits.includes(e.unit));
      if (selectedSectors.length) relevant = relevant.filter(e => selectedSectors.includes(e.sector));
      return Array.from(new Set(relevant.map(e => e.shiftType).filter(Boolean))).sort();
  }, [availableEmployees, selectedUnits, selectedSectors]);

  const filteredEmployees = useMemo(() => {
      return availableEmployees.filter(emp => {
        if (currentUser?.role !== 'admin' && currentUser?.allowedSectors?.length && !currentUser.allowedSectors.includes(emp.sector)) return false;
        if (globalSearchTerm) {
            const term = globalSearchTerm.toLowerCase();
            if (!emp.name.toLowerCase().includes(term) && !emp.id.includes(term) && !emp.role.toLowerCase().includes(term)) return false;
        }
        if (emp.terminationDate) {
            const termDate = new Date(emp.terminationDate);
            if (new Date(schedule.year, schedule.month, 1) > new Date(termDate.getFullYear(), termDate.getMonth() + 1, 0)) return false; 
        }
        return (selectedUnits.length === 0 || selectedUnits.includes(emp.unit)) && (selectedSectors.length === 0 || selectedSectors.includes(emp.sector)) && (selectedShiftTypes.length === 0 || selectedShiftTypes.includes(emp.shiftType));
      });
  }, [availableEmployees, selectedUnits, selectedSectors, selectedShiftTypes, currentUser, globalSearchTerm, schedule.year, schedule.month]);

  const isPastMonth = useMemo(() => new Date(schedule.year, schedule.month, 1) < new Date(new Date().getFullYear(), new Date().getMonth(), 1), [schedule.month, schedule.year]);
  const canEdit = useMemo(() => {
      if (!currentUser || currentUser.role === 'viewer') return false;
      if (currentUser.role === 'admin' || currentUser.role === 'manager') return true; 
      return !isPastMonth;
  }, [currentUser, isPastMonth]);

  const handleMonthChange = (offset: number) => {
    if (hasUnsavedChanges && !confirm("Mudar de mês descartará as alterações de ESCALA não salvas. Os cadastros (UF/Turno) serão atualizados automaticamente. Continuar?")) return;
    
    // AUTO-UPDATE UF (Last Day Off) when moving to next month
    if (offset > 0) {
        const daysInCurrentMonth = getDaysInMonth(schedule.month, schedule.year);
        let updatedCount = 0;

        const updatedEmployees = employees.map(emp => {
            let bestDate = emp.lastDayOff;
            
            // Look for the last day off in the current grid
            for (let d = daysInCurrentMonth; d >= 1; d--) {
                 const dateKey = `${schedule.year}-${String(schedule.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                 const shiftId = schedule.assignments[emp.id]?.[dateKey];
                 const shift = shifts.find(s => s.id === shiftId);
                 if (shift && shift.isDayOff) {
                     bestDate = dateKey;
                     break;
                 }
            }

            // If found a new date (different from the one currently stored), update it
            if (bestDate !== emp.lastDayOff) {
                dirtyEmployeeMetadata.current.add(emp.id);
                updatedCount++;
                return { ...emp, lastDayOff: bestDate };
            }
            return emp;
        });

        if (updatedCount > 0) {
            setEmployees(updatedEmployees);
        }
    }

    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
    setCurrentDate(newDate);
    setScheduleState({ month: newDate.getMonth(), year: newDate.getFullYear(), assignments: {}, attachments: {}, comments: {} });
    setHistoryPast([]); 
    setHistoryFuture([]); 
    
    // Clear grid changes but keep metadata changes if we just updated UFs
    dirtyRegisters.current.clear();
    setHasUnsavedChanges(dirtyEmployeeMetadata.current.size > 0);
  };

  const handleSync = async () => {
      setIsSyncing(true);
      try {
          const apiData = await GoogleSheetsService.fetchEmployees();
          if (apiData && apiData.length > 0) {
              setEmployees(apiData);
              const bU = new Set(INITIAL_UNITS); const bS = new Set(INITIAL_SECTORS);
              apiData.forEach(e => { if(e.unit) bU.add(e.unit); if(e.sector) bS.add(e.sector); });
              setUnits(Array.from(bU).sort()); setSectors(Array.from(bS).sort());
          }
      } catch (e) { console.error("Sync failed", e); } 
      finally { setIsSyncing(false); }
  };

  const handleClearScale = (ids: string[]) => {
      setSchedule(prev => {
          const nextAssignments = { ...prev.assignments };
          ids.forEach(id => {
              // Iterate currently assigned days to mark them as deleted in dirtyRegisters
              const empAssignments = nextAssignments[id];
              if (empAssignments) {
                  Object.keys(empAssignments).forEach(dateKey => {
                      // dateKey is YYYY-MM-DD
                      const [y, m, d] = dateKey.split('-').map(Number);
                      const key = `${id}-${y}-${m-1}-${d}`;
                      const emp = employees.find(e => e.id === id);
                      if (emp) {
                          dirtyRegisters.current.set(key, {
                              employeeId: id,
                              day: d,
                              shiftCode: '', // Empty means delete
                              employee: emp,
                              totalDaysOff: 0,
                              month: m - 1,
                              year: y
                          });
                      }
                  });
              }
              nextAssignments[id] = {};
          });
          return { ...prev, assignments: nextAssignments };
      });
      setHasUnsavedChanges(true);
  };

  // --- IA GENERATION HANDLER ---
  const handleGenerateAI = async (selectedIds: string[]) => {
      if (!canEdit) return;
      setIsGenerating(true);
      setGenProgress(0);

      const targetEmployees = employees.filter(e => selectedIds.includes(e.id));

      try {
          const result = await generateAISchedule(
              targetEmployees,
              shifts,
              schedule.month, 
              schedule.year,
              aiRules,
              (current, total) => setGenProgress(Math.round((current / total) * 100))
          );

          if (result) {
              setSchedule(prev => {
                  const newAssignments = { ...prev.assignments };
                  
                  Object.keys(result).forEach(empId => {
                      if (!newAssignments[empId]) newAssignments[empId] = {};
                      
                      const empResult = result[empId];
                      Object.keys(empResult).forEach(dateKey => {
                           const shiftId = empResult[dateKey];
                           newAssignments[empId][dateKey] = shiftId;
                           
                           // Add to Dirty Registers for Sync
                           const shift = shifts.find(s => s.id === shiftId);
                           const emp = employees.find(e => e.id === empId);
                           if (shift && emp) {
                               const [y, m, d] = dateKey.split('-').map(Number);
                               // dirtyRegisters key format: employeeId-year-monthIndex-day
                               const drKey = `${empId}-${y}-${m-1}-${d}`; 
                               dirtyRegisters.current.set(drKey, {
                                   employeeId: empId,
                                   day: d,
                                   shiftCode: shift.code,
                                   employee: emp,
                                   totalDaysOff: 0,
                                   month: m - 1,
                                   year: y
                               });
                           }
                      });
                  });

                  return { ...prev, assignments: newAssignments };
              });
              setHasUnsavedChanges(true);
          }
      } catch (err) {
          console.error(err);
          alert('Erro ao gerar escala. Verifique o console.');
      } finally {
          setIsGenerating(false);
          setGenProgress(0);
      }
  };

  if (!currentUser) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100 overflow-hidden font-sans">
      <header className="bg-company-blue text-white shadow-lg z-40 flex flex-col shrink-0 print:hidden w-full relative">
        <div className="flex items-center justify-between px-6 py-2 border-b border-blue-900 w-full min-w-0">
            <div className="flex items-center gap-8 shrink-0">
                 <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-white rounded text-company-blue flex items-center justify-center font-bold text-xl">PS</div>
                    <div className="hidden md:block"><h1 className="text-lg font-bold tracking-tight leading-none">ESCALA FÁCIL</h1><p className="text-[10px] text-blue-200 tracking-wider uppercase">PREVENT SENIOR</p></div>
                 </div>
                 <div className="flex gap-1 bg-blue-900/50 p-1 rounded-lg">
                     <button onClick={() => setCurrentView('roster')} className={`px-4 py-1.5 rounded text-xs font-bold uppercase transition-all ${currentView === 'roster' ? 'bg-white text-company-blue shadow' : 'text-blue-200 hover:text-white hover:bg-white/10'}`}>Escala Mensal</button>
                     {currentUser.role === 'admin' && (<button onClick={() => setCurrentView('database')} className={`px-4 py-1.5 rounded text-xs font-bold uppercase transition-all ${currentView === 'database' ? 'bg-white text-company-blue shadow' : 'text-blue-200 hover:text-white hover:bg-white/10'}`}>Cadastros</button>)}
                     <button onClick={() => setCurrentView('reports')} className={`px-4 py-1.5 rounded text-xs font-bold uppercase transition-all ${currentView === 'reports' ? 'bg-white text-company-blue shadow' : 'text-blue-200 hover:text-white hover:bg-white/10'}`}>Relatórios</button>
                 </div>
            </div>
            <div className="flex-1 flex justify-center max-w-md mx-4 min-w-0">
                 <input type="text" placeholder="🔍 Buscar (ID ou Nome)" className="w-full bg-blue-900/50 border border-blue-700 rounded-full px-4 py-1 text-sm text-white placeholder-blue-300 outline-none focus:bg-blue-800 transition-colors" value={globalSearchTerm} onChange={e => setGlobalSearchTerm(e.target.value)} />
            </div>
            <div className="flex items-center bg-blue-900 rounded p-1 shrink-0">
                <button onClick={() => handleMonthChange(-1)} className="p-1 hover:bg-white/10 rounded transition-colors text-white"><span className="text-lg">‹</span></button>
                <span className="w-40 text-center font-bold text-sm tracking-wide select-none uppercase hidden md:inline-block">{MONTH_NAMES[schedule.month]} / {schedule.year}</span>
                <button onClick={() => handleMonthChange(1)} className="p-1 hover:bg-white/10 rounded transition-colors text-white"><span className="text-lg">›</span></button>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
               {currentView === 'roster' && <CloudSyncIcon syncing={isCloudSyncing} />}
               {currentUser.role === 'admin' && (
                   <Tooltip content="Sincronizar Cadastros">
                       <button onClick={() => setShowSyncConfirm(true)} className={`p-2 rounded-full hover:bg-blue-800 transition-colors ${isSyncing ? 'text-blue-300' : 'text-white'}`}><RefreshIcon spinning={isSyncing} /></button>
                   </Tooltip>
               )}
               <span className="text-xs text-blue-300 border-r border-blue-700 pr-3 mr-1 hidden sm:inline">Olá, {currentUser.name.split(' ')[0]}</span>
               {currentUser.role === 'admin' && (<button onClick={() => setShowUserMgmt(true)} className="text-xs bg-blue-800 px-2 py-1 rounded hover:bg-blue-700">Usuários</button>)}
               <button onClick={handleLogout} className="text-xs text-red-300 hover:text-red-100 underline">Sair</button>
            </div>
        </div>
        {currentView === 'roster' && (
            <div className="bg-[#003399] px-6 py-2 flex items-center gap-4 lg:gap-6 shadow-inner shrink-0 text-white z-40 relative w-full flex-wrap overflow-visible">
                <MultiSelect label="Unidade" options={activeUnits} selected={selectedUnits} onChange={setSelectedUnits} isAdmin={currentUser.role === 'admin'} />
                <MultiSelect label="Setor" options={activeSectors} selected={selectedSectors} onChange={setSelectedSectors} isAdmin={currentUser.role === 'admin'} />
                <MultiSelect label="Turno" options={activeShiftTypes} selected={selectedShiftTypes} onChange={setSelectedShiftTypes} isAdmin={currentUser.role === 'admin'} />
                <div className="flex-1 flex justify-end gap-3 items-end h-full pt-1 shrink-0">
                    {hasUnsavedChanges && <span className="text-xs text-yellow-300 font-bold animate-pulse mr-2 mb-2">Alterações não salvas!</span>}
                    <Tooltip content="Salvar Alterações"><button onClick={handleSaveData} disabled={isSaving} className={`p-2 rounded-full transition-all ${hasUnsavedChanges ? 'bg-yellow-600/50 animate-bounce' : 'hover:bg-white/10'}`}><SaveIcon saved={isSaved} saving={isSaving} /></button></Tooltip>
                    <Tooltip content="Imprimir Escala"><button onClick={() => window.print()} className="p-2 text-white hover:bg-white/10 rounded-full transition-all"><PrintIcon /></button></Tooltip>
                    {canEdit && (<Tooltip content="Limpar Escala"><button onClick={() => setClearScopeModalOpen(true)} className="p-2 text-red-300 hover:bg-red-500/20 hover:text-red-200 rounded-full transition-all"><TrashIcon /></button></Tooltip>)}
                    <div className="w-px h-8 bg-blue-700 mx-2 hidden sm:block"></div>
                    {canEdit && (<>{currentUser.role === 'admin' && (<Tooltip content="Legendas & Turnos"><button onClick={() => setShowShifts(true)} className="p-2 text-white hover:bg-white/10 rounded-full"><TagIcon /></button></Tooltip>)}<Tooltip content="Regras da IA"><button onClick={() => setShowRules(true)} className="p-2 text-white hover:bg-white/10 rounded-full"><MegaphoneIcon /></button></Tooltip><Tooltip content="Dimensionamento"><button onClick={() => setShowStaffing(true)} className="p-2 text-white hover:bg-white/10 rounded-full"><ChartBarIcon /></button></Tooltip><button onClick={() => setShowGenerationScope(true)} className="ml-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded uppercase shadow border border-emerald-400 min-w-max">Gerar (IA)</button></>)}
                </div>
            </div>
        )}
      </header>
      <main className="flex-1 flex flex-col overflow-hidden relative print:p-0 print:overflow-visible bg-white z-0 w-full h-full">
          {currentView === 'roster' ? (
               <div className="flex-1 flex flex-col h-full w-full p-0 print:p-0 overflow-hidden">
                    <RosterGrid employees={filteredEmployees} shifts={shifts} currentSchedule={schedule} setSchedule={setSchedule} rules={aiRules} staffingConfig={staffingConfig} isReadOnly={!canEdit} onUndo={handleUndo} onRedo={handleRedo}
                        currentUserId={currentUser.id}
                        onUpdateEmployee={handleUpdateEmployee}
                        onScheduleChange={handleScheduleChange}
                        onReorderEmployees={(a,b) => {
                            if (!canEdit) return;
                            const newOrder = [...employees];
                            const from = newOrder.findIndex(e => e.id === a); const to = newOrder.findIndex(e => e.id === b);
                            if(from >=0 && to >=0) { const [moved] = newOrder.splice(from, 1); newOrder.splice(to, 0, moved); setEmployees(newOrder); setHasUnsavedChanges(true); }
                        }}/>
               </div>
          ) : currentView === 'database' ? (
               <div className="h-full w-full"><EmployeeDatabaseScreen employees={employees} setEmployees={setEmployees} units={units} sectors={sectors} shiftTypes={shiftTypesList} /></div>
          ) : (<ReportsScreen employees={filteredEmployees} schedule={schedule} shifts={shifts} />)}
      </main>
      
      {/* Loading Overlay */}
      {isGenerating && (
          <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center text-white backdrop-blur-sm">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <h2 className="text-xl font-bold mb-2">Gerando Escala Inteligente...</h2>
              <p className="text-sm text-slate-300 mb-6">Processando regras CLT, descansos e preferências.</p>
              <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden border border-slate-600">
                  <div className="h-full bg-blue-500 transition-all duration-300 ease-out" style={{ width: `${genProgress}%` }}></div>
              </div>
              <p className="text-xs font-bold mt-2 text-blue-300">{genProgress}% Concluído</p>
          </div>
      )}

      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} rules={aiRules} setRules={setAiRules} />
      <StaffingModal isOpen={showStaffing} onClose={() => setShowStaffing(false)} employees={employees} config={staffingConfig} setConfig={setStaffingConfig} />
      {showShifts && <ShiftManager shifts={shifts} setShifts={setShifts} onClose={() => setShowShifts(false)} />}
      {showUserMgmt && <UserManagement onClose={() => setShowUserMgmt(false)} availableUnits={units} employees={employees} />}
      <GenerationScopeModal isOpen={showGenerationScope} onClose={() => setShowGenerationScope(false)} employees={filteredEmployees} onConfirm={handleGenerateAI} />
      <FilterManagerModal isOpen={filterManager.isOpen} onClose={() => setFilterManager({ isOpen: false, type: null })} title={filterManager.type || ''} items={filterManager.type === 'Unit' ? units : filterManager.type === 'Sector' ? sectors : shiftTypesList} setItems={filterManager.type === 'Unit' ? setUnits : filterManager.type === 'Sector' ? setSectors : setShiftTypesList} />
      <GenerationScopeModal isOpen={clearScopeModalOpen} onClose={() => setClearScopeModalOpen(false)} employees={filteredEmployees} onConfirm={handleClearScale} />
      <ConfirmationModal isOpen={showSyncConfirm} onClose={() => setShowSyncConfirm(false)} onConfirm={handleSync} title="Confirmar Sincronização" message="Deseja atualizar a lista de colaboradores via Google Sheets?" confirmText="Sincronizar" />
    </div>
  );
};

export default App;