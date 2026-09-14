import React,{useEffect,useMemo,useState}from"react";
import{api,type Campaign,type Establishment,type Me,type PcifAction,type PilotageData,type PilotageQuestion}from"./api";

const DOMAINS=["Organisation","Exécution budgétaire","Comptabilité Générale","Régies","Contentieux","Patrimoine stocks Domaine"];
const BADGE_LABELS=["Découverte","Sensibilisation","Initiation","Pratique","Confirmé","Maîtrise"];
const workshops=[
 ["Organisation & acteurs","Construire l’ONF réel et identifier délégations, suppléances et contrôles."],
 ["Processus & procédures","Décrire les circuits réels et sélectionner les procédures à sécuriser."],
 ["Risques & maîtrise","Objectiver les risques et réaliser le diagnostic PCIF."],
 ["Plan d’action","Prioriser, attribuer, échéancer et définir les preuves."]
] as const;

function factor(v?:number|null){return v===3?0:v===2?.5:v===1?1:null}
function answerLabel(v?:number|null){return v===3?"OUI":v===2?"PARTIEL":v===1?"NON":v===0?"N/A":"—"}
function residual(q:PilotageQuestion){const f=factor(q.value);return f===null?0:Number(q.weight||0)*f}
function sev(n:number){return n>=6?["crit","Critique"]:n>=4?["high","Élevé"]:n>=2?["med","Modéré"]:["low","Faible"]}

export function PilotagePcif({campaign,establishment,me,onBack}:{campaign:Campaign;establishment:Establishment;me:Me;onBack:()=>void}){
 const[data,setData]=useState<PilotageData|null>(null),[tab,setTab]=useState<"dashboard"|"diagnostic"|"risks"|"annual"|"workshops">("dashboard");
 const[scope,setScope]=useState<"both"|"O"|"C">("both"),[mode,setMode]=useState<"all"|"sprint"|"critical"|"unanswered">("all"),[domain,setDomain]=useState("TOUS"),[idx,setIdx]=useState(0);
 async function load(){setData(await api.pilotage(campaign.id))}
 useEffect(()=>{load()},[campaign.id]);
 if(!data)return <div className="pcif-loading">Chargement du pilotage…</div>;

 const byQuestion=new Map<string,PilotageQuestion>();
 for(const row of data.questions){
   const key=row.id+"::"+(row.sphere||row.responsibility);
   byQuestion.set(key,row);
 }
 // Prefer relevant sphere response for display; keep one row per question
 const qmap=new Map<string,PilotageQuestion>();
 for(const row of data.questions){
   const ex=qmap.get(row.id);
   if(!ex || (!ex.sphere && row.sphere) || row.sphere==="SYNTHESE") qmap.set(row.id,row);
 }
 let qs=[...qmap.values()];
 if(scope==="O")qs=qs.filter(q=>q.responsibility==="ORDONNATEUR"||q.responsibility==="MIXTE");
 if(scope==="C")qs=qs.filter(q=>q.responsibility==="COMPTABLE"||q.responsibility==="MIXTE");

 const answered=qs.filter(q=>q.value!==undefined&&q.value!==null).length;
 const critical=qs.filter(q=>(q.value===1||q.value===2)&&Number(q.weight)>=6).length;
 const weighted=qs.reduce((s,q)=>s+(factor(q.value)??0)*Number(q.weight||0),0);
 const max=qs.filter(q=>factor(q.value)!==null).reduce((s,q)=>s+Number(q.weight||0),0);
 const mastery=max?Math.round(100*(1-weighted/max)):100;
 const coverage=qs.length?Math.round(100*answered/qs.length):0;

 const metrics=DOMAINS.map(d=>{
   const dqs=qs.filter(q=>q.domain===d),done=dqs.filter(q=>q.value!==undefined&&q.value!==null).length;
   const dw=dqs.reduce((s,q)=>s+(factor(q.value)??0)*Number(q.weight||0),0);
   const dm=dqs.filter(q=>factor(q.value)!==null).reduce((s,q)=>s+Number(q.weight||0),0);
   const m=dm?Math.round(100*(1-dw/dm)):100,c=dqs.length?Math.round(100*done/dqs.length):0,e=Math.round(c*m/100);
   return{domain:d,total:dqs.length,done,coverage:c,mastery:m,effective:e,level:e===100?5:Math.min(5,Math.floor(e/20))}
 });

 return <div className="pilot-shell">
  <div className="pilot-head">
   <div><button className="text-btn" onClick={onBack}>← Établissements</button><div className="pilot-kicker">PCIF ACADÉMIE · {establishment.uai}</div><h1>Pilotage du PCIF</h1><p>{establishment.name} · {campaign.label}</p></div>
   <div className="pilot-scope"><button className={scope==="both"?"active":""} onClick={()=>setScope("both")}>Les deux sphères</button><button className={scope==="O"?"active ord":""} onClick={()=>setScope("O")}>Ordonnateur</button><button className={scope==="C"?"active cpt":""} onClick={()=>setScope("C")}>Agence comptable</button></div>
  </div>
  <nav className="pilot-tabs">
   <button className={tab==="dashboard"?"active":""} onClick={()=>setTab("dashboard")}>Tableau de bord</button>
   <button className={tab==="diagnostic"?"active":""} onClick={()=>setTab("diagnostic")}>Diagnostic</button>
   <button className={tab==="risks"?"active":""} onClick={()=>setTab("risks")}>Risques</button>
   <button className={tab==="annual"?"active":""} onClick={()=>setTab("annual")}>Programme annuel</button>
   <button className={tab==="workshops"?"active":""} onClick={()=>setTab("workshops")}>Ateliers 4 × 60</button>
  </nav>
  {tab==="dashboard"&&<Dashboard qs={qs} metrics={metrics} answered={answered} critical={critical} mastery={mastery} coverage={coverage} actions={data.actions} workshops={data.workshops} go={setTab}/>}
  {tab==="diagnostic"&&<Diagnostic qs={qs} campaignId={campaign.id} mode={mode} setMode={setMode} domain={domain} setDomain={setDomain} idx={idx} setIdx={setIdx} reload={load}/>}
  {tab==="risks"&&<RiskView qs={qs}/>}
  {tab==="annual"&&<Annual data={data} campaignId={campaign.id} reload={load}/>}
  {tab==="workshops"&&<Workshops data={data} campaignId={campaign.id} reload={load}/>}
 </div>
}

function Dashboard({qs,metrics,answered,critical,mastery,coverage,actions,workshops,go}:any){
 const completed=workshops.filter((w:any)=>w.completed).length;
 return <div className="pilot-dashboard">
  <section className="journey"><h2>Cycle de vie du PCIF</h2><p>Prendre en main, construire le PCIF, puis le faire vivre et l’approfondir.</p><div className="journey-grid">
   <Stage n="1" title="Prendre en main" value={`${completed} / 4`} text="Ateliers collectifs de lancement." onClick={()=>go("workshops")}/>
   <Stage n="2" title="Construire le PCIF" value={`${answered} / ${qs.length}`} text="Diagnostic et priorisation des risques." onClick={()=>go("diagnostic")}/>
   <Stage n="3" title="Faire vivre" value={`${actions.length}`} text="Actions programmées et suivies." onClick={()=>go("annual")}/>
  </div></section>
  <div className="kpis">
   <Kpi value={`${answered}/${qs.length}`} label="Réponses" foot={`${coverage}% de couverture`}/>
   <Kpi value={`${mastery}%`} label="Maîtrise" foot="Pondérée par les risques"/>
   <Kpi value={critical} label="Risques ≥ 6" foot="Non / Partiel à traiter"/>
   <Kpi value={actions.length} label="Actions" foot="Programme annuel"/>
   <Kpi value={`${completed}/4`} label="Ateliers" foot="Parcours collectif"/>
  </div>
  <div className="analytics">
   <section className="dash-card"><h3>Progression par domaine</h3><div className="domain-list">{metrics.map((m:any)=><div key={m.domain}><div className="domain-head"><span>{m.domain}</span><b>{m.done}/{m.total} · {m.mastery}%</b></div><div className="track"><i style={{width:`${m.coverage}%`}}/></div></div>)}</div></section>
   <section className="dash-card"><h3>Radar de maîtrise <span>0–5</span></h3><Radar metrics={metrics}/></section>
   <section className="dash-card"><h3>Matrice des risques</h3><RiskMatrix qs={qs}/><button className="subtle" onClick={()=>go("risks")}>Voir la cartographie détaillée →</button></section>
  </div>
  <div className="dash-card badges-card"><h3>Badges de maîtrise</h3><div className="badge-grid">{metrics.map((m:any)=><div className="mastery-badge" key={m.domain}><div><b>{m.domain}</b><small>{BADGE_LABELS[m.level]}</small></div><strong>{m.level}/5</strong><div className="badge-track"><i style={{width:`${m.level*20}%`}}/></div></div>)}</div></div>
 </div>
}
function Stage({n,title,value,text,onClick}:any){return <button className="stage" onClick={onClick}><span>{n}</span><strong>{value}</strong><h4>{title}</h4><p>{text}</p></button>}
function Kpi({value,label,foot}:any){return <div className="kpi-dark"><strong>{value}</strong><span>{label}</span><small>{foot}</small></div>}

function Radar({metrics}:{metrics:any[]}){
 const cx=160,cy=145,R=105,n=6;
 const pts=metrics.map((m,i)=>{const a=-Math.PI/2+i*2*Math.PI/n,r=R*(m.level/5);return`${cx+Math.cos(a)*r},${cy+Math.sin(a)*r}`}).join(" ");
 return <svg className="radar-svg" viewBox="0 0 320 300">{[1,2,3,4,5].map(r=><polygon key={r} points={Array.from({length:n},(_,i)=>{const a=-Math.PI/2+i*2*Math.PI/n;return`${cx+Math.cos(a)*R*r/5},${cy+Math.sin(a)*R*r/5}`}).join(" ")} fill="none" stroke="#20364e"/>)}{metrics.map((m,i)=>{const a=-Math.PI/2+i*2*Math.PI/n;return <line key={i} x1={cx} y1={cy} x2={cx+Math.cos(a)*R} y2={cy+Math.sin(a)*R} stroke="#20364e"/>})}<polygon points={pts} fill="#58a6ff33" stroke="#58a6ff" strokeWidth="2"/>{metrics.map((m,i)=>{const a=-Math.PI/2+i*2*Math.PI/n;const x=cx+Math.cos(a)*(R+28),y=cy+Math.sin(a)*(R+22);return <text key={m.domain} x={x} y={y} textAnchor="middle" fill="#91a4ba" fontSize="9">{m.domain.replace("Patrimoine stocks Domaine","Patrimoine").replace("Comptabilité Générale","Compta. gén.")}</text>})}</svg>
}
function RiskMatrix({qs}:{qs:PilotageQuestion[]}){
 const cells:any={};for(let g=1;g<=3;g++)for(let o=1;o<=3;o++)cells[`${g}-${o}`]=[];
 qs.filter(q=>q.value===1||q.value===2).forEach(q=>cells[`${q.pcif_p||1}-${q.pcif_i||1}`]?.push(q));
 return <div className="risk-matrix"><div className="axis">G \ O</div>{[1,2,3].map(o=><div className="axis" key={"h"+o}>{o}</div>)}{[3,2,1].flatMap(g=>[<div className="axis" key={"g"+g}>G{g}</div>,...[1,2,3].map(o=>{const score=g*o,c=cells[`${g}-${o}`]?.length||0;return <div className={`risk-cell ${score>=6?"critical":score>=4?"high":score>=2?"med":"low"}`} key={`${g}-${o}`}><b>{c}</b><small>score {score}/9</small></div>})])}</div>
}
function Diagnostic({qs,campaignId,mode,setMode,domain,setDomain,idx,setIdx,reload}:any){
 let list=domain==="TOUS"?qs:qs.filter((q:PilotageQuestion)=>q.domain===domain);
 if(mode==="critical")list=list.filter((q:PilotageQuestion)=>(q.value===1||q.value===2)&&Number(q.weight)>=6);
 if(mode==="unanswered")list=list.filter((q:PilotageQuestion)=>q.value===undefined||q.value===null);
 if(mode==="sprint")list=list.slice(0,20);
 const q=list[Math.min(idx,Math.max(0,list.length-1))];
 async function ans(v:number){if(!q)return;const sphere=q.responsibility==="COMPTABLE"?"COMPTABLE":"ORDONNATEUR";await api.saveAnswer(campaignId,q.id,{sphere,value:v,comment:q.comment||"",version:q.version||0});await reload();setIdx((x:number)=>Math.min(x+1,Math.max(0,list.length-1)))}
 return <section className="diagnostic-view"><div className="diag-toolbar"><div>{["all","sprint","critical","unanswered"].map(m=><button key={m} className={mode===m?"active":""} onClick={()=>{setMode(m);setIdx(0)}}>{m==="all"?"Parcours complet":m==="sprint"?"Sprint 20":m==="critical"?"Risques ≥ 6":"Non répondues"}</button>)}</div><select value={domain} onChange={e=>{setDomain(e.target.value);setIdx(0)}}><option>TOUS</option>{DOMAINS.map(d=><option key={d}>{d}</option>)}</select></div>
 {!q?<div className="empty-dark">Aucune question dans ce filtre.</div>:<article className="challenge"><div className="challenge-progress"><span>Défi {Math.min(idx+1,list.length)} / {list.length}</span><span>{Math.round(100*Math.min(idx+1,list.length)/Math.max(1,list.length))}%</span></div><div className="challenge-bar"><i style={{width:`${100*Math.min(idx+1,list.length)/Math.max(1,list.length)}%`}}/></div><div className="challenge-card"><div className="chips"><span>{q.domain}</span><span>{q.category}</span><span>{q.responsibility}</span><span>Risque {q.weight}/9</span>{q.is_key&&<span>◆ Point clé</span>}</div><h2>{q.label}</h2><p className="risk-text"><b>Risque :</b> {q.risk_label||"—"}</p><div className="semantic-answers"><button className="yes" onClick={()=>ans(3)}>Oui</button><button className="partial" onClick={()=>ans(2)}>Partiel</button><button className="no" onClick={()=>ans(1)}>Non</button><button onClick={()=>ans(0)}>N/A</button></div><textarea value={q.comment||""} readOnly placeholder="Observation / preuve…"/><div className="diag-nav"><button onClick={()=>setIdx((x:number)=>Math.max(0,x-1))}>← Précédent</button><button onClick={()=>setIdx((x:number)=>Math.min(list.length-1,x+1))}>Suivant →</button></div></div></article>}
 </section>
}
function RiskView({qs}:{qs:PilotageQuestion[]}){
 const rr=qs.filter(q=>q.value===1||q.value===2).map(q=>({...q,residual:residual(q)})).sort((a,b)=>b.residual-a.residual);
 return <section className="risk-view"><div className="section-title"><div><h2>Cartographie détaillée des risques</h2><p>Réponses « Partiel » ou « Non », classées par risque résiduel.</p></div></div><div className="risk-layout"><div className="dash-card"><RiskMatrix qs={qs}/></div><div className="dash-card"><table className="risk-table"><thead><tr><th>Priorité</th><th>Domaine</th><th>Risque</th><th>Brut</th><th>Réponse</th><th>Résiduel</th></tr></thead><tbody>{rr.map(q=>{const sv=sev(q.residual);return <tr key={q.id}><td className={sv[0]}>{sv[1]}</td><td>{q.domain}</td><td>{q.risk_label}</td><td>{q.weight}/9</td><td>{answerLabel(q.value)}</td><td>{q.residual}</td></tr>})}</tbody></table></div></div></section>
}
function Annual({data,campaignId,reload}:{data:PilotageData;campaignId:string;reload:()=>Promise<void>}){
 const qmap=new Map(data.questions.map(q=>[q.id,q]));
 const risks=[...new Map(data.questions.filter(q=>(q.value===1||q.value===2)&&q.weight>=6).map(q=>[q.id,q])).values()];
 async function create(q:PilotageQuestion){const r=residual(q);await api.createAction(campaignId,{questionId:q.id,sphere:q.responsibility==="COMPTABLE"?"COMPTABLE":"ORDONNATEUR",actionText:`Traiter le risque : ${q.risk_label||q.label}`,priority:r>=6?"P2":"P3",period:"Trimestre",actor:q.responsibility==="COMPTABLE"?"Agent comptable":"Secrétaire général",status:"A_LANCER",note:""});await reload()}
 async function patch(a:PcifAction,k:string,v:any){await api.updateAction(campaignId,a.id,{[k]:v});await reload()}
 return <section><div className="section-title"><div><h2>Programme annuel de maîtrise</h2><p>Actions issues des risques prioritaires, attribuées et échéancées.</p></div></div><div className="annual-summary"><span><b>{data.actions.length}</b> actions</span><span><b>{data.actions.filter(a=>a.priority==="P1").length}</b> P1</span><span><b>{data.actions.filter(a=>a.status==="REALISEE").length}</b> réalisées</span></div><div className="annual-grid">{risks.map(q=>{const action=data.actions.find(a=>a.question_id===q.id);return <article className={`annual-card ${action?"selected":""}`} key={q.id}><div className="annual-head"><div><b>{q.category}</b><small>{q.domain} · {answerLabel(q.value)} · résiduel {residual(q)}</small></div><span className={sev(residual(q))[0]}>{sev(residual(q))[1]}</span></div><p>{q.risk_label}</p>{!action?<button className="primary-action" onClick={()=>create(q)}>+ Retenir une action</button>:<div className="action-form"><textarea value={action.action_text} onChange={e=>patch(action,"actionText",e.target.value)}/><div className="action-fields"><select value={action.priority} onChange={e=>patch(action,"priority",e.target.value)}>{["P1","P2","P3","P4"].map(x=><option key={x}>{x}</option>)}</select><input placeholder="Pilote" value={action.actor||""} onChange={e=>patch(action,"actor",e.target.value)}/><input type="date" value={action.target_date||""} onChange={e=>patch(action,"targetDate",e.target.value)}/><select value={action.status} onChange={e=>patch(action,"status",e.target.value)}><option value="A_LANCER">À lancer</option><option value="PREPARATION">Préparation</option><option value="EN_COURS">En cours</option><option value="REALISEE">Réalisée</option></select></div></div>}</article>})}</div></section>
}
function Workshops({data,campaignId,reload}:{data:PilotageData;campaignId:string;reload:()=>Promise<void>}){
 async function save(no:number,completed:boolean,notes:string){await api.saveWorkshop(campaignId,no,{completed,notes});await reload()}
 return <section><div className="section-title"><div><h2>Ateliers PCIF · 4 × 60 minutes</h2><p>Du terrain vers le référentiel : chaque atelier produit une brique validée.</p></div></div><div className="workshop-grid">{workshops.map((w,i)=>{const no=i+1,s=data.workshops.find(x=>x.workshop_no===no),done=!!s?.completed;return <article className={`workshop-card ${done?"done":""}`} key={no}><span className="workshop-no">{no}</span><h3>{w[0]}</h3><p>{w[1]}</p><textarea defaultValue={s?.notes||""} id={`ws-${no}`} placeholder="Notes et livrables de l’atelier…"/><button onClick={()=>save(no,!done,(document.getElementById(`ws-${no}`) as HTMLTextAreaElement).value)}>{done?"✓ Atelier validé":"Valider l’atelier"}</button></article>})}</div></section>
}
