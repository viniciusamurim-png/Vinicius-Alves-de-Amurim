
import React, { useState } from 'react';
import { User } from '../types';
import { INITIAL_USERS } from '../constants';
import { hashPassword, createSession } from '../services/securityService';

interface Props {
  onLogin: (user: User) => void;
}

export const LoginScreen: React.FC<Props> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Simulate network delay for security feeling
    await new Promise(r => setTimeout(r, 500));

    // 1. Get Users (In real app, this is API call)
    const storedUsersStr = localStorage.getItem('APP_USERS');
    const allUsers: User[] = storedUsersStr ? JSON.parse(storedUsersStr) : INITIAL_USERS;

    // 2. Hash Input Password
    const hashedInput = await hashPassword(password);
    
    // 3. Find User
    // Note: In a real migration, existing plain-text passwords in 'allUsers' should be hashed.
    // Here we check both plain (legacy) and hashed (new standard)
    const user = allUsers.find(u => 
        u.username === username && 
        (u.password === password || u.password === hashedInput)
    );
    
    if (user) {
        // Create Secure Session
        const sessionUser = createSession(user);
        onLogin(sessionUser);
    } else {
      setError('Credenciais inválidas ou acesso não autorizado.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-200">
      <div className="bg-white p-8 rounded-lg shadow-2xl w-96 border-t-4 border-company-blue">
         <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-company-blue rounded flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                PS
            </div>
         </div>
         <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">ESCALA FÁCIL</h2>
         <p className="text-center text-slate-500 mb-6 text-sm">Acesso Seguro &bull; Prevent Senior</p>
         
         <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Usuário</label>
              <input 
                type="text" 
                value={username} 
                onChange={e => setUsername(e.target.value)}
                className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-blue-600 outline-none"
                placeholder="ID ou Usuário"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Senha</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-blue-600 outline-none"
                placeholder="••••••"
                disabled={loading}
              />
            </div>
            
            {error && <p className="text-red-600 text-xs font-bold text-center bg-red-50 p-2 rounded border border-red-100">{error}</p>}
            
            <button 
              type="submit" 
              disabled={loading}
              className={`w-full text-white font-bold py-2 rounded transition-all uppercase shadow flex justify-center ${loading ? 'bg-blue-400 cursor-not-allowed' : 'bg-company-blue hover:bg-blue-900'}`}
            >
              {loading ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
              ) : 'Acessar Sistema'}
            </button>
         </form>
         <div className="mt-6 flex justify-center text-[10px] text-slate-400 gap-4">
             <span>v2.1.0 (Secure)</span>
             <span>&bull;</span>
             <span>Criptografia Ativa</span>
         </div>
      </div>
    </div>
  );
};
