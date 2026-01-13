
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { INITIAL_EMPLOYEES, INITIAL_SHIFTS, MONTH_NAMES, INITIAL_UNITS, INITIAL_SECTORS, INITIAL_SHIFT_TYPES } from './constants.ts';
import { Employee, MonthlySchedule, Shift, AIRulesConfig, StaffingConfig, User, ScheduleChange } from './types.ts';
import { EmployeeManager } from './components/EmployeeManager.tsx';
import { ShiftManager } from './components/ShiftManager.tsx';
import { RosterGrid } from './components/RosterGrid.tsx';
import { RulesModal } from './components/RulesModal.tsx';
import { ImportModal } from './components/ImportModal.tsx';
import { StaffingModal } from './components/StaffingModal.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { UserManagement } from './components/UserManagement.tsx';
import { FilterManagerModal } from './components/FilterManagerModal.tsx';
import { generateAISchedule } from './services/schedulerService.ts';
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
const PrintIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>;
const TagIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>;
// Megaphone Icon (Regras da IA)
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

  // Dynamic Lists for Filters
  const [units, setUnits] = useState<string[]>(INITIAL_UNITS);
  const [sectors, setSectors] = useState<string[]>(INITIAL_SECTORS);
  const [shiftTypesList, setShiftTypesList] = useState<string[]>(INITIAL_SHIFT_TYPES);

  // Filter States
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedShiftTypes, setSelectedShiftTypes] = useState<string[]>([]);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');

  const [aiRules, setAiRules] = useState<AIRulesConfig>({ 
      maxConsecutiveDays: 6, minRestHours: 11, preferSundayOff: true, sundayOffFrequency: 2, preferConsecutiveDaysOff: true,
      allowExtraDaysOff: false, extraDaysOffCount: 1 
  });
  const [staffingConfig, setStaffingConfig] = useState<StaffingConfig>({});
  
  // SCHEDULE STATE
  const [schedule, setScheduleState] = useState<MonthlySchedule>({ month: currentDate.getMonth(), year: currentDate.getFullYear(), assignments: {}, attachments: {}, comments: {} });
  
  // DIRTY STATE TRACKING (Exact edits)
  const dirtyRegisters = useRef<Map<string, ScheduleChange>>(new Map());
  
  const [historyPast, setHistoryPast] = useState<MonthlySchedule[]>([]);
  const [historyFuture, setHistoryFuture] = useState<MonthlySchedule[]>([]);
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  const setSchedule = useCallback((value: React.SetStateAction<MonthlySchedule>) => {
      setScheduleState(prev => {
          const next = typeof value === 'function' ? value(prev) : value;
          if (next !== prev) {
              setHistoryPast(past => [...past, prev]);
              setHistoryFuture([]);
          }
          return next;
      });
  }, []);

  // Track explicit manual changes from RosterGrid
  const handleScheduleChange = useCallback((changes: ScheduleChange[]) => {
      changes.forEach(change => {
          // Unique key for Employee + Date
          const key = `${change.employeeId}-${change.year}-${change.month}-${change.day}`;
          dirtyRegisters.current.set(key, change);
      });
      setHasUnsavedChanges(true);
  }, []);

  // REAL-TIME SYNC: Poll Changes (Receive only)
  useEffect(() => {
      if (!currentUser) return;
      // STOP POLLING IF USER HAS UNSAVED CHANGES TO AVOID CONFLICTS/OVERWRITES
      if (hasUnsavedChanges) return;
      
      const pollSchedule = async () => {
          setIsCloudSyncing(true);
          try {
              const remoteAssignments = await GoogleSheetsService.fetchScheduleState(currentDate.getMonth(), currentDate.getFullYear());
              if (remoteAssignments) {
                  setScheduleState(prev => {
                      if (prev.month !== currentDate.getMonth() || prev.year !== currentDate.getFullYear()) return prev;

                      const newAssignments = { ...prev.assignments };
                      let changed = false;
                      
                      Object.keys(remoteAssignments).forEach(empId => {
                          const remoteDays = remoteAssignments[empId];
                          if (!newAssignments[empId]) newAssignments[empId] = {};
                          
                          Object.keys(remoteDays).forEach(dayNum => {
                                const code = remoteDays[dayNum];
                                const dateKey = `${prev.year}-${String(prev.month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                                
                                const shift = shifts.find(s => s.code === code);
                                const currentShiftId = newAssignments[empId][dateKey];

                                if (shift && currentShiftId !== shift.id) {
                                    newAssignments[empId][dateKey] = shift.id;
                                    changed = true;
                                } else if (!shift && currentShiftId && code === "") {
                                    delete newAssignments[empId][dateKey];
                                    changed = true;
                                }
                          });
                      });

                      if (changed) {
                          return { ...prev, assignments: newAssignments };
                      }
                      return prev;
                  });
              }
          } catch (e) {
              console.error("Polling error", e);
          } finally {
              setIsCloudSyncing(false);
          }
      };

      const interval = setInterval(pollSchedule, 15000);
      pollSchedule(); 

      return () => clearInterval(interval);
  }, [currentUser, currentDate, shifts, hasUnsavedChanges]); 

  // UNSAVED CHANGES WARNING
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleUndo = useCallback(() => {
      if (historyPast.length === 0) return;
      const previous = historyPast[historyPast.length - 1];
      const newPast = historyPast.slice(0, -1);
      setHistoryFuture(future => [schedule, ...future]);
      setScheduleState(previous);
      setHistoryPast(newPast);
      setHasUnsavedChanges(true);
      // NOTE: Undo doesn't currently undo the dirtyRegisters list logic, 
      // but syncing invalid states is better than syncing wrong diffs. 
      // Ideally Undo should also manage dirty stack.
  }, [historyPast, schedule]);

  const handleRedo = useCallback(() => {
      if (historyFuture.length === 0) return;
      const next = historyFuture[0];
      const newFuture = historyFuture.slice(1);
      setHistoryPast(past => [...past, schedule]);
      setScheduleState(next);
      setHistoryFuture(newFuture);
      setHasUnsavedChanges(true);
  }, [historyFuture, schedule]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [isSaved, setIsSaved] = useState(false);
  
  const [showEmployees, setShowEmployees] = useState(false);
  const [showShifts, setShowShifts] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showStaffing, setShowStaffing] = useState(false);
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [showGenerationScope, setShowGenerationScope] = useState(false);
  const [filterManager, setFilterManager] = useState<{ isOpen: boolean, type: 'Unit' | 'Sector' | 'Shift' | null }>({ isOpen: false, type: null });

  const [clearScopeModalOpen, setClearScopeModalOpen] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [clearTargetIds, setClearTargetIds] = useState<string[]>([]); 

  const appContainerRef = useRef<HTMLDivElement>(null);

  // Load Data
  useEffect(() => {
    const session = localStorage.getItem('CURRENT_SESSION');
    if (session) { try { setCurrentUser(JSON.parse(session)); } catch(e) { console.error("Session parse error", e); } }

    const loadData = async () => {
        try {
            const parsed = await StorageService.load('ESCALA_FACIL_DATA');
            if (parsed) {
                if(parsed.employees) setEmployees(parsed.employees); 
                if(parsed.shifts) setShifts(parsed.shifts);
                if(parsed.aiRules) setAiRules(parsed.aiRules);
                if(parsed.staffingConfig) setStaffingConfig(parsed.staffingConfig);
                if(parsed.units) setUnits(parsed.units);
                if(parsed.sectors) setSectors(parsed.sectors);
                if(parsed.shiftTypesList) setShiftTypesList(parsed.shiftTypesList);
            }
        } catch (e) { console.error("Failed to load saved data", e); }
    };
    loadData();
  }, []);

  const handleSync = async () => {
      setIsSyncing(true);
      try {
          const apiData = await GoogleSheetsService.fetchEmployees();
          if (apiData && apiData.length > 0) {
              setEmployees(apiData);
              const builtUnits = new Set(INITIAL_UNITS);
              const builtSectors = new Set(INITIAL_SECTORS);
              apiData.forEach(e => {
                  if(e.unit) builtUnits.add(e.unit);
                  if(e.sector) builtSectors.add(e.sector);
              });
              setUnits(Array.from(builtUnits).sort());
              setSectors(Array.from(builtSectors).sort());
          }
      } catch (e) {
          console.error("Sync failed", e);
      } finally {
          setIsSyncing(false);
      }
  };

  const handleLogin = (user: User) => { setCurrentUser(user); localStorage.setItem('CURRENT_SESSION', JSON.stringify(user)); };
  const handleLogout = () => { 
      if (hasUnsavedChanges) {
          if(!confirm("Você tem alterações não salvas. Tem certeza que deseja sair e perder os dados?")) return;
      }
      setCurrentUser(null); localStorage.removeItem('CURRENT_SESSION'); 
  };

  // NEW: Save only dirty registers
  const handleSaveData = async () => {
      setIsSaving(true);
      try {
          const changesToSync = Array.from(dirtyRegisters.current.values());

          // Sync to Cloud if there are changes
          if (changesToSync.length > 0 && currentUser) {
              console.log(`Enviando ${changesToSync.length} alterações exatas para a nuvem...`);
              await GoogleSheetsService.syncScheduleChanges(changesToSync, currentUser);
          } else {
              console.log("Nenhuma alteração registrada para enviar.");
          }

          // Save Local Meta Data
          const dataToSave = { employees, shifts, aiRules, staffingConfig, units, sectors, shiftTypesList };
          await StorageService.save('ESCALA_FACIL_DATA', dataToSave);
          
          if (currentUser) { localStorage.setItem('CURRENT_SESSION', JSON.stringify(currentUser)); }
          
          // Clear dirty state on success
          dirtyRegisters.current.clear();
          setHasUnsavedChanges(false);
          setIsSaved(true);
          setTimeout(() => setIsSaved(false), 2000);
      } catch (e) {
          console.error("Erro ao salvar", e);
          alert("Não foi possível salvar os dados. " + (e instanceof Error ? e.message : "Erro desconhecido."));
      } finally {
          setIsSaving(false);
      }
  };

  const handleUpdateEmployee = (id: string, field: string, value: string) => {
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
      setHasUnsavedChanges(true);
  };

  // Sync Lists
  useEffect(() => {
      const builtUnits = new Set(units);
      const builtSectors = new Set(sectors);
      const builtTypes = new Set(shiftTypesList);

      employees.forEach(e => {
          if(e.unit) builtUnits.add(e.unit);
          if(e.sector) builtSectors.add(e.sector);
          if(e.shiftType) builtTypes.add(e.shiftType.toUpperCase());
      });

      const sortedUnits = Array.from(builtUnits).sort();
      const sortedSectors = Array.from(builtSectors).sort();
      const sortedTypes = Array.from(builtTypes).sort();

      if (JSON.stringify(sortedUnits) !== JSON.stringify(units)) setUnits(sortedUnits);
      if (JSON.stringify(sortedSectors) !== JSON.stringify(sectors)) setSectors(sortedSectors);
      if (JSON.stringify(sortedTypes) !== JSON.stringify(shiftTypesList)) setShiftTypesList(sortedTypes);
      
  }, [employees]);

  // Derived Lists
  const availableEmployees = useMemo(() => {
      if (currentUser?.role !== 'admin' && currentUser?.allowedUnits && currentUser.allowedUnits.length > 0) {
          return employees.filter(e => currentUser.allowedUnits!.includes(e.unit));
      }
      return employees;
  }, [employees, currentUser]);

  const activeUnits = useMemo(() => {
      const rawUnits = Array.from(new Set(availableEmployees.map(e => e.unit).filter(Boolean))).sort();
      return rawUnits;
  }, [availableEmployees]);

  const activeSectors = useMemo(() => {
      let relevantEmployees = availableEmployees;
      if (selectedUnits.length > 0) {
          relevantEmployees = relevantEmployees.filter(e => selectedUnits.includes(e.unit));
      }
      let rawSectors = Array.from(new Set(relevantEmployees.map(e => e.sector).filter(Boolean))).sort();
      if (currentUser?.role !== 'admin' && currentUser?.allowedSectors && currentUser.allowedSectors.length > 0) {
          rawSectors = rawSectors.filter(s => currentUser.allowedSectors!.includes(s));
      }
      return rawSectors;
  }, [availableEmployees, currentUser, selectedUnits]);

  const activeShiftTypes = useMemo(() => {
      let relevantEmployees = availableEmployees;
      if (selectedUnits.length > 0) {
          relevantEmployees = relevantEmployees.filter(e => selectedUnits.includes(e.unit));
      }
      if (selectedSectors.length > 0) {
          relevantEmployees = relevantEmployees.filter(e => selectedSectors.includes(e.sector));
      }
      return Array.from(new Set(relevantEmployees.map(e => e.shiftType).filter(Boolean))).sort();
  }, [availableEmployees, selectedUnits, selectedSectors]);

  // Main Filtering
  const filteredEmployees = useMemo(() => {
      return availableEmployees.filter(emp => {
        if (currentUser?.role !== 'admin' && currentUser?.allowedSectors && currentUser.allowedSectors.length > 0) {
            if (!currentUser.allowedSectors.includes(emp.sector)) return false;
        }
        if (globalSearchTerm) {
            const term = globalSearchTerm.toLowerCase();
            const match = emp.name.toLowerCase().includes(term) || emp.id.includes(term) || emp.role.toLowerCase().includes(term);
            if (!match) return false;
        }
        if (emp.terminationDate) {
            const termDate = new Date(emp.terminationDate);
            const scheduleDateStart = new Date(schedule.year, schedule.month, 1);
            const termDateEnd = new Date(termDate.getFullYear(), termDate.getMonth() + 1, 0); 
            if (scheduleDateStart > termDateEnd) return false; 
        }
        const matchUnit = selectedUnits.length === 0 || selectedUnits.includes(emp.unit);
        const matchSector = selectedSectors.length === 0 || selectedSectors.includes(emp.sector);
        const matchShift = selectedShiftTypes.length === 0 || selectedShiftTypes.includes(emp.shiftType);
        return matchUnit && matchSector && matchShift;
      });
  }, [availableEmployees, selectedUnits, selectedSectors, selectedShiftTypes, currentUser, globalSearchTerm, schedule.year, schedule.month]);

  // --- PERMISSION & DATE LOCK LOGIC ---
  const isPastMonth = useMemo(() => {
      const today = new Date();
      const viewDate = new Date(schedule.year, schedule.month, 1);
      const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return viewDate < currentMonthStart;
  }, [schedule.month, schedule.year]);

  const canEdit = useMemo(() => {
      if (!currentUser) return false;
      if (currentUser.role === 'admin') return true; 
      if (currentUser.role === 'viewer') return false; 
      if (isPastMonth) return false;
      return true; 
  }, [currentUser, isPastMonth]);

  const handleMonthChange = (offset: number) => {
    if (hasUnsavedChanges) {
        if (!confirm("Existem alterações não salvas. Mudar de mês descartará o histórico de desfazer e recarregará os dados da nuvem. Continuar?")) return;
        setHasUnsavedChanges(false);
        dirtyRegisters.current.clear();
    }
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
    setCurrentDate(newDate);
    const newSchedule = { month: newDate.getMonth(), year: newDate.getFullYear(), assignments: {}, attachments: {}, comments: {} };
    setScheduleState(newSchedule);
    setHistoryPast([]); setHistoryFuture([]);
  };

  const handleClearClick = () => setClearScopeModalOpen(true);

  const handleScopeConfirm = (ids: string[]) => {
      setClearTargetIds(ids);
      setClearScopeModalOpen(false);
      setShowConfirmClear(true); 
  }

  const executeClearSchedule = () => {
      setSchedule(prev => {
          const newAssignments = { ...prev.assignments };
          const newAttachments = { ...prev.attachments };
          const newComments = { ...prev.comments };
          const changes: ScheduleChange[] = [];

          const targets = clearTargetIds.length > 0 ? filteredEmployees.filter(e => clearTargetIds.includes(e.id)) : filteredEmployees;

          targets.forEach(emp => {
              const daysInMonth = new Date(prev.year, prev.month + 1, 0).getDate();
              for(let d=1; d<=daysInMonth; d++) {
                  const key = `${prev.year}-${String(prev.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  if (newAssignments[emp.id]?.[key]) {
                      newAssignments[emp.id] = { ...newAssignments[emp.id] };
                      delete newAssignments[emp.id][key];
                      
                      // MARK AS DIRTY (Deletion)
                      changes.push({
                        employeeId: emp.id,
                        employee: emp,
                        day: d,
                        shiftCode: '',
                        totalDaysOff: 0, 
                        month: prev.month,
                        year: prev.year
                      });
                  }
                  if (newAttachments && newAttachments[emp.id]) delete newAttachments[emp.id][key];
                  if (newComments && newComments[emp.id]) delete newComments[emp.id][key];
              }
          });
          
          handleScheduleChange(changes);
          return { ...prev, assignments: newAssignments, attachments: newAttachments, comments: newComments };
      });
  }

  const handleAutoGenerateClick = () => {
      if (!process.env.API_KEY) { alert("API Key não encontrada."); return; }
      if (filteredEmployees.length === 0) { alert("Nenhum colaborador visível."); return; }
      setShowGenerationScope(true);
  }

  const handleConfirmGeneration = async (selectedIds: string[]) => {
      const targetEmployees = filteredEmployees.filter(e => selectedIds.includes(e.id));
      if (targetEmployees.length === 0) return;

      setIsGenerating(true);
      setGenerationProgress({ current: 0, total: targetEmployees.length });

      const result = await generateAISchedule(targetEmployees, shifts, schedule.month, schedule.year, aiRules, (current, total) => setGenerationProgress({ current, total }));

      if (result) { 
          // Parse results to mark as dirty
          const newChanges: ScheduleChange[] = [];
          Object.keys(result).forEach(empId => {
              const daysMap = result[empId];
              Object.keys(daysMap).forEach(dateKey => {
                  const parts = dateKey.split('-');
                  const day = parseInt(parts[2]);
                  const shiftId = daysMap[dateKey];
                  const shift = shifts.find(s => s.id === shiftId);
                  
                  newChanges.push({
                     employeeId: empId,
                     employee: employees.find(e => e.id === empId)!,
                     day: day,
                     shiftCode: shift?.code || '',
                     totalDaysOff: 0,
                     month: schedule.month,
                     year: schedule.year
                  });
              });
          });

          setSchedule(prev => ({ ...prev, assignments: { ...prev.assignments, ...result } })); 
          handleScheduleChange(newChanges);
      } else { alert("Erro ao gerar escala."); }
      setIsGenerating(false);
  };

  const handlePrint = () => window.print();
  const isAdmin = currentUser?.role === 'admin';

  if (!currentUser) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div ref={appContainerRef} className="flex flex-col h-screen w-screen bg-slate-100 overflow-hidden font-sans">
      <header className="bg-company-blue text-white shadow-lg z-40 flex flex-col shrink-0 print:hidden w-full relative">
        <div className="flex items-center justify-between px-6 py-2 border-b border-blue-900 w-full min-w-0">
            <div className="flex items-center gap-8 shrink-0">
                 <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-white rounded text-company-blue flex items-center justify-center font-bold text-xl">PS</div>
                    <div className="hidden md:block"><h1 className="text-lg font-bold tracking-tight leading-none">ESCALA FÁCIL</h1><p className="text-[10px] text-blue-200 tracking-wider uppercase">PREVENT SENIOR</p></div>
                 </div>
                 <div className="flex gap-1 bg-blue-900/50 p-1 rounded-lg">
                     <button onClick={() => setCurrentView('roster')} className={`px-4 py-1.5 rounded text-xs font-bold uppercase transition-all ${currentView === 'roster' ? 'bg-white text-company-blue shadow' : 'text-blue-200 hover:text-white hover:bg-white/10'}`}>Escala Mensal</button>
                     {isAdmin && (<button onClick={() => setCurrentView('database')} className={`px-4 py-1.5 rounded text-xs font-bold uppercase transition-all ${currentView === 'database' ? 'bg-white text-company-blue shadow' : 'text-blue-200 hover:text-white hover:bg-white/10'}`}>Cadastros</button>)}
                     <button onClick={() => setCurrentView('reports')} className={`px-4 py-1.5 rounded text-xs font-bold uppercase transition-all ${currentView === 'reports' ? 'bg-white text-company-blue shadow' : 'text-blue-200 hover:text-white hover:bg-white/10'}`}>Relatórios</button>
                 </div>
            </div>

            <div className="flex-1 flex justify-center max-w-md mx-4 min-w-0">
                 <input 
                    type="text" 
                    placeholder="🔍 Buscar (ID ou Nome)"
                    className="w-full bg-blue-900/50 border border-blue-700 rounded-full px-4 py-1 text-sm text-white placeholder-blue-300 outline-none focus:bg-blue-800 transition-colors"
                    value={globalSearchTerm}
                    onChange={e => setGlobalSearchTerm(e.target.value)}
                 />
            </div>

            {currentView === 'roster' && (
                <div className="flex items-center bg-blue-900 rounded p-1 shrink-0">
                    <button onClick={() => handleMonthChange(-1)} className="p-1 hover:bg-white/10 rounded transition-colors text-white"><span className="text-lg">‹</span></button>
                    <span className="w-40 text-center font-bold text-sm tracking-wide select-none uppercase hidden md:inline-block">{MONTH_NAMES[schedule.month]} / {schedule.year}</span>
                    <button onClick={() => handleMonthChange(1)} className="p-1 hover:bg-white/10 rounded transition-colors text-white"><span className="text-lg">›</span></button>
                </div>
            )}
            <div className="flex items-center gap-3 shrink-0 ml-4">
               {currentView === 'roster' && <CloudSyncIcon syncing={isCloudSyncing} />}
               {isAdmin && (
                   <Tooltip content="Sincronizar Cadastros">
                       <button onClick={() => setShowSyncConfirm(true)} className={`p-2 rounded-full hover:bg-blue-800 transition-colors ${isSyncing ? 'text-blue-300' : 'text-white'}`}>
                           <RefreshIcon spinning={isSyncing} />
                       </button>
                   </Tooltip>
               )}
               <span className="text-xs text-blue-300 border-r border-blue-700 pr-3 mr-1 hidden sm:inline">Olá, {currentUser.name.split(' ')[0]}</span>
               {isAdmin && (<button onClick={() => setShowUserMgmt(true)} className="text-xs bg-blue-800 px-2 py-1 rounded hover:bg-blue-700">Usuários</button>)}
               <button onClick={handleLogout} className="text-xs text-red-300 hover:text-red-100 underline">Sair</button>
            </div>
        </div>
        {currentView === 'roster' && (
            <div className="bg-[#003399] px-6 py-2 flex items-center gap-4 lg:gap-6 shadow-inner shrink-0 text-white z-40 relative w-full flex-wrap overflow-visible">
                <MultiSelect label="Unidade" options={activeUnits} selected={selectedUnits} onChange={setSelectedUnits} isAdmin={isAdmin} onEdit={() => setFilterManager({ isOpen: true, type: 'Unit' })} />
                <MultiSelect label="Setor" options={activeSectors} selected={selectedSectors} onChange={setSelectedSectors} isAdmin={isAdmin} onEdit={() => setFilterManager({ isOpen: true, type: 'Sector' })} />
                <MultiSelect label="Turno" options={activeShiftTypes} selected={selectedShiftTypes} onChange={setSelectedShiftTypes} isAdmin={isAdmin} onEdit={() => setFilterManager({ isOpen: true, type: 'Shift' })} />
                <div className="flex-1 flex justify-end gap-3 items-end h-full pt-1 shrink-0">
                    {isGenerating && (<div className="flex flex-col justify-center min-w-[150px] mr-4 hidden lg:flex"><div className="flex justify-between text-[10px] text-blue-200 mb-1"><span>Gerando...</span><span>{generationProgress.current} / {generationProgress.total}</span></div><div className="w-full bg-blue-900 rounded-full h-2 overflow-hidden"><div className="bg-emerald-400 h-full transition-all duration-300 ease-out" style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}></div></div></div>)}
                    
                    {hasUnsavedChanges && <span className="text-xs text-yellow-300 font-bold animate-pulse mr-2 mb-2">Alterações não salvas!</span>}

                    <Tooltip content="Salvar Alterações"><button onClick={handleSaveData} disabled={isSaving} className={`p-2 rounded-full transition-all ${hasUnsavedChanges ? 'bg-yellow-600/50 animate-bounce' : 'hover:bg-white/10'}`}><SaveIcon saved={isSaved} saving={isSaving} /></button></Tooltip>
                    <Tooltip content="Imprimir Escala"><button onClick={handlePrint} className="p-2 text-white hover:bg-white/10 rounded-full transition-all"><PrintIcon /></button></Tooltip>
                    {canEdit && (<Tooltip content="Limpar Escala"><button onClick={handleClearClick} className="p-2 text-red-300 hover:bg-red-500/20 hover:text-red-200 rounded-full transition-all"><TrashIcon /></button></Tooltip>)}
                    <div className="w-px h-8 bg-blue-700 mx-2 hidden sm:block"></div>
                    {canEdit && (<>{isAdmin && (<Tooltip content="Legendas & Turnos"><button onClick={() => setShowShifts(true)} className="p-2 text-white hover:bg-white/10 rounded-full"><TagIcon /></button></Tooltip>)}<Tooltip content="Regras da IA"><button onClick={() => setShowRules(true)} className="p-2 text-white hover:bg-white/10 rounded-full"><MegaphoneIcon /></button></Tooltip><Tooltip content="Dimensionamento"><button onClick={() => setShowStaffing(true)} className="p-2 text-white hover:bg-white/10 rounded-full"><ChartBarIcon /></button></Tooltip><button onClick={handleAutoGenerateClick} disabled={isGenerating} className="ml-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded uppercase shadow border border-emerald-400 disabled:opacity-50 min-w-max">{isGenerating ? 'Parar' : 'Gerar (IA)'}</button></>)}
                    {!canEdit && (
                        <div className="ml-2 px-4 py-1.5 bg-gray-500/50 text-white text-xs font-bold rounded border border-gray-400 cursor-not-allowed flex items-center gap-1" title="Edição bloqueada para meses anteriores">
                            <span>🔒 Somente Leitura</span>
                        </div>
                    )}
                </div>
            </div>
        )}
      </header>
      
      {/* PRINT ONLY HEADER */}
      <div className="hidden print:block p-4 border-b border-gray-300 bg-white">
          <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                 <div className="w-10 h-10 bg-[#002060] text-white flex items-center justify-center font-bold text-xl rounded">PS</div>
                 <div>
                     <h1 className="text-xl font-bold text-[#002060]">ESCALA FÁCIL - PREVENT SENIOR</h1>
                     <p className="text-sm font-bold text-gray-600 uppercase">{MONTH_NAMES[schedule.month]} / {schedule.year}</p>
                 </div>
              </div>
              <div className="text-right text-[10px] text-gray-500">
                  Impresso em: {new Date().toLocaleDateString()}
              </div>
          </div>
          <div className="flex gap-4 text-xs font-bold border rounded p-2 bg-gray-50">
              <div>UNIDADE: {selectedUnits.length ? selectedUnits.join(', ') : 'TODAS'}</div>
              <div className="border-l pl-4">SETOR: {selectedSectors.length ? selectedSectors.join(', ') : 'TODOS'}</div>
              <div className="border-l pl-4">TURNO: {selectedShiftTypes.length ? selectedShiftTypes.join(', ') : 'TODOS'}</div>
          </div>
      </div>

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
                            const from = newOrder.findIndex(e => e.id === a);
                            const to = newOrder.findIndex(e => e.id === b);
                            if(from >=0 && to >=0) { const [moved] = newOrder.splice(from, 1); newOrder.splice(to, 0, moved); setEmployees(newOrder); setHasUnsavedChanges(true); }
                        }}/>
               </div>
          ) : currentView === 'database' ? (
               <div className="h-full w-full"><EmployeeDatabaseScreen employees={employees} setEmployees={setEmployees} units={units} sectors={sectors} shiftTypes={shiftTypesList} /></div>
          ) : (<ReportsScreen employees={filteredEmployees} schedule={schedule} shifts={shifts} />)}
      </main>

      {/* PRINT ONLY FOOTER - LEGENDS & SIGNATURES */}
      {currentView === 'roster' && (
        <div className="hidden print:block p-4 mt-auto border-t border-gray-300 break-inside-avoid">
             <div className="mb-4">
                 <h4 className="font-bold text-xs uppercase mb-1">Legendas:</h4>
                 <div className="flex flex-wrap gap-2 text-[9px]">
                     {shifts.filter(s => ['work', 'dayoff', 'absence', 'leave'].includes(s.category)).map(s => (
                         <div key={s.id} className="flex items-center border rounded px-1 min-w-[80px]">
                             <span className={`w-4 h-4 flex items-center justify-center font-bold border mr-1 ${s.color} ${s.textColor}`}>{s.code}</span>
                             <span>{s.name}</span>
                         </div>
                     ))}
                 </div>
             </div>
             <div className="flex justify-between items-end pt-8 gap-8">
                 <div className="flex-1 border-t border-black text-center pt-1">
                     <p className="font-bold text-xs">Responsável pela Escala</p>
                     <p className="text-[10px] text-gray-500">Assinatura / Carimbo</p>
                 </div>
                 <div className="flex-1 border-t border-black text-center pt-1">
                     <p className="font-bold text-xs">Representante Prevent Senior</p>
                     <p className="text-[10px] text-gray-500">Assinatura / Carimbo</p>
                 </div>
             </div>
        </div>
      )}

      {showEmployees && <EmployeeManager employees={employees} setEmployees={setEmployees} onClose={() => setShowEmployees(false)} units={units} sectors={sectors} />}
      {showShifts && <ShiftManager shifts={shifts} setShifts={setShifts} onClose={() => setShowShifts(false)} />}
      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} rules={aiRules} setRules={setAiRules} />
      <StaffingModal isOpen={showStaffing} onClose={() => setShowStaffing(false)} employees={employees} config={staffingConfig} setConfig={setStaffingConfig} />
      {showUserMgmt && <UserManagement onClose={() => setShowUserMgmt(false)} availableUnits={units} employees={employees} />}
      <GenerationScopeModal isOpen={showGenerationScope} onClose={() => setShowGenerationScope(false)} employees={filteredEmployees} onConfirm={handleConfirmGeneration} />
      <FilterManagerModal isOpen={filterManager.isOpen} onClose={() => setFilterManager({ isOpen: false, type: null })} title={filterManager.type || ''} items={filterManager.type === 'Unit' ? units : filterManager.type === 'Sector' ? sectors : shiftTypesList} setItems={filterManager.type === 'Unit' ? setUnits : filterManager.type === 'Sector' ? setSectors : setShiftTypesList} />
      
      {/* CLEAR SCHEDULE MODALS */}
      <GenerationScopeModal // REUSING THIS MODAL FOR SCOPE SELECTION (It has correct logic)
         isOpen={clearScopeModalOpen} 
         onClose={() => setClearScopeModalOpen(false)}
         employees={filteredEmployees}
         onConfirm={handleScopeConfirm}
      />
      
      <ConfirmationModal 
        isOpen={showConfirmClear}
        onClose={() => setShowConfirmClear(false)}
        onConfirm={executeClearSchedule}
        title="Confirmar Limpeza"
        message={`ATENÇÃO: Você está prestes a limpar a escala de ${clearTargetIds.length === 0 ? 'TODOS os colaboradores visíveis' : clearTargetIds.length + ' colaboradores selecionados'} para este mês. Isso apagará turnos, anexos e observações. Deseja realmente continuar?`}
        confirmText="Limpar Agora"
        isDangerous={true}
      />

      {/* SYNC CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={showSyncConfirm}
        onClose={() => setShowSyncConfirm(false)}
        onConfirm={handleSync}
        title="Confirmar Sincronização"
        message="Deseja atualizar a lista de colaboradores via Google Sheets? Isso pode sobrescrever alterações manuais recentes nos cadastros."
        confirmText="Sincronizar"
        isDangerous={false}
      />
    </div>
  );
};

export default App;
