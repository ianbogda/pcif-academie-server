import React,{useEffect,useMemo,useState}from"react";
import{api,type OrganisationData,type OfnOperation,type PcifProcess}from"./api";

const ringLabels:any={majorFormal:"Rupture majeure avec émargement",majorNoFormal:"Rupture sans émargement",absenceFix:"Absence de rupture à corriger",absenceJustified:"Absence justifiée",supervision:"Contrôle de supervision"};

export function OrganisationPcif({campaignId}:{campaignId:string}){
 const[data,setData]=useState<OrganisationData|null>(null),[view,setView]=useState<"ofn"|"process">("ofn");
 async function load(){setData(await api.organisation(campaignId))}useEffect(()=>{load()},[campaignId]);
 if(!data)return <div className="pcif-loading">Chargement de l’organisation…</div>;
 return <section><div className="org-tabs"><button className={view==="ofn"?"active":""} onClick={()=>setView("ofn")}>Organigramme fonctionnel nominatif</button><button className={view==="process"?"active":""} onClick={()=>setView("process")}>39 procédures & logigrammes</button></div>{view==="ofn"?<Ofn data={data} campaignId={campaignId} reload={load}/>:<Processes data={data} campaignId={campaignId} reload={load}/>}</section>
}

function Ofn({data,campaignId,reload}:any){
 const[domain,setDomain]=useState("TOUS"),[sphere,setSphere]=useState("both"),[actorName,setActorName]=useState(""),[actorRole,setActorRole]=useState("");
 const domains=["TOUS",...Array.from(new Set(data.operations.map((o:any)=>o.category)))];
 let ops=data.operations.filter((o:any)=>(domain==="TOUS"||o.category===domain)&&(sphere==="both"||o.sphere===sphere));
 const covered=new Set(data.assignments.map((a:any)=>a.operation_id)).size;
 const stat=(k:string)=>data.assignments.filter((a:any)=>a[k]).length;
 async function addActor(){if(!actorName.trim())return;await api.createOfnActor(campaignId,{name:actorName,role:actorRole,functionCode:""});setActorName("");setActorRole("");await reload()}
 return <div className="ofn-view"><div className="org-hero"><div><span>ORGANIGRAMME FONCTIONNEL NOMINATIF · FONCTIOP@LE V5.0</span><h2>Qui fait quoi, opération par opération ?</h2><p>181 opérations · 7 domaines · plusieurs intervenants par opération.</p></div><div className="ofn-score"><b>{Math.round(100*covered/181)}%</b><small>couverture</small></div></div>
 <div className="org-kpis">{[[covered,"opérations affectées"],[stat("direct_action"),"actions directes"],[stat("delegation"),"délégations"],[stat("substitution"),"suppléances"],[data.assignments.filter((a:any)=>a.ring).length,"ruptures / supervision"]].map((x:any)=><div><b>{x[0]}</b><span>{x[1]}</span></div>)}</div>
 <section className="org-card"><h3>1. Acteurs</h3><div className="actor-create"><input placeholder="Nom de l'acteur" value={actorName} onChange={e=>setActorName(e.target.value)}/><input placeholder="Fonction / rôle" value={actorRole} onChange={e=>setActorRole(e.target.value)}/><button className="primary-action" onClick={addActor}>Ajouter</button></div><div className="actor-chips">{data.actors.map((a:any)=><span key={a.id}>{a.name}<small>{a.role}</small></span>)}</div></section>
 <section className="org-card"><div className="org-filter"><select value={domain} onChange={e=>setDomain(e.target.value)}>{domains.map((d:any)=><option key={d}>{d}</option>)}</select><button className={sphere==="both"?"active":""} onClick={()=>setSphere("both")}>Les deux</button><button className={sphere==="ordonnateur"?"active ord":""} onClick={()=>setSphere("ordonnateur")}>Ordonnateur</button><button className={sphere==="comptable"?"active cpt":""} onClick={()=>setSphere("comptable")}>Comptable</button></div><h3>2. Opérations</h3><div className="operation-list">{ops.map((o:any)=><Operation key={o.id} o={o} data={data} campaignId={campaignId} reload={reload}/>)}</div></section>
 <section className="org-card"><h3>3. Synthèse ONF</h3><OfnMatrix data={data}/></section></div>
}
function Operation({o,data,campaignId,reload}:any){
 const existing=data.assignments.filter((a:any)=>a.operation_id===o.id);
 const[actor,setActor]=useState(data.actors[0]?.id||"");
 async function add(){if(!actor)return;await api.saveOfnAssignment(campaignId,{operationId:o.id,actorId:actor,directAction:true,delegation:false,substitution:false,ring:null,note:""});await reload()}
 async function toggle(a:any,k:string){await api.saveOfnAssignment(campaignId,{operationId:o.id,actorId:a.actor_id,directAction:k==="direct_action"?!a.direct_action:a.direct_action,delegation:k==="delegation"?!a.delegation:a.delegation,substitution:k==="substitution"?!a.substitution:a.substitution,ring:a.ring||null,note:a.note||""});await reload()}
 async function ring(a:any,v:string){await api.saveOfnAssignment(campaignId,{operationId:o.id,actorId:a.actor_id,directAction:a.direct_action,delegation:a.delegation,substitution:a.substitution,ring:v||null,note:a.note||""});await reload()}
 return <article className={`operation ${o.sphere==="ordonnateur"?"ord":"cpt"}`}><div className="op-title"><b>{o.name}</b><small>{o.category} › {o.subcategory} · {o.sphere}</small></div><div className="op-assign">{existing.map((a:any)=>{const ac=data.actors.find((x:any)=>x.id===a.actor_id);return <div className="assignment-row" key={a.id}><span><b>{ac?.name||"—"}</b><small>{ac?.role}</small></span><div><button className={a.direct_action?"on":""} onClick={()=>toggle(a,"direct_action")}>A</button><button className={a.delegation?"on":""} onClick={()=>toggle(a,"delegation")}>D</button><button className={a.substitution?"on":""} onClick={()=>toggle(a,"substitution")}>S</button></div><select value={a.ring||""} onChange={e=>ring(a,e.target.value)}><option value="">Rupture / supervision —</option>{Object.entries(ringLabels).map(([k,v]:any)=><option key={k} value={k}>{v}</option>)}</select></div>})}<div className="add-assignment"><select value={actor} onChange={e=>setActor(e.target.value)}>{data.actors.map((a:any)=><option key={a.id} value={a.id}>{a.name}</option>)}</select><button onClick={add}>+ intervenant</button></div></div></article>
}
function OfnMatrix({data}:any){return <div className="table-scroll"><table className="ofn-matrix-react"><thead><tr><th>Opération</th><th>Domaine</th><th>Sphère</th><th>Acteur</th><th>A / D / S</th><th>Rupture / supervision</th></tr></thead><tbody>{data.assignments.map((a:any)=>{const o=data.operations.find((x:any)=>x.id===a.operation_id),ac=data.actors.find((x:any)=>x.id===a.actor_id);return <tr key={a.id}><td>{o?.name}</td><td>{o?.category}</td><td>{o?.sphere}</td><td>{ac?.name}<small>{ac?.role}</small></td><td>{a.direct_action?"A ":""}{a.delegation?"D ":""}{a.substitution?"S":""}</td><td>{ringLabels[a.ring]||"—"}</td></tr>})}</tbody></table></div>}

function Processes({data,campaignId,reload}:any){
 const[domain,setDomain]=useState("TOUS"),[selected,setSelected]=useState<PcifProcess|null>(null);
 const domains=["TOUS",...Array.from(new Set(data.processes.map((p:any)=>p.domain)))];
 const list=data.processes.filter((p:any)=>domain==="TOUS"||p.domain===domain);
 return <div className="process-view"><div className="org-hero"><div><span>PROCÉDURES MÉTIERS · 267 CONTRÔLES PCIF</span><h2>39 procédures & logigrammes</h2><p>Explorer les procédures, leurs étapes et les items PCIF qui les sécurisent.</p></div><b className="process-count">39</b></div><div className="process-toolbar"><select value={domain} onChange={e=>setDomain(e.target.value)}>{domains.map((d:any)=><option key={d}>{d}</option>)}</select></div><div className="process-grid">{list.map((p:any)=>{const r=data.reviews.find((x:any)=>x.process_id===p.id);return <button className={`process-card ${r?.priority?"priority":""}`} key={p.id} onClick={()=>setSelected(p)}><span>{p.domain}</span><h3>{p.title}</h3><p>{p.description}</p><div><small>{p.owner}</small><b>{p.questionIds.length} contrôles</b></div></button>})}</div>{selected&&<ProcessModal p={selected} data={data} campaignId={campaignId} close={()=>setSelected(null)} reload={reload}/>}</div>
}
function ProcessModal({p,data,campaignId,close,reload}:any){
 const r=data.reviews.find((x:any)=>x.process_id===p.id)||{priority:false,status:"A_EXAMINER",note:""};
 const[priority,setPriority]=useState(r.priority),[status,setStatus]=useState(r.status),[note,setNote]=useState(r.note);
 async function save(){await api.saveProcessReview(campaignId,p.id,{priority,status,note});await reload();close()}
 return <div className="process-modal"><div className="process-dialog"><header><div><span>{p.domain} · {p.owner}</span><h2>{p.title}</h2><p>{p.description}</p></div><button onClick={close}>×</button></header><Flow steps={p.steps}/><div className="question-links"><b>Contrôles PCIF liés</b><div>{p.questionIds.map((x:string)=><span key={x}>PCIF-{x}</span>)}</div></div><div className="process-review"><label><input type="checkbox" checked={priority} onChange={e=>setPriority(e.target.checked)}/> Procédure prioritaire</label><select value={status} onChange={e=>setStatus(e.target.value)}><option value="A_EXAMINER">À examiner</option><option value="EN_COURS">En cours</option><option value="SECURISE">Sécurisée</option></select><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Écarts au terrain, points de vigilance, décisions…"/></div><footer><button onClick={close}>Fermer</button><button className="primary-action" onClick={save}>Enregistrer</button></footer></div></div>
}
function Flow({steps}:{steps:string[]}){
 const W=900,H=Math.max(180,steps.length*92+70);
 return <svg className="flow-svg" viewBox={`0 0 ${W} ${H}`}>{steps.map((s,i)=>{const y=35+i*92,isFirst=i===0,isLast=i===steps.length-1;return <g key={i}>{i>0&&<><line x1="450" y1={y-32} x2="450" y2={y-8} stroke="#6d7cff" strokeWidth="2"/><polygon points={`445,${y-12} 455,${y-12} 450,${y-5}`} fill="#6d7cff"/></>}<rect x="195" y={y} width="510" height="54" rx={isFirst||isLast?27:9} fill={isFirst?"#14372d":isLast?"#26335d":"#0b1a2a"} stroke={isFirst?"#23c483":isLast?"#6d7cff":"#29415d"} strokeWidth="2"/><text x="450" y={y+32} textAnchor="middle" fill="#e8eef6" fontSize="15">{s.length>68?s.slice(0,65)+"…":s}</text></g>})}</svg>
}
