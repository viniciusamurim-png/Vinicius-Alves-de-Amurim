
import React, { useState, useEffect, useMemo } from 'react';
import { User, Employee } from '../types';
import { INITIAL_USERS } from '../constants';
import { GoogleSheetsService } from '../services/googleSheetsService';
import { ConfirmationModal } from './ConfirmationModal';

interface Props {
  onClose: () => void;
  availableUnits: string[];
  employees: Employee[];
}

export const UserManagement: React.FC<Props> = ({ onClose, availableUnits, employees }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{id: string, username: string} | null>(null);
  
  const [formData, setFormData] = useState({ 
      username: '', 
      password: '', 
      name: '', 
      role: 'viewer' as 'admin'|'manager'|'viewer',
      allowedUnits: [] as string[],
      allowedSectors: [] as string[]
  });

  // Load from Cloud on Mount
  useEffect(() => {
    const loadData = async () => {
        setLoading(true);
        try {
            const cloudUsers = await GoogleSheetsService.fetchUsers();
            if (cloudUsers.length > 0) {
                setUsers(cloudUsers);
                localStorage.setItem('APP_USERS', JSON.stringify(cloudUsers));
            } else {
                // Fallback local
                const stored = localStorage.getItem('APP_USERS');
                setUsers(stored ? JSON.parse(stored) : INITIAL_USERS);
            }
        } catch (e) {
            console.error(e);
            const stored = localStorage.getItem('APP_USERS');
            setUsers(stored ? JSON.parse(stored) : INITIAL_USERS);
        } finally {
            setLoading(false);
        }
    };
    loadData();
  }, []);

  // Derive available sectors ONLY from the selected Allowed Units
  const availableSectors = useMemo(() => {
      if (formData.allowedUnits.length === 0) return [];
      const relevantEmployees = employees.filter(e => formData.allowedUnits.includes(e.unit));
      const sectors = new Set(relevantEmployees.map(e => e.sector));
      return Array.from(sectors).filter(Boolean).sort();
  }, [employees, formData.allowedUnits]);

  // Update local state and storage, AND send to Cloud
  const handleSave = async () => {
      if (!formData.username || !formData.password) return;
      
      setIsSaving(true);

      const newUser: User = {
          id: editingId || Date.now().toString(),
          username: formData.username,
          password: formData.password,
          name: formData.name,
          role: formData.role,
          allowedUnits: formData.role === 'admin' ? [] : formData.allowedUnits,
          allowedSectors: formData.role === 'admin' ? [] : formData.allowedSectors
      };

      try {
          // 1. Send to Cloud
          await GoogleSheetsService.syncUser(newUser);

          // 2. Update Local State
          let updatedUsers = [];
          if (editingId) {
              updatedUsers = users.map(u => u.id === editingId ? newUser : u);
          } else {
              updatedUsers = [...users, newUser];
          }
          setUsers(updatedUsers);
          localStorage.setItem('APP_USERS', JSON.stringify(updatedUsers));
          
          resetForm();
      } catch (e) {
          alert("Erro ao salvar usuário na nuvem. Verifique a conexão.");
      } finally {
          setIsSaving(false);
      }
  };

  const handleEdit = (user: User) => {
      setEditingId(user.id);
      setFormData({
          username: user.username,
          password: user.password || '',
          name: user.name,
          role: user.role,
          allowedUnits: user.allowedUnits || [],
          allowedSectors: user.allowedSectors || []
      });
  }

  const resetForm = () => {
      setEditingId(null);
      setFormData({ username: '', password: '', name: '', role: 'viewer', allowedUnits: [], allowedSectors: [] });
  }

  // Step 1: Click Trash Icon -> Open Modal
  const handleRemoveClick = (e: React.MouseEvent, id: string, username: string) => {
      e.preventDefault();
      e.stopPropagation(); 
      
      if(id === 'admin' || username === 'admin') {
          alert('Não é possível remover o super admin.');
          return;
      }
      setDeleteTarget({ id, username });
  };

  // Step 2: Confirm in Modal -> Execute Delete
  const executeDelete = async () => {
      if (!deleteTarget) return;

      setIsSaving(true);
      try {
          // Optimistic Update: Remove from UI immediately
          const newUsers = users.filter(u => u.id !== deleteTarget.id);
          setUsers(newUsers);
          localStorage.setItem('APP_USERS', JSON.stringify(newUsers));
          if (editingId === deleteTarget.id) resetForm();

          // Send delete request to cloud
          await GoogleSheetsService.deleteUser(deleteTarget.id);
      } catch (err) {
          alert("Erro ao enviar comando de exclusão para a nuvem. O usuário pode reaparecer ao recarregar.");
          console.error(err);
      } finally {
          setIsSaving(false);
          setDeleteTarget(null);
      }
  };

  const toggleUnit = (unit: string) => {
      setFormData(prev => {
          const exists = prev.allowedUnits.includes(unit);
          return {
              ...prev,
              allowedUnits: exists 
                ? prev.allowedUnits.filter(u => u !== unit)
                : [...prev.allowedUnits, unit],
              allowedSectors: exists ? [] : prev.allowedSectors
          };
      });
  };

  const toggleSector = (sector: string) => {
      setFormData(prev => {
          const exists = prev.allowedSectors.includes(sector);
          return {
              ...prev,
              allowedSectors: exists 
                ? prev.allowedSectors.filter(s => s !== sector)
                : [...prev.allowedSectors, sector]
          };
      });
  };

  return (
    <>
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
       <div className="bg-white rounded-lg shadow-2xl w-[900px] flex flex-col h-[700px]">
          <div className="flex items-center justify-between p-4 border-b bg-slate-100">
             <h3 className="font-bold text-slate-800 flex items-center gap-2">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                 </svg>
                 Gerenciar Usuários e Permissões {loading && <span className="text-xs text-blue-500 font-normal animate-pulse">(Sincronizando...)</span>}
             </h3>
             <button onClick={onClose} className="text-slate-400 hover:text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
             </button>
          </div>
          
          <div className="flex-1 flex gap-4 p-4 overflow-hidden">
             {/* Form */}
             <div className="w-5/12 flex flex-col gap-3 bg-blue-50 p-4 rounded border border-blue-100 overflow-y-auto">
                <div className="flex justify-between items-center">
                    <h4 className="font-bold text-sm text-blue-900 uppercase mb-2">{editingId ? 'Editar Usuário' : 'Novo Usuário'}</h4>
                    {editingId && <button onClick={resetForm} className="text-xs text-blue-500 underline">Cancelar Edição</button>}
                </div>
                <div>
                    <label className="text-xs font-bold uppercase text-slate-500">Nome Completo</label>
                    <input className="w-full border rounded p-1" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} onKeyDown={e => e.stopPropagation()} disabled={isSaving} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs font-bold uppercase text-slate-500">Usuário</label>
                        <input className="w-full border rounded p-1" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} onKeyDown={e => e.stopPropagation()} disabled={isSaving} />
                    </div>
                    <div>
                        <label className="text-xs font-bold uppercase text-slate-500">Senha</label>
                        <input className="w-full border rounded p-1" type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} onKeyDown={e => e.stopPropagation()} disabled={isSaving} />
                    </div>
                </div>
                
                <div>
                    <label className="text-xs font-bold uppercase text-slate-500">Nível de Acesso</label>
                    <select className="w-full border rounded p-1" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as any, allowedUnits: [], allowedSectors: []})} disabled={isSaving}>
                        <option value="viewer">Visualizador (Somente Leitura)</option>
                        <option value="manager">Gerente (Edita Escala)</option>
                        <option value="admin">Administrador (Total)</option>
                    </select>
                </div>
                
                {formData.role !== 'admin' && (
                    <div className="flex-1 border-t pt-2 mt-2 flex flex-col gap-2 overflow-hidden">
                        <div className="flex-1 overflow-hidden flex flex-col h-1/2">
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Unidades Permitidas</label>
                            <div className="flex-1 overflow-y-auto bg-white p-2 rounded border mb-2">
                                {availableUnits.map(unit => (
                                    <label key={unit} className="flex items-center gap-2 text-xs mb-1 cursor-pointer hover:bg-slate-50">
                                        <input 
                                            type="checkbox" 
                                            checked={formData.allowedUnits.includes(unit)}
                                            onChange={() => toggleUnit(unit)}
                                            disabled={isSaving}
                                        />
                                        {unit}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col h-1/2">
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Setores (Filtrado por Unidade)</label>
                            {formData.allowedUnits.length === 0 ? (
                                <div className="text-xs text-slate-400 italic p-2 border bg-slate-50 rounded">Selecione uma unidade primeiro.</div>
                            ) : (
                                <div className="flex-1 overflow-y-auto bg-white p-2 rounded border">
                                    {availableSectors.length > 0 ? availableSectors.map(sec => (
                                        <label key={sec} className="flex items-center gap-2 text-xs mb-1 cursor-pointer hover:bg-slate-50">
                                            <input 
                                                type="checkbox" 
                                                checked={formData.allowedSectors.includes(sec)}
                                                onChange={() => toggleSector(sec)}
                                                disabled={isSaving}
                                            />
                                            {sec}
                                        </label>
                                    )) : (
                                        <span className="text-[10px] text-slate-400 p-2">Nenhum setor encontrado para as unidades selecionadas.</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <button onClick={handleSave} disabled={isSaving} className="w-full bg-green-600 text-white font-bold py-2 rounded hover:bg-green-700 mt-2 uppercase text-xs flex justify-center items-center gap-2">
                    {isSaving && <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                    {editingId ? 'Atualizar Usuário' : 'Adicionar Usuário'}
                </button>
             </div>

             {/* List */}
             <div className="flex-1 overflow-y-auto border rounded bg-white">
                 <table className="w-full text-sm text-left">
                     <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs sticky top-0">
                         <tr>
                             <th className="p-2">Usuário</th>
                             <th className="p-2">Nível</th>
                             <th className="p-2">Unidades</th>
                             <th className="p-2 text-right">Ação</th>
                         </tr>
                     </thead>
                     <tbody>
                         {users.map(u => (
                             <tr key={u.id} className="border-b hover:bg-slate-50">
                                 <td className="p-2">
                                     <div className="font-bold">{u.name}</div>
                                     <div className="text-xs text-slate-400">{u.username}</div>
                                 </td>
                                 <td className="p-2">
                                     <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase 
                                        ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 
                                          u.role === 'manager' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                                         {u.role}
                                     </span>
                                 </td>
                                 <td className="p-2 text-xs text-slate-500">
                                     {u.role === 'admin' ? (
                                         <span className="text-green-600 font-bold">TOTAL</span>
                                     ) : (
                                         <div className="flex flex-col gap-1">
                                             <span>U: {u.allowedUnits?.length ? u.allowedUnits.length : 0}</span>
                                             <span>S: {u.allowedSectors?.length ? u.allowedSectors.length : 0}</span>
                                         </div>
                                     )}
                                 </td>
                                 <td className="p-2 text-right">
                                     <div className="flex gap-2 justify-end">
                                         <button onClick={() => handleEdit(u)} className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Editar">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                         </button>
                                         <button onClick={(e) => handleRemoveClick(e, u.id, u.username)} className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded" title="Excluir">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                         </button>
                                     </div>
                                 </td>
                             </tr>
                         ))}
                     </tbody>
                 </table>
             </div>
          </div>
       </div>
    </div>
    
    <ConfirmationModal 
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={executeDelete}
        title="Excluir Usuário"
        message={`Tem certeza que deseja excluir permanentemente o usuário "${deleteTarget?.username}"? Esta ação não pode ser desfeita.`}
        confirmText="Sim, Excluir"
        isDangerous={true}
    />
    </>
  );
};
