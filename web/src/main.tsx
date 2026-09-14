import { PilotagePcif } from "./PilotagePcif";
import React,{useEffect,useMemo,useState} from "react";
import{createRoot}from"react-dom/client";
import{api,clearToken,getToken,setToken,type AdminUser,type Campaign,type Establishment,type Me,type Question}from"./api";
import"./styles.css";

type View={kind:"home"}|{kind:"campaign";campaign:Campaign;establishment:Establishment}|{kind:"admin"};
const demo=[["AC","ac@example.test","ChangeMe-AC-2026!"],["FP","fp@example.test","ChangeMe-FP-2026!"],["CE","ce@example.test","ChangeMe-CE-2026!"],["SGE","sge@example.test","ChangeMe-SGE-2026!"],["Admin","admin@example.test","ChangeMe-ADMIN-2026!"]] as const;

function Logo(){return <div className="pcif-logo"><div className="logo-shield">✓</div><div><b>PCIF Académie</b><small>Pilotage du contrôle interne financier</small></div></div>}
function App(){
 const[me,setMe]=useState<Me|null>(null),[view,setView]=useState<View>({kind:"home"}),[busy,setBusy]=useState(!!getToken());
 const[active,setActive]=useState<Establishment|null>(null),[ets,setEts]=useState<Establishment[]>([]);
 async function session(){setBusy(true);try{const m=await api.me(),e=await api.establishments();setMe(m);setEts(e);setActive(e[0]??null)}catch{clearToken();setMe(null)}finally{setBusy(false)}}
 useEffect(()=>{getToken()?session():setBusy(false)},[]);
 if(busy)return <div className="splash"><Logo/><span>Chargement…</span></div>;
 if(!me)return <Login onLogin={session}/>;
 const logout=()=>{clearToken();setMe(null);setView({kind:"home"})};
 return <div className="pcif-app">
   <aside className="sidebar">
    <Logo/>
    <div className="profile"><small>Utilisateur connecté</small><strong>{me.user.displayName}</strong><span>{me.user.email}</span></div>
    <nav>
      <button className={view.kind==="home"?"active":""} onClick={()=>setView({kind:"home"})}>⌂ Tableau de bord</button>
      {me.user.isPlatformAdmin&&<button className={view.kind==="admin"?"active":""} onClick={()=>setView({kind:"admin"})}>⚙ Utilisateurs</button>}
    </nav>
    <div className="sidebar-foot"><button onClick={logout}>Déconnexion</button></div>
   </aside>
   <div className="workspace">
    <header className="topbar">
      <div className="context"><span>Établissement actif</span>
       <select value={active?.id??""} onChange={e=>{const x=ets.find(v=>v.id===e.target.value)||null;setActive(x);setView({kind:"home"})}} disabled={ets.length<=1}>
        {ets.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
       </select>
       {active&&<small>{active.uai} · {active.kind}</small>}
      </div>
      <div className="rolechips">{me.agencies.map(a=><span key={a.id}>{roleLabel(a.role)}</span>)}{me.establishments.filter(x=>x.id===active?.id).map(x=><span key={x.role}>{roleLabel(x.role)}</span>)}</div>
    </header>
    <main>
      {view.kind==="home"&&<Dashboard establishment={active} onOpen={(c,e)=>setView({kind:"campaign",campaign:c,establishment:e})}/>}
      {view.kind==="campaign"&&<CampaignView me={me} campaign={view.campaign} establishment={view.establishment} onBack={()=>setView({kind:"home"})}/>}
      {view.kind==="admin"&&<AdminUsers establishments={ets}/>}
    </main>
   </div>
 </div>
}
function Login({onLogin}:{onLogin:()=>Promise<void>}){
 const[email,setEmail]=useState("ac@example.test"),[password,setPassword]=useState("ChangeMe-AC-2026!"),[err,setErr]=useState("");
 async function go(e:React.FormEvent){e.preventDefault();try{const r=await api.login(email,password);setToken(r.accessToken);await onLogin()}catch{setErr("Identifiants incorrects ou compte indisponible.")}}
 return <div className="login"><section><Logo/><h1>Bienvenue</h1><p>Retrouvez PCIF Académie dans son environnement métier, désormais collaboratif et multi‑établissements.</p><form onSubmit={go}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Mot de passe<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{err&&<div className="error">{err}</div>}<button className="primary">Se connecter</button></form></section><aside><b>Profils de démonstration</b>{demo.map(([l,m,p])=><button key={m} onClick={()=>{setEmail(m);setPassword(p)}}><span>{l}</span><small>{m}</small></button>)}</aside></div>
}
function Dashboard({establishment,onOpen}:{establishment:Establishment|null;onOpen:(c:Campaign,e:Establishment)=>void}){
 const[camps,setCamps]=useState<Campaign[]>([]);useEffect(()=>{establishment?api.campaigns(establishment.id).then(setCamps):setCamps([])},[establishment?.id]);
 if(!establishment)return <Empty text="Aucun établissement accessible."/>;
 return <><div className="hero"><div><small>PCIF Académie</small><h1>{establishment.name}</h1><p>Diagnostic, maîtrise des risques et plan d’action de l’établissement.</p></div><div className="pill">{establishment.uai}</div></div>
 <div className="tiles"><div><b>{camps.length}</b><span>Campagne(s)</span></div><div><b>{establishment.kind||"EPLE"}</b><span>Type</span></div><div><b>Multi</b><span>Travail collaboratif</span></div></div>
 <section className="panel"><h2>Campagnes PCIF</h2>{camps.map(c=><button className="campaign" key={c.id} onClick={()=>onOpen(c,establishment)}><div><span className="status">{c.status}</span><b>{c.label}</b><small>Référentiel {c.repository_version}</small></div><i>→</i></button>)}</section></>
}
function CampaignView({me,campaign,establishment,onBack}:{me:Me;campaign:Campaign;establishment:Establishment;onBack:()=>void}){
 const[questions,setQuestions]=useState<Question[]>([]),[domain,setDomain]=useState("TOUS"),[scope,setScope]=useState("TOUS");
 useEffect(()=>{api.questions(campaign.id).then(setQuestions)},[campaign.id]);
 const roles=me.establishments.filter(x=>x.id===establishment.id).map(x=>x.role),agency=me.agencies.map(x=>x.role),admin=!!me.user.isPlatformAdmin;
 const canO=admin||roles.some(r=>["HEAD","SECRETARY_GENERAL","CONTRIBUTOR"].includes(r));
 const canC=admin||roles.some(r=>["AGENCY_ACCOUNTANT","AGENCY_DEPUTY"].includes(r))||agency.some(r=>["AGENCY_ACCOUNTANT","AGENCY_DEPUTY"].includes(r));
 const domains=["TOUS",...Array.from(new Set(questions.map(q=>q.domain)))];
 const filtered=questions.filter(q=>(domain==="TOUS"||q.domain===domain)&&(scope==="TOUS"||q.responsibility===scope));
 return <><button className="back" onClick={onBack}>← Retour</button><div className="hero"><div><small>{campaign.status}</small><h1>{campaign.label}</h1><p>{establishment.name} · travail simultané ordonnateur / comptable.</p></div></div>
 <div className="scopebar"><select value={domain} onChange={e=>setDomain(e.target.value)}>{domains.map(d=><option key={d}>{d}</option>)}</select><button className={scope==="TOUS"?"active":""} onClick={()=>setScope("TOUS")}>Tous</button><button className={scope==="ORDONNATEUR"?"active o":""} onClick={()=>setScope("ORDONNATEUR")}>Ordonnateur</button><button className={scope==="COMPTABLE"?"active c":""} onClick={()=>setScope("COMPTABLE")}>Comptable</button><button className={scope==="MIXTE"?"active":""} onClick={()=>setScope("MIXTE")}>Mixte</button></div>
 <div className="questions">{filtered.map(q=><QuestionCard key={q.id} q={q} campaignId={campaign.id} canO={canO} canC={canC} onUpdate={x=>setQuestions(v=>v.map(a=>a.id===x.id?x:a))}/>)}</div></>
}
function QuestionCard({q,campaignId,canO,canC,onUpdate}:{q:Question;campaignId:string;canO:boolean;canC:boolean;onUpdate:(q:Question)=>void}){
 const spheres=q.responsibility==="MIXTE"?["ORDONNATEUR","COMPTABLE","SYNTHESE"] as const:[q.responsibility] as any;
 return <article className="questioncard"><div className="meta"><span>{q.domain}</span>{q.category&&<span>{q.category}</span>}<span className={q.responsibility==="ORDONNATEUR"?"o":q.responsibility==="COMPTABLE"?"c":""}>{q.responsibility}</span><span>★ {q.stars}/3</span><span>Poids {q.weight}</span>{q.is_key&&<span>◆ POINT CLÉ</span>}</div><h3>{q.label}</h3>{q.risk_label&&<p style={{color:"var(--muted)",marginTop:"-6px"}}>Risque : {q.risk_label}</p>}<div className="answergrid">{spheres.map((s:any)=><Answer key={s} q={q} sphere={s} campaignId={campaignId} editable={s==="ORDONNATEUR"?canO:s==="COMPTABLE"?canC:(canO||canC)} onUpdate={onUpdate}/>)}</div></article>
}
function Answer({q,sphere,campaignId,editable,onUpdate}:{q:Question;sphere:"ORDONNATEUR"|"COMPTABLE"|"SYNTHESE";campaignId:string;editable:boolean;onUpdate:(q:Question)=>void}){
 const ex=q.answers.find(a=>a.sphere===sphere);const[value,setValue]=useState<number|null>(ex?.value??null),[comment,setComment]=useState(ex?.comment??""),[state,setState]=useState("");
 async function save(){try{setState("Enregistrement…");const r=await api.saveAnswer(campaignId,q.id,{sphere,value,comment,version:ex?.version??0});onUpdate({...q,answers:[...q.answers.filter(a=>a.sphere!==sphere),{sphere,value:r.value,comment:r.comment,version:r.version,updatedAt:r.updated_at,updatedBy:""}]});setState("Enregistré")}catch(e:any){setState(e.status===409?"Conflit de version":"Erreur")}}
 return <div className="answerbox"><header><b>{sphereLabel(sphere)}</b>{!editable&&<small>Lecture seule</small>}</header><div className="scores">{[0,1,2,3].map(n=><button key={n} disabled={!editable} className={value===n?"active":""} onClick={()=>setValue(n)}>{n}</button>)}</div><textarea readOnly={!editable} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Observation / preuve / action à prévoir…"/><footer><small>{state||ex?.updatedBy||""}</small>{editable&&<button className="primary" onClick={save}>Enregistrer</button>}</footer></div>
}
function AdminUsers({establishments}:{establishments:Establishment[]}){
 const[users,setUsers]=useState<AdminUser[]>([]),[roles,setRoles]=useState<any[]>([]),[editing,setEditing]=useState<AdminUser|null>(null),[creating,setCreating]=useState(false),[msg,setMsg]=useState("");
 async function load(){setUsers(await api.adminUsers());setRoles(await api.adminRoles())} useEffect(()=>{load()},[]);
 async function del(u:AdminUser){if(!confirm(`Supprimer ${u.display_name} ? Cette suppression est logique et conserve l'audit.`))return;await api.deleteUser(u.id);await load()}
 async function suspend(u:AdminUser){await api.updateUser(u.id,{email:u.email,displayName:u.display_name,active:!u.active,assignments:u.assignments.map(a=>({establishmentId:a.establishmentId,roleCode:a.roleCode}))});await load()}
 return <><div className="hero"><div><small>Administration</small><h1>Utilisateurs</h1><p>Un utilisateur possède une adresse email valide et au moins un rattachement établissement + rôle.</p></div><button className="primary" onClick={()=>setCreating(true)}>+ Nouvel utilisateur</button></div>
 {msg&&<div className="notice">{msg}</div>}<section className="panel"><table className="users"><thead><tr><th>Utilisateur</th><th>Statut</th><th>Rattachements</th><th></th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td><b>{u.display_name}</b><small>{u.email}{u.is_platform_admin?" · ADMIN":""}</small></td><td><span className={u.active?"ok":"off"}>{u.active?"Actif":"Suspendu"}</span></td><td>{u.assignments.map((a,i)=><span className="assignment" key={i}>{a.establishmentName} · {roleLabel(a.roleCode)}</span>)}</td><td className="actions"><button onClick={()=>setEditing(u)}>Modifier</button>{!u.is_platform_admin&&<><button onClick={()=>suspend(u)}>{u.active?"Suspendre":"Réactiver"}</button><button className="danger" onClick={()=>del(u)}>Supprimer</button></>}</td></tr>)}</tbody></table></section>
 {(editing||creating)&&<UserModal user={editing} establishments={establishments} roles={roles} onClose={()=>{setEditing(null);setCreating(false)}} onSaved={async(temp)=>{setEditing(null);setCreating(false);await load();if(temp)setMsg(`Mot de passe temporaire : ${temp}`)}}/>}</>
}
function UserModal({user,establishments,roles,onClose,onSaved}:{user:AdminUser|null;establishments:Establishment[];roles:any[];onClose:()=>void;onSaved:(temp?:string)=>void}){
 const[email,setEmail]=useState(user?.email??""),[name,setName]=useState(user?.display_name??""),[active,setActive]=useState(user?.active??true),[assign,setAssign]=useState<any[]>(user?.assignments.map(a=>({establishmentId:a.establishmentId,roleCode:a.roleCode}))??[{establishmentId:establishments[0]?.id??"",roleCode:"SECRETARY_GENERAL"}]),[err,setErr]=useState("");
 function patch(i:number,k:string,v:string){setAssign(a=>a.map((x,j)=>j===i?{...x,[k]:v}:x))}
 async function save(){try{if(!email.includes("@"))throw new Error("Email invalide");const payload={email,displayName:name,active,assignments:assign};if(user)await api.updateUser(user.id,payload);else{const r=await api.createUser(payload);await onSaved(r.temporaryPassword);return}await onSaved()}catch(e:any){setErr(e.message||"Erreur")}}
 return <div className="modal"><div><header><h2>{user?"Modifier":"Créer"} un utilisateur</h2><button onClick={onClose}>×</button></header><label>Nom<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>{user&&<label className="check"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/> Compte actif</label>}<h3>Établissements et rôles</h3>{assign.map((a,i)=><div className="assignmentrow" key={i}><select value={a.establishmentId} onChange={e=>patch(i,"establishmentId",e.target.value)}>{establishments.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><select value={a.roleCode} onChange={e=>patch(i,"roleCode",e.target.value)}>{roles.map(r=><option key={r.code} value={r.code}>{r.label}</option>)}</select>{assign.length>1&&<button onClick={()=>setAssign(x=>x.filter((_,j)=>j!==i))}>−</button>}</div>)}<button className="link" onClick={()=>setAssign(x=>[...x,{establishmentId:establishments[0]?.id??"",roleCode:"READER"}])}>+ Ajouter un établissement</button>{err&&<div className="error">{err}</div>}<footer><button onClick={onClose}>Annuler</button><button className="primary" onClick={save}>Enregistrer</button></footer></div></div>
}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}function sphereLabel(s:string){return s==="ORDONNATEUR"?"Ordonnateur":s==="COMPTABLE"?"Comptable":"Synthèse"}function roleLabel(r:string){return({AGENCY_ACCOUNTANT:"Agent comptable",AGENCY_DEPUTY:"Fondé de pouvoir",HEAD:"Chef d’établissement",SECRETARY_GENERAL:"Secrétaire général",CONTRIBUTOR:"Contributeur",READER:"Lecteur",AUDITOR:"Auditeur",PLATFORM_ADMIN:"Administrateur"} as any)[r]||r}
createRoot(document.getElementById("root")!).render(<App/>);
