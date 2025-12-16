
import React, { useState, useRef, useEffect } from 'react';

interface Props {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  isAdmin?: boolean;
  onEdit?: () => void;
}

export const MultiSelect: React.FC<Props> = ({ label, options, selected, onChange, isAdmin, onEdit }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // Verificar se o clique foi dentro do dropdown (que agora está no body via fixed, mas logicamente aqui)
        // Como é difícil rastrear o elemento fixed via ref direta neste contexto simples,
        // confiamos que se o usuário clicar fora do botão e fora do menu (tratado pelo evento de clique no menu), fecha.
        // Mas para simplificar com fixed: fechamos ao clicar fora.
        // Uma verificação extra para o dropdown fixed seria necessária se ele fosse complexo, 
        // mas aqui vamos fechar se clicar em qualquer lugar e a lógica do menu impede propagação.
      }
    };
    
    // Fechar ao rolar a página para evitar que o menu flutue sozinho
    const handleScroll = () => {
        if(isOpen) setIsOpen(false);
    };

    if (isOpen) {
        window.addEventListener('click', () => setIsOpen(false)); // Global close
        window.addEventListener('scroll', handleScroll, true);
    }
    
    return () => {
        window.removeEventListener('click', () => setIsOpen(false));
        window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const toggleOpen = (e: React.MouseEvent) => {
      e.stopPropagation(); // Previne fechar imediatamente pelo listener global
      if (!isOpen && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setDropdownStyle({
              position: 'fixed',
              top: `${rect.bottom + 4}px`,
              left: `${rect.left}px`,
              width: '16rem', // w-64 equivalent
              zIndex: 99999, // Super high z-index
              maxHeight: '20rem'
          });
      }
      setIsOpen(!isOpen);
  };

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(s => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-1 relative" ref={containerRef}>
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-bold uppercase text-blue-200 tracking-wider">{label}</label>
        {isAdmin && onEdit && (
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-[10px] text-blue-300 hover:text-white" title="Editar Lista">✏️</button>
        )}
      </div>
      
      <button 
        onClick={toggleOpen} 
        className="bg-blue-800 text-white text-sm border border-blue-600 rounded px-2 py-1 min-w-[160px] outline-none text-left flex justify-between items-center hover:bg-blue-700 transition-colors"
      >
        <span className="truncate block max-w-[140px]">
          {selected.length === 0 ? 'TODOS' : selected.length === 1 ? selected[0] : `${selected.length} Selecionados`}
        </span>
        <span className="text-[10px] opacity-70">▼</span>
      </button>

      {isOpen && (
        <div 
            style={dropdownStyle} 
            className="bg-white border border-slate-300 rounded shadow-xl flex flex-col text-slate-800 animate-in fade-in zoom-in duration-100"
            onClick={(e) => e.stopPropagation()} // Impede fechar ao clicar dentro
        >
            <div className="p-2 border-b bg-slate-50 sticky top-0 rounded-t">
                <input 
                    type="text" 
                    placeholder="Buscar..." 
                    className="w-full text-xs p-1 border rounded text-slate-800"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    autoFocus
                />
            </div>
            <div className="overflow-y-auto flex-1 p-1 max-h-60">
                <div 
                    onClick={() => onChange([])}
                    className={`flex items-center gap-2 p-2 hover:bg-blue-50 cursor-pointer text-xs rounded ${selected.length === 0 ? 'bg-blue-100 font-bold text-blue-800' : 'text-slate-700'}`}
                >
                    <div className={`w-4 h-4 border rounded flex items-center justify-center ${selected.length === 0 ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>
                        {selected.length === 0 && <span className="text-white text-[10px]">✓</span>}
                    </div>
                    <span>TODOS</span>
                </div>
                
                {filteredOptions.map(opt => (
                    <div 
                        key={opt} 
                        onClick={() => toggleOption(opt)}
                        className="flex items-center gap-2 p-2 hover:bg-blue-50 cursor-pointer text-xs rounded text-slate-700"
                    >
                        <div className={`w-4 h-4 border rounded flex items-center justify-center ${selected.includes(opt) ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>
                            {selected.includes(opt) && <span className="text-white text-[10px]">✓</span>}
                        </div>
                        <span>{opt}</span>
                    </div>
                ))}
                {filteredOptions.length === 0 && (
                    <div className="p-2 text-xs text-slate-400 text-center">Nenhum item encontrado</div>
                )}
            </div>
            <div className="p-2 border-t bg-slate-50 flex justify-between rounded-b">
                <button onClick={() => onChange([])} className="text-[10px] text-blue-600 hover:underline">Limpar</button>
                <button onClick={() => setIsOpen(false)} className="text-[10px] text-blue-600 hover:underline">Fechar</button>
            </div>
        </div>
      )}
    </div>
  );
};
