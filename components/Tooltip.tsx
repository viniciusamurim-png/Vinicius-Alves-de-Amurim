
import React, { useState, useRef, useEffect } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 6, // 6px de margem abaixo do elemento
        left: rect.left + (rect.width / 2) // Centralizado horizontalmente
      });
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  // Fecha o tooltip se o usuário rolar a página para evitar que o texto fique "solto"
  useEffect(() => {
      const handleScroll = () => {
          if(isVisible) setIsVisible(false);
      };
      window.addEventListener('scroll', handleScroll, true);
      return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isVisible]);

  return (
    <div 
        ref={triggerRef}
        className="flex items-center justify-center h-fit w-fit cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
    >
      {children}
      
      {isVisible && (
        <div 
            style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                transform: 'translateX(-50%)',
                zIndex: 999999, // Z-index extremo para garantir sobreposição
                pointerEvents: 'none'
            }}
            className="animate-in fade-in zoom-in duration-100"
        >
            {/* Seta do tooltip apontando para cima */}
            <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[4px] border-b-gray-900 absolute -top-1 left-1/2 -translate-x-1/2"></div>
            
            {/* Conteúdo */}
            <div className="bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow-xl uppercase tracking-wide whitespace-nowrap">
                 {content}
            </div>
        </div>
      )}
    </div>
  );
};
