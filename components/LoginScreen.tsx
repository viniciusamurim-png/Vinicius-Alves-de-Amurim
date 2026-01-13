
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { INITIAL_USERS } from '../constants';
import { GoogleSheetsService } from '../services/googleSheetsService';

interface Props {
  onLogin: (user: User) => void;
}

export const LoginScreen: React.FC<Props> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncedUsers, setSyncedUsers] = useState<User[]>([]);

  // Fetch users from Cloud on Mount
  useEffect(() => {
    const fetchUsers = async () => {
        setLoading(true);
        try {
            // 1. Try cloud
            const cloudUsers = await GoogleSheetsService.fetchUsers();
            
            // 2. Load Local backup
            const storedUsersStr = localStorage.getItem('APP_USERS');
            const localUsers: User[] = storedUsersStr ? JSON.parse(storedUsersStr) : INITIAL_USERS;

            // 3. Merge Strategies: prefer Cloud, but keep Admin if missing
            // For simplicity, if cloud returns data, we use it + merge local admin if needed.
            // Actually, best is to rely on cloud list if available, fallback to local.
            
            let finalUsers = localUsers;
            
            if (cloudUsers.length > 0) {
                finalUsers = cloudUsers;
                // Ensure default admin exists if not in sheet
                if (!finalUsers.find(u => u.username === 'admin')) {
                    finalUsers.push(INITIAL_USERS[0]);
                }
                // Update local cache
                localStorage.setItem('APP_USERS', JSON.stringify(finalUsers));
            }
            
            setSyncedUsers(finalUsers);
        } catch (e) {
            console.error("Login sync error", e);
            // Fallback
            const storedUsersStr = localStorage.getItem('APP_USERS');
            setSyncedUsers(storedUsersStr ? JSON.parse(storedUsersStr) : INITIAL_USERS);
        } finally {
            setLoading(false);
        }
    };

    fetchUsers();
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Use the synced list
    const user = syncedUsers.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    
    if (user) {
      onLogin(user);
    } else {
      setError('Credenciais inválidas.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-200">
      <div className="bg-white p-8 rounded-lg shadow-2xl w-96 border-t-4 border-company-blue relative">
         <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-company-blue rounded flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                PS
            </div>
         </div>
         <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">ESCALA FÁCIL</h2>
         <p className="text-center text-slate-500 mb-6 text-sm">Acesso Restrito - Prevent Senior</p>
         
         <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Usuário</label>
              <input 
                type="text" 
                value={username} 
                onChange={e => setUsername(e.target.value)}
                className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-blue-600 outline-none"
                placeholder="admin"
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
                placeholder="***"
                disabled={loading}
              />
            </div>
            
            {error && <p className="text-red-600 text-xs font-bold text-center">{error}</p>}
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-company-blue text-white font-bold py-2 rounded hover:bg-blue-900 transition-colors uppercase shadow disabled:opacity-70 flex justify-center items-center gap-2"
            >
              {loading && (
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
              )}
              {loading ? 'Sincronizando...' : 'Entrar'}
            </button>
         </form>
         <p className="mt-4 text-center text-[10px] text-slate-400">
             {loading ? 'Buscando base de usuários na nuvem...' : 'Sistema de Gestão de Escalas v2.1 (Online)'}
         </p>
      </div>
    </div>
  );
};
