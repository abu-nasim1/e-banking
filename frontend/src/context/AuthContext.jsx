import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/axios';
const Ctx = createContext(null);
export const useAuth = ()=>useContext(Ctx);
export function AuthProvider({children}){
  const [user,setUser]=useState(()=>JSON.parse(localStorage.getItem('user')||'null'));
  const [checkingSession,setCheckingSession]=useState(Boolean(localStorage.getItem('token')));
  const login=(data)=>{ localStorage.setItem('token',data.token); localStorage.setItem('user',JSON.stringify(data.user)); setUser(data.user); setCheckingSession(false); };
  const logout=()=>{ localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); setCheckingSession(false); };

  useEffect(()=>{
    if(!localStorage.getItem('token')) return;
    let active=true;
    api.get('/auth/me').then(({data})=>{
      if(!active) return;
      if(data.role==='USER'&&data.approvalStatus!=='ACTIVE') throw new Error('Customer account is not approved');
      localStorage.setItem('user',JSON.stringify(data));
      setUser(data);
    }).catch(()=>{
      if(!active) return;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
    }).finally(()=>active&&setCheckingSession(false));
    return ()=>{active=false;};
  },[]);

  return <Ctx.Provider value={{user,login,logout,checkingSession}}>{children}</Ctx.Provider>;
}
