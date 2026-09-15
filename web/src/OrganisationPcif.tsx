import React,{useEffect,useMemo,useState}from"react";
import{api,type OrganisationData,type PcifProcess}from"./api";

const ringLabels:any={majorFormal:"Rupture majeure avec émargement",majorNoFormal:"Rupture sans émargement",absenceFix:"Absence de rupture à corriger",absenceJustified:"Absence justifiée",supervision:"Contrôle de supervision"};

export function OrganisationPcif({campaignId}:{campaignId:string}){
 const[data,setData]=useState<OrganisationData|null>(null),[view,setView]=useState<"ofn"|"process">("ofn");
 async function load(){setData(await api.organisation(campaignId))}useEffect(()=>{load()},[campaignId]);
 if(!data)return <div className="pcif-loading">Chargement de l’organisation…</div>;
 return <section><div className="org-tabs"><button className={view==="ofn"?"active":""} onClick={()=>setView("ofn")}>Atelier 1 · Construire l’ONF</button><button className={view==="process"?"active":""} onClick={()=>setView("process")}>39 procédures & logigrammes</button></div>{view==="ofn"?<OfnBuilder data={data} campaignId={campaignId} reload={load}/>:<Processes data={data} campaignId={campaignId} reload={load}/>}</section>
}

function OfnBuilder({data,campaignId,reload}:any){
 const[step,setStep]=useState(1),[domain,setDomain]=useState("TOUS"),[processFilter,setProcessFilter]=useState("TOUS"),[search,setSearch]=useState(""),[sphere,setSphere]=useState("both"),[incompleteOnly,setIncompleteOnly]=useState(false);
 const[actorName,setActorName]=useState(""),[actorRole,setActorRole]=useState(""),[actorSphere,setActorSphere]=useState("ORDONNATEUR"),[service,setService]=useState("");
 const[checks,setChecks]=useState<any[]>([]);
 const domains=["TOUS",...Array.from(new Set(data.operations.map((o:any)=>o.category)))];
 const processes=["TOUS",...Array.from(new Set(data.operations.filter((o:any)=>domain==="TOUS"||o.category===domain).map((o:any)=>o.subcategory)))];
 const assignedOps=new Set(data.assignments.map((a:any)=>a.operation_id));
 const visibleOps=data.operations.filter((o:any)=>{
   const q=search.trim().toLowerCase();
   return (domain==="TOUS"||o.category===domain)
     &&(processFilter==="TOUS"||o.subcategory===processFilter)
     &&(sphere==="both"||o.sphere===sphere)
     &&(!q||`${o.name} ${o.category} ${o.subcategory}`.toLowerCase().includes(q))
     &&(!incompleteOnly||!assignedOps.has(o.id));
 });
 const covered=assignedOps.size;
 const steps=[["1","Acteurs","Qui intervient réellement ?"],["2","Opérations","Qui fait quoi ?"],["3","Sécurisation","Délégations, habilitations, suppléances"],["4","ONF","Contrôler, consolider, valider"]];
 function coverage(cat:string,sub?:string){
   const all=data.operations.filter((o:any)=>(cat==="TOUS"||o.category===cat)&&(!sub||o.subcategory===sub));
   const done=all.filter((o:any)=>assignedOps.has(o.id)).length;
   return {done,total:all.length,pct:all.length?Math.round(done*100/all.length):0};
 }
 function resetFilters(){setDomain("TOUS");setProcessFilter("TOUS");setSearch("");setSphere("both");setIncompleteOnly(false)}
 async function addActor(){if(!actorName.trim())return;await api.createOfnActor(campaignId,{name:actorName,role:actorRole,functionCode:"",sphere:actorSphere,service,source:"MANUAL"});setActorName("");setActorRole("");setService("");await reload()}
 async function addSuggested(s:any){await api.createOfnActor(campaignId,{name:s.name,role:roleLabel(s.role_code),functionCode:s.role_code,sphere:s.sphere,service:data.context?.agency_name&&s.sphere==="COMPTABLE"?data.context.agency_name:data.context?.establishment_name||"",sourceUserId:s.user_id,source:"PCIF_USER"});await reload()}
 async function analyse(){setChecks(await api.ofnChecks(campaignId));setStep(3)}
 async function validate(){const d=new Date().toLocaleDateString("fr-FR");await api.createOfnVersion(campaignId,`ONF validé le ${d}`);await reload()}
 const existingUsers=new Set(data.actors.map((a:any)=>a.source_user_id).filter(Boolean));
 return <div className="onf-builder">
  <div className="onf-context"><div><span>ATELIER 1/4 · QUI FAIT QUOI ?</span><h2>Construire l’organigramme fonctionnel nominatif</h2><p>Le contexte est déjà connu : l’atelier porte directement sur l’organisation réelle.</p></div><dl><div><dt>Établissement</dt><dd>{data.context?.establishment_name} · {data.context?.uai}</dd></div><div><dt>Agence comptable</dt><dd>{data.context?.agency_name||"Non rattachée"}</dd></div><div><dt>Campagne</dt><dd>{data.context?.campaign_label}</dd></div></dl></div>
  <div className="onf-steps">{steps.map(([n,l,s])=><button key={n} className={step===+n?"active":step>+n?"done":""} onClick={()=>setStep(+n)}><i>{step>+n?"✓":n}</i><b>{l}</b><small>{s}</small></button>)}</div>
  {step===1&&<section className="onf-stage"><header><span>ÉTAPE 1</span><h2>Qui intervient réellement ?</h2><p>Ajoutez les personnes qui interviennent dans la chaîne financière. Un acteur ONF n’a pas besoin d’avoir un compte PCIF Académie.</p></header>
   {!!data.suggestedActors?.filter((s:any)=>!existingUsers.has(s.user_id)).length&&<div className="actor-suggestions"><h3>Acteurs déjà connus de PCIF Académie</h3><p>Ces personnes sont proposées à partir de l’EPLE et de son agence comptable.</p>{data.suggestedActors.filter((s:any)=>!existingUsers.has(s.user_id)).map((s:any)=><button key={s.user_id} onClick={()=>addSuggested(s)}>+ <b>{s.name}</b><small>{roleLabel(s.role_code)} · {s.sphere}</small></button>)}</div>}
   <div className="actor-form"><label>Nom / prénom<input value={actorName} onChange={e=>setActorName(e.target.value)} placeholder="Ex. Marie Dupont"/></label><label>Fonction<input value={actorRole} onChange={e=>setActorRole(e.target.value)} placeholder="Ex. Secrétaire général"/></label><label>Sphère<select value={actorSphere} onChange={e=>setActorSphere(e.target.value)}><option>ORDONNATEUR</option><option>COMPTABLE</option><option>MIXTE</option></select></label><label>Établissement / service<input value={service} onChange={e=>setService(e.target.value)} placeholder={data.context?.establishment_name}/></label></div><button className="primary-action" onClick={addActor}>+ Ajouter l’acteur</button>
   <div className="actor-list">{data.actors.map((a:any)=><div key={a.id}><b>{a.name}</b><span>{a.role||"Fonction non précisée"}</span><small>{a.sphere} · {a.service||"Service non précisé"}{a.source==="PCIF_USER"?" · compte PCIF":""}</small></div>)}</div>
   <footer><span/><button className="primary-action" onClick={()=>setStep(2)}>Positionner sur les opérations →</button></footer></section>}
  {step===2&&<section className="onf-stage"><header><span>ÉTAPE 2</span><h2>Qui fait quoi réellement ?</h2><p>Travaillez d’abord par domaine et processus. Affectez un schéma d’acteurs au processus, puis ne corrigez que les exceptions opération par opération.</p></header>
   <div className="onf-filter-panel">
    <label>Domaine<select value={domain} onChange={e=>{setDomain(e.target.value);setProcessFilter("TOUS")}}><option value="TOUS">Tous les domaines</option>{domains.filter((d:any)=>d!=="TOUS").map((d:any)=><option key={d}>{d}</option>)}</select></label>
    <label>Processus / sous-catégorie<select value={processFilter} onChange={e=>setProcessFilter(e.target.value)}><option value="TOUS">Tous les processus</option>{processes.filter((d:any)=>d!=="TOUS").map((d:any)=><option key={d}>{d}</option>)}</select></label>
    <label>Recherche opération<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="service fait, bourses, trésorerie…"/></label>
    <button onClick={resetFilters}>Effacer filtres</button>
   </div>
   <div className="coverage-chips">{domains.filter((d:any)=>d!=="TOUS").map((d:any)=>{const c=coverage(d);return <button key={d} className={domain===d?"active":""} onClick={()=>{setDomain(d);setProcessFilter("TOUS")}}><b>{d}</b> · {c.done}/{c.total} · {c.pct}%</button>})}</div>
   <div className="onf-filter-row"><div><button className={sphere==="both"?"active":""} onClick={()=>setSphere("both")}>Les deux sphères</button><button className={sphere==="ordonnateur"?"active ord":""} onClick={()=>setSphere("ordonnateur")}>Ordonnateur</button><button className={sphere==="comptable"?"active cpt":""} onClick={()=>setSphere("comptable")}>Comptable</button></div><label><input type="checkbox" checked={incompleteOnly} onChange={e=>setIncompleteOnly(e.target.checked)}/> Opérations non couvertes uniquement</label></div>
   <ProcessBulkPanel data={data} campaignId={campaignId} domain={domain} processFilter={processFilter} reload={reload}/>
   <div className="operation-list">{visibleOps.map((o:any)=><OperationBuilder key={o.id} o={o} data={data} campaignId={campaignId} reload={reload}/>)}</div>
   {!visibleOps.length&&<div className="notice">Aucune opération ne correspond aux filtres sélectionnés.</div>}
   <footer><button onClick={()=>setStep(1)}>← Acteurs</button><span>{visibleOps.length} opération(s) affichée(s) · {covered}/{data.operations.length} couvertes</span><button className="primary-action" onClick={analyse}>Analyser la sécurisation →</button></footer></section>}
  {step===3&&<section className="onf-stage"><header><span>ÉTAPE 3</span><h2>Sécuriser l’organisation réelle</h2><p>PCIF Académie confronte l’ONF déclaré aux règles de suppléance, de séparation des sphères et de formalisation.</p></header>
   <div className="security-summary"><b>{checks.filter(x=>x.severity==="MAJEUR").length}</b><span>anomalies majeures</span><b>{checks.filter(x=>x.severity==="VIGILANCE").length}</b><span>points de vigilance</span></div>
   <div className="finding-list">{checks.length?checks.map((x:any,i:number)=><article className={x.severity.toLowerCase()} key={i}><b>{x.severity}</b><span>{x.label}</span><small>{x.code==="NO_SUBSTITUTE"?"Identifier un suppléant ou documenter l’absence justifiée.":x.code==="SPHERE_CONFLICT"?"Vérifier la séparation ordonnateur/comptable et corriger l’affectation.":x.code==="DELEGATION_EVIDENCE"?"Renseigner la preuve ou la référence de délégation.":"Réduire la dépendance à une personne unique."}</small></article>):<div className="notice">Aucune anomalie détectée sur les opérations renseignées.</div>}</div>
   <footer><button onClick={()=>setStep(2)}>← Opérations</button><button className="primary-action" onClick={()=>setStep(4)}>Consolider l’ONF →</button></footer></section>}
  {step===4&&<section className="onf-stage"><header><span>ÉTAPE 4</span><h2>Contrôler, consolider et valider</h2><p>Cette synthèse constitue le livrable de l’atelier. La validation crée une version datée et immuable de l’ONF.</p></header>
   <div className="org-kpis">{[[data.actors.length,"acteurs"],[covered,"opérations couvertes"],[data.assignments.filter((a:any)=>a.substitution).length,"suppléances"],[checks.length,"points à examiner"]].map((x:any)=><div key={x[1]}><b>{x[0]}</b><span>{x[1]}</span></div>)}</div>
   <OfnMatrix data={data}/><div className="version-box"><h3>Versions de l’ONF</h3>{data.versions?.length?data.versions.map((v:any)=><div key={v.id}><b>Version {v.version_no}</b><span>{v.label}</span><small>{new Date(v.created_at).toLocaleString("fr-FR")}</small></div>):<p>Aucune version validée.</p>}</div>
   <footer><button onClick={()=>setStep(3)}>← Sécurisation</button><button className="primary-action" onClick={validate}>✓ Valider une version de l’ONF</button></footer></section>}
 </div>
}

function ProcessBulkPanel({data,campaignId,domain,processFilter,reload}:any){
 const processOps=data.operations.filter((o:any)=>(domain==="TOUS"||o.category===domain)&&(processFilter==="TOUS"||o.subcategory===processFilter));
 const[actor,setActor]=useState(""),[action,setAction]=useState("directAction");
 useEffect(()=>{if(!data.actors.some((a:any)=>a.id===actor))setActor(data.actors[0]?.id||"")},[data.actors.length]);
 if(processFilter==="TOUS")return <div className="bulk-hint"><b>Gain de temps :</b> choisissez un processus pour affecter un même rôle à toutes ses opérations, puis ajustez seulement les exceptions.</div>;
 async function apply(){
   if(!actor||!processOps.length)return;
   for(const o of processOps){
     const a=data.actors.find((x:any)=>x.id===actor);
     const compatible=a&&(a.sphere==="MIXTE"||(o.sphere==="ordonnateur"&&a.sphere==="ORDONNATEUR")||(o.sphere==="comptable"&&a.sphere==="COMPTABLE"));
     if(!compatible)continue;
     const ex=data.assignments.find((x:any)=>x.operation_id===o.id&&x.actor_id===actor);
     await api.saveOfnAssignment(campaignId,{operationId:o.id,actorId:actor,directAction:action==="directAction"||!!ex?.direct_action,delegation:!!ex?.delegation,substitution:action==="substitution"||!!ex?.substitution,validates:action==="validates"||!!ex?.validates,controls:action==="controls"||!!ex?.controls,ring:ex?.ring||null,note:ex?.note||""});
   }
   await reload();
 }
 const done=processOps.filter((o:any)=>data.assignments.some((a:any)=>a.operation_id===o.id)).length;
 return <div className="bulk-process"><div><span>AFFECTATION PAR PROCESSUS</span><h3>{processFilter}</h3><p>{done}/{processOps.length} opérations couvertes. L’affectation s’applique aux opérations compatibles avec la sphère de l’acteur.</p></div><select value={actor} onChange={e=>setActor(e.target.value)}><option value="">Choisir un acteur</option>{data.actors.map((a:any)=><option key={a.id} value={a.id}>{a.name} · {a.sphere}</option>)}</select><select value={action} onChange={e=>setAction(e.target.value)}><option value="directAction">Réalise</option><option value="validates">Valide</option><option value="controls">Contrôle</option><option value="substitution">Supplée</option></select><button className="primary-action" onClick={apply}>Appliquer au processus</button></div>
}

function OperationBuilder({o,data,campaignId,reload}:any){
 const existing=data.assignments.filter((a:any)=>a.operation_id===o.id);
 const compatible=data.actors.filter((a:any)=>a.sphere==="MIXTE"||(o.sphere==="ordonnateur"&&a.sphere==="ORDONNATEUR")||(o.sphere==="comptable"&&a.sphere==="COMPTABLE"));
 const[actor,setActor]=useState(compatible[0]?.id||"");
 useEffect(()=>{if(!compatible.some((a:any)=>a.id===actor))setActor(compatible[0]?.id||"")},[o.id,data.actors.length]);
 async function add(){if(!actor)return;await api.saveOfnAssignment(campaignId,{operationId:o.id,actorId:actor,directAction:true,delegation:false,substitution:false,validates:false,controls:false,ring:null,note:""});await reload()}
 async function toggle(a:any,k:string){await api.saveOfnAssignment(campaignId,{operationId:o.id,actorId:a.actor_id,directAction:k==="direct_action"?!a.direct_action:a.direct_action,delegation:a.delegation,substitution:k==="substitution"?!a.substitution:a.substitution,validates:k==="validates"?!a.validates:a.validates,controls:k==="controls"?!a.controls:a.controls,ring:a.ring||null,note:a.note||""});await reload()}
 return <article className={`operation ${o.sphere==="ordonnateur"?"ord":"cpt"}`}><div className="op-title"><b>{o.name}</b><small>{o.category} › {o.subcategory} · {o.sphere}</small></div><div className="op-assign">{existing.map((a:any)=>{const ac=data.actors.find((x:any)=>x.id===a.actor_id);return <div className="assignment-row assignment-rich" key={a.id}><span><b>{ac?.name||"—"}</b><small>{ac?.role}</small></span><div className="role-buttons"><button className={a.direct_action?"on":""} onClick={()=>toggle(a,"direct_action")}>Réalise</button><button className={a.validates?"on":""} onClick={()=>toggle(a,"validates")}>Valide</button><button className={a.controls?"on":""} onClick={()=>toggle(a,"controls")}>Contrôle</button><button className={a.substitution?"on":""} onClick={()=>toggle(a,"substitution")}>Supplée</button></div></div>})}<div className="add-assignment"><select value={actor} onChange={e=>setActor(e.target.value)}>{compatible.map((a:any)=><option key={a.id} value={a.id}>{a.name} · {a.sphere}</option>)}</select><button onClick={add}>+ intervenant</button></div></div></article>
}
function OfnMatrix({data}:any){return <div className="table-scroll"><table className="ofn-matrix-react"><thead><tr><th>Opération</th><th>Sphère</th><th>Acteur</th><th>Réalise</th><th>Valide</th><th>Contrôle</th><th>Supplée</th></tr></thead><tbody>{data.assignments.map((a:any)=>{const o=data.operations.find((x:any)=>x.id===a.operation_id),ac=data.actors.find((x:any)=>x.id===a.actor_id);return <tr key={a.id}><td>{o?.name}</td><td>{o?.sphere}</td><td><b>{ac?.name}</b><small>{ac?.role}</small></td><td>{a.direct_action?"✓":"—"}</td><td>{a.validates?"✓":"—"}</td><td>{a.controls?"✓":"—"}</td><td>{a.substitution?"✓":"—"}</td></tr>})}</tbody></table></div>}

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
