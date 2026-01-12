
import React, { useState, useMemo, useEffect } from 'react';
import { Employee } from '../types.ts';
import { ConfirmationModal } from './ConfirmationModal.tsx';

interface Props {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  units: string[];
  sectors: string[];
  shiftTypes: string[];
}

const ITEMS_PER_PAGE = 50;

export const EmployeeDatabaseScreen: React.FC<Props> = ({ employees, setEmployees, units, sectors, shiftTypes }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [showConfirmDeleteAll, setShowConfirmDeleteAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Employee>>({});

  // CASCADING SECTORS LOGIC FOR EDIT FORM
  const availableFormSectors = useMemo(() => {
      if (formData.unit) {
          const unitSectors = new Set(employees.filter(e => e.unit === formData.unit).map(e => e.sector));
          if (unitSectors.size > 0) return Array.from(unitSectors).sort();
      }
      return sectors;
  }, [formData.unit, employees, sectors]);

  const filtered = useMemo(() => {
      return employees.filter(e => {
          const matchSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.cpf.includes(searchTerm) || e.id.includes(searchTerm);
          const matchUnit = !filterUnit || e.unit === filterUnit;
          const matchSector = !filterSector || e.sector === filterSector;
          return matchSearch && matchUnit && matchSector;
      });
  }, [employees, searchTerm, filterUnit, filterSector]);

  // Reset page on filter
  useMemo(() => setCurrentPage(1), [searchTerm, filterUnit, filterSector]);

  const paginated = useMemo(() => {
      const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
      return filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);

  const handleEdit = (emp: Employee) => {
      setEditingId(emp.id);
      setFormData({ ...emp });
  };

  const handleSave = () => {
      if (!formData.name || !formData.role) return;
      setEmployees(employees.map(e => e.id === editingId ? Object.assign({}, e, formData) as Employee : e));
      setEditingId(null);
      setFormData({});
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
      e.stopPropagation(); 
      if (window.confirm('Tem certeza que deseja excluir este colaborador?')) {
          setEmployees(prev => prev.filter(e => e.id !== id));
          if (editingId === id) setEditingId(null);
      }
  };

  const executeDeleteAll = () => { setEmployees([]); setEditingId(null); }

  const handleExportCSV = () => {
      let csv = "Nome;ID;Cargo;CPF;Escala;Posição;Categoria;BH;Unidade;Setor;Unid. Org;Nascimento;Admissão;Email;Sexo;Horário;Ignorado;Data Desligamento\n";
      employees.forEach(e => {
          const row = [
              e.name, e.id, e.role, e.cpf, e.shiftPattern, e.positionNumber, e.categoryCode, e.bankHoursBalance,
              e.unit, e.sector, e.organizationalUnit, e.birthDate, e.admissionDate, e.email, e.gender, e.workTime, '', e.terminationDate
          ].map(val => `"${val || ''}"`).join(';');
          csv += row + "\n";
      });
      const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Cadastro_Colaboradores_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
  }

  return (
    <div className="flex h-full bg-slate-100 overflow-hidden">
      {/* Sidebar Form */}
      <div className={`bg-white border-r w-96 flex flex-col transition-all duration-300 ${editingId ? 'translate-x-0' : '-translate-x-full absolute h-full z-10 shadow-2xl'}`}>
         <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
             <h3 className="font-bold text-slate-700 uppercase">Editar Colaborador</h3>
             <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-red-500">✕</button>
         </div>
         <div className="flex-1 overflow-y-auto p-4 space-y-4">
             <div><label className="text-[10px] font-bold uppercase text-slate-500">Nome Completo</label><input className="w-full border rounded p-2 text-sm uppercase" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
             <div className="grid grid-cols-2 gap-2">
                 <div><label className="text-[10px] font-bold uppercase text-slate-500">ID / Matrícula</label><input className="w-full border rounded p-2 text-sm" value={formData.id || ''} onChange={e => setFormData({...formData, id: e.target.value})} /></div>
                 <div><label className="text-[10px] font-bold uppercase text-slate-500">CPF</label><input className="w-full border rounded p-2 text-sm" value={formData.cpf || ''} onChange={e => setFormData({...formData, cpf: e.target.value})} /></div>
             </div>
             <div><label className="text-[10px] font-bold uppercase text-slate-500">Cargo</label><input className="w-full border rounded p-2 text-sm uppercase" value={formData.role || ''} onChange={e => setFormData({...formData, role: e.target.value})} /></div>
             <div className="grid grid-cols-2 gap-2">
                 <div><label className="text-[10px] font-bold uppercase text-slate-500">Unidade</label><select className="w-full border rounded p-2 text-sm bg-white" value={formData.unit || ''} onChange={e => setFormData({...formData, unit: e.target.value})}>{units.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                 <div><label className="text-[10px] font-bold uppercase text-slate-500">Setor</label><select className="w-full border rounded p-2 text-sm bg-white" value={formData.sector || ''} onChange={e => setFormData({...formData, sector: e.target.value})}>{availableFormSectors.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
             </div>
             <div><label className="text-[10px] font-bold uppercase text-slate-500">Turno</label><select className="w-full border rounded p-2 text-sm bg-white" value={formData.shiftType || ''} onChange={e => setFormData({...formData, shiftType: e.target.value})}><option value="">Selecione</option>{shiftTypes.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
             <div><label className="text-[10px] font-bold uppercase text-slate-500">Unidade Organizacional</label><input className="w-full border rounded p-2 text-sm" value={formData.organizationalUnit || ''} onChange={e => setFormData({...formData, organizationalUnit: e.target.value})} /></div>
             <div><label className="text-[10px] font-bold uppercase text-slate-500">Email</label><input className="w-full border rounded p-2 text-sm" type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} /></div>
             <div className="grid grid-cols-2 gap-2">
                 <div><label className="text-[10px] font-bold uppercase text-slate-500">Data Nasc.</label><input className="w-full border rounded p-2 text-sm" type="date" value={formData.birthDate || ''} onChange={e => setFormData({...formData, birthDate: e.target.value})} /></div>
                 <div><label className="text-[10px] font-bold uppercase text-slate-500">Data Admissão</label><input className="w-full border rounded p-2 text-sm" type="date" value={formData.admissionDate || ''} onChange={e => setFormData({...formData, admissionDate: e.target.value})} /></div>
             </div>
             <div><label className="text-[10px] font-bold uppercase text-slate-500">Gênero (Sexo)</label><select className="w-full border rounded p-2 text-sm bg-white" value={formData.gender || ''} onChange={e => setFormData({...formData, gender: e.target.value})}><option value="">Selecione</option><option value="Feminino">Feminino</option><option value="Masculino">Masculino</option><option value="Outro">Outro</option></select></div>
             <div className="grid grid-cols-2 gap-2">
                 <div><label className="text-[10px] font-bold uppercase text-slate-500">Escala (Padrão)</label><input className="w-full border rounded p-2 text-sm uppercase" value={formData.shiftPattern || ''} onChange={e => setFormData({...formData, shiftPattern: e.target.value})} /></div>
                 <div><label className="text-[10px] font-bold uppercase text-slate-500">Horário</label><input className="w-full border rounded p-2 text-sm uppercase" placeholder="07:00 - 19:00" value={formData.workTime || ''} onChange={e => setFormData({...formData, workTime: e.target.value})} /></div>
             </div>
             <div className="grid grid-cols-2 gap-2">
                 <div><label className="text-[10px] font-bold uppercase text-slate-500">Saldo BH</label><input className="w-full border rounded p-2 text-sm" value={formData.bankHoursBalance || ''} onChange={e => setFormData({...formData, bankHoursBalance: e.target.value})} /></div>
                 <div><label className="text-[10px] font-bold uppercase text-slate-500">Nº Posição</label><input className="w-full border rounded p-2 text-sm uppercase" value={formData.positionNumber || ''} onChange={e => setFormData({...formData, positionNumber: e.target.value})} /></div>
             </div>
             <div className="grid grid-cols-2 gap-2">
                 <div><label className="text-[10px] font-bold uppercase text-slate-500">UF (Última Folga)</label><input className="w-full border rounded p-2 text-sm" type="date" value={formData.lastDayOff || ''} onChange={e => setFormData({...formData, lastDayOff: e.target.value})} /></div>
                 <div><label className="text-[10px] font-bold uppercase text-red-500">Data Desligamento</label><input className="w-full border rounded p-2 text-sm border-red-200" type="date" value={formData.terminationDate || ''} onChange={e => setFormData({...formData, terminationDate: e.target.value})} /></div>
             </div>
             <div><label className="text-[10px] font-bold uppercase text-slate-500">Cod. Categoria</label><input className="w-full border rounded p-2 text-sm" value={formData.categoryCode || ''} onChange={e => setFormData({...formData, categoryCode: e.target.value})} /></div>
         </div>
         <div className="p-4 border-t bg-slate-50">
             <button onClick={handleSave} className="w-full bg-company-blue text-white py-2 rounded font-bold uppercase hover:bg-blue-900">Salvar Dados</button>
         </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col h-full transition-all duration-300 ${editingId ? 'ml-0' : 'ml-0'}`}>
          <div className="bg-white p-4 border-b flex items-center justify-between shadow-sm">
             <div className="flex gap-4 items-center">
                 <input className="border border-slate-300 rounded-full px-4 py-2 text-sm w-64 bg-slate-50 focus:bg-white transition-colors" placeholder="Buscar por Nome, CPF ou ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                 <select className="border border-slate-300 rounded px-2 py-2 text-sm bg-white" value={filterUnit} onChange={e => setFilterUnit(e.target.value)}><option value="">Todas Unidades</option>{units.map(u => <option key={u} value={u}>{u}</option>)}</select>
                 <select className="border border-slate-300 rounded px-2 py-2 text-sm bg-white" value={filterSector} onChange={e => setFilterSector(e.target.value)}><option value="">Todos Setores</option>{sectors.map(s => <option key={s} value={s}>{s}</option>)}</select>
             </div>
             <div className="flex gap-2">
                 <button onClick={() => setShowConfirmDeleteAll(true)} className="flex items-center gap-2 px-3 py-2 bg-red-100 text-red-600 border border-red-200 rounded font-bold uppercase text-xs hover:bg-red-200">🗑️ Excluir Tudo</button>
                 <button onClick={handleExportCSV} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 border border-slate-200 rounded font-bold uppercase text-xs hover:bg-slate-200">📥 Exportar CSV</button>
             </div>
          </div>
          
          <div className="flex-1 overflow-auto p-4 flex flex-col">
              <div className="bg-white rounded shadow border border-slate-200 overflow-hidden flex-1 flex flex-col">
                  <div className="overflow-auto flex-1">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-xs sticky top-0 shadow-sm">
                              <tr>
                                  <th className="p-3">Nome / Cargo</th>
                                  <th className="p-3">Unidade / Setor</th>
                                  <th className="p-3">Dados Pessoais</th>
                                  <th className="p-3">Contrato / Escala</th>
                                  <th className="p-3 text-right">Ações</th>
                              </tr>
                          </thead>
                          <tbody>
                              {paginated.map(emp => (
                                  <tr key={emp.id} className="border-b hover:bg-blue-50 transition-colors group">
                                      <td className="p-3">
                                          <div className="font-bold text-slate-800">{emp.name}</div>
                                          <div className="text-xs text-slate-500">{emp.role}</div>
                                          <div className="text-[10px] text-blue-600">ID: {emp.id}</div>
                                      </td>
                                      <td className="p-3">
                                          <div className="text-xs font-medium">{emp.unit}</div>
                                          <div className="text-xs text-slate-500">{emp.sector}</div>
                                          <div className="text-[10px] text-slate-400">{emp.organizationalUnit}</div>
                                      </td>
                                      <td className="p-3">
                                          <div className="text-xs">CPF: {emp.cpf}</div>
                                          <div className="text-[10px] text-slate-500">{emp.email}</div>
                                          <div className="text-[10px] text-slate-400">Nasc: {emp.birthDate} {emp.gender ? `• ${emp.gender}` : ''}</div>
                                      </td>
                                      <td className="p-3">
                                          <div className="text-xs font-medium">{emp.shiftPattern} ({emp.shiftType})</div>
                                          <div className="text-[10px] text-slate-600 mb-0.5">{emp.workTime}</div>
                                          <div className="text-[10px] text-green-600 font-bold">BH: {emp.bankHoursBalance}</div>
                                          <div className="text-[9px] text-slate-400 mt-1">UF: {emp.lastDayOff ? emp.lastDayOff.split('-').reverse().slice(0, 2).join('/') : '-'}</div>
                                          {emp.terminationDate && <div className="text-[9px] text-red-500 font-bold mt-1">Deslig: {emp.terminationDate}</div>}
                                      </td>
                                      <td className="p-3 text-right">
                                          <button onClick={() => handleEdit(emp)} className="text-blue-600 hover:text-blue-800 mr-3 font-bold text-xs uppercase">Editar</button>
                                          <button onClick={(e) => handleDelete(e, emp.id)} className="text-red-400 hover:text-red-600 text-xs uppercase">Excluir</button>
                                      </td>
                                  </tr>
                              ))}
                              {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">Nenhum colaborador encontrado.</td></tr>}
                          </tbody>
                      </table>
                  </div>
                  {/* Pagination Footer */}
                  <div className="flex items-center justify-between p-2 bg-slate-50 border-t border-slate-200">
                     <span className="text-xs text-slate-500">Mostrando {paginated.length} de {filtered.length}</span>
                     <div className="flex gap-2">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 bg-white border rounded text-xs hover:bg-slate-100 disabled:opacity-50">Anterior</button>
                        <span className="text-xs font-bold self-center">Pág {currentPage} de {totalPages || 1}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="px-3 py-1 bg-white border rounded text-xs hover:bg-slate-100 disabled:opacity-50">Próxima</button>
                     </div>
                  </div>
              </div>
          </div>
      </div>
      
      <ConfirmationModal isOpen={showConfirmDeleteAll} onClose={() => setShowConfirmDeleteAll(false)} onConfirm={executeDeleteAll} title="Excluir Todos os Colaboradores" message="ATENÇÃO: Esta ação irá apagar PERMANENTEMENTE todos os colaboradores cadastrados no sistema. Você terá que cadastrar ou importar tudo novamente. Deseja realmente continuar?" confirmText="Excluir Definitivamente" isDangerous={true} />
    </div>
  );
};
