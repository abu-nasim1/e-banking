import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {AuthProvider} from './context/AuthContext';
import Layout from './components/Layout'; import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login'; import Register from './pages/Register'; import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts'; import Transfer from './pages/Transfer'; import Transactions from './pages/Transactions';
import Cards from './pages/Cards'; import Beneficiaries from './pages/Beneficiaries';
import Management from './pages/Management';
import Loans from './pages/Loans';
import EmployeeDashboard from './pages/EmployeeDashboard';
export default function App(){ return <AuthProvider><BrowserRouter><Routes>
 <Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/>
 <Route path="/employee" element={<ProtectedRoute allowedRoles={['EMPLOYEE']} redirectTo="/management"><EmployeeDashboard/></ProtectedRoute>}/>
 <Route path="/management/*" element={<ProtectedRoute allowedRoles={['OWNER','ADMIN','MANAGER']} redirectTo="/"><Management/></ProtectedRoute>}/>
 <Route element={<ProtectedRoute allowedRoles={['USER']} redirectTo="/management"><Layout/></ProtectedRoute>}>
   <Route path="/" element={<Dashboard/>}/><Route path="/accounts" element={<Accounts/>}/>
   <Route path="/transfer" element={<Transfer/>}/><Route path="/transactions" element={<Transactions/>}/>
  <Route path="/loans" element={<Loans/>}/>
   <Route path="/cards" element={<Cards/>}/><Route path="/beneficiaries" element={<Beneficiaries/>}/>
 </Route></Routes></BrowserRouter></AuthProvider>; }
