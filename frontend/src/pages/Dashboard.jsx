import {useEffect,useState} from 'react'; import api from '../api/axios';
export default function Dashboard(){ const [accs,setAccs]=useState([]); const [txs,setTxs]=useState([]);
 useEffect(()=>{ api.get('/accounts/my').then(r=>setAccs(r.data)); api.get('/transactions').then(r=>setTxs(r.data.slice(0,5))); },[]);
 const total=accs.reduce((s,a)=>s+Number(a.balance),0);
 return <div><div className="stats"><div className="stat"><span>Total Balance</span><h2>৳ {total.toLocaleString()}</h2></div><div className="stat"><span>Accounts</span><h2>{accs.length}</h2></div><div className="stat"><span>Cards</span><h2>{accs.reduce((s,a)=>s+(a.cards?.length||0),0)}</h2></div></div>
 <h3>Recent Transactions</h3><div className="box">{txs.length?txs.map(t=><div key={t.id} className="row"><span>{t.type} - {t.description||''}</span><b>৳ {Number(t.amount).toLocaleString()}</b></div>):<p>No transaction yet</p>}</div></div>; }
