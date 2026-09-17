import { OrganisationPcif } from "./OrganisationPcif";
import React,{useEffect,useMemo,useState}from"react";
import{api,type AuditData,type Campaign,type Establishment,type Me,type PcifAction,type PilotageData,type PilotageQuestion,type WorkshopSession}from"./api";

const DOMAINS=["Organisation","Exécution budgétaire","Comptabilité Générale","Régies","Contentieux","Patrimoine stocks Domaine"];
const BADGE_LABELS=["Découverte","Sensibilisation","Initiation","Pratique","Confirmé","Maîtrise"];
const workshops=[
 {title:"Qui fait quoi ?",subtitle:"Organisation réelle",deliverable:"Organigramme fonctionnel nominatif + responsabilités",
  phases:[["5 min","Cadrer"],["10 min","Identifier les acteurs"],["15 min","Affecter les responsabilités"],["10 min","Formaliser les délégations"],["10 min","Tester les suppléances"],["7 min","Vérifier"],["3 min","Valider"]],
  criteria:["Acteurs clés identifiés","Responsabilités principales affectées","Délégations / habilitations renseignées ou à confirmer","Suppléances testées et zones non couvertes repérées","Contrôle de cohérence réalisé","ONF daté et validé"]},
 {title:"Comment travaillons-nous ?",subtitle:"Processus",deliverable:"Cartographie des processus + procédures prioritaires",
  phases:[["5 min","Lancement"],["15 min","Parcours d’un flux réel"],["30 min","Étapes, contrôles, ruptures et interfaces"],["10 min","Priorisation"]],
  criteria:["Processus clés identifiés","Étapes et interfaces décrites","Contrôles existants repérés","Procédures prioritaires à sécuriser choisies"]},
 {title:"Où sont nos risques ?",subtitle:"Risques & maîtrise",deliverable:"Cartographie des risques + niveau de maîtrise",
  phases:[["5 min","Cadrage"],["15 min","Constats issus du diagnostic"],["30 min","Cotation et maîtrise"],["10 min","Arbitrage des priorités"]],
  criteria:["Risques significatifs identifiés","Probabilité et gravité discutées","Maîtrise existante objectivée","Priorités de traitement validées"]},
 {title:"Qu’allons-nous faire ?",subtitle:"Plan d’action",deliverable:"Plan d’action annuel + PCIF consolidé",
  phases:[["5 min","Rappel des priorités"],["15 min","Mesures possibles"],["30 min","Pilotes, échéances et preuves"],["10 min","Validation"]],
  criteria:["Mesures correctives retenues","Pilotes désignés","Échéances fixées","Indicateurs / preuves de réalisation définis"]}
] as const;

function factor(v?:number|null){return v===3?0:v===2?.5:v===1?1:null}
function answerLabel(v?:number|null){return v===3?"OUI":v===2?"PARTIEL":v===1?"NON":v===0?"N/A":"—"}
function gravity(q:PilotageQuestion){return Number(q.gravity ?? q.pcif_i ?? 1)}
function probability(q:PilotageQuestion){return Number(q.occurrence ?? q.pcif_p ?? 1)}
function residual(q:PilotageQuestion){const f=factor(q.value);return f===null?0:(probability(q)*gravity(q))*f}
function sev(n:number){return n>=6?["crit","Critique"]:n>=4?["high","Élevé"]:n>=2?["med","Modéré"]:["low","Faible"]}

export type PilotageTab="dashboard"|"diagnostic"|"risks"|"annual"|"workshops"|"organisation";
export type WorkspaceSection="pilotage"|"workshops"|"onf"|"processes"|"audit";
export function PilotagePcif({campaign,establishment,me,onBack,initialTab="dashboard",section="pilotage",onNavigate}:{campaign:Campaign;establishment:Establishment;me:Me;onBack:()=>void;initialTab?:PilotageTab;section?:WorkspaceSection;onNavigate?:(section:WorkspaceSection,tab?:PilotageTab)=>void}){
 const firstTab=section==="workshops"?"workshops":section==="onf"||section==="processes"?"organisation":initialTab;
 const[data,setData]=useState<PilotageData|null>(null),[tab,setTab]=useState<PilotageTab>(firstTab);
 const[scope,setScope]=useState<"both"|"O"|"C">("both"),[mode,setMode]=useState<"all"|"sprint"|"critical"|"unanswered">("all"),[domain,setDomain]=useState("TOUS"),[idx,setIdx]=useState(0);
 async function load(){setData(await api.pilotage(campaign.id))}
 useEffect(()=>{load()},[campaign.id]);
 useEffect(()=>{setTab(section==="workshops"?"workshops":section==="onf"||section==="processes"?"organisation":initialTab)},[section,initialTab]);
 if(!data)return <div className="pcif-loading">Chargement du pilotage…</div>;
 if(data.access?.auditOnly&&section==="workshops")return <div className="empty-state"><b>Ateliers non accessibles</b><p>L’auditeur analyse les résultats sans accéder à l’espace de production collective.</p><button onClick={onBack}>Retour au tableau de bord</button></div>;

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

 function openPcifQuestion(code:string){
   const normalized=code.replace(/^PCIF-/,"");
   const target=qs.find(q=>q.code.replace(/^PCIF-/,"")===normalized);
   if(!target)return;
   const sameDomain=qs.filter(q=>q.domain===target.domain);
   setDomain(target.domain);setMode("all");setIdx(Math.max(0,sameDomain.findIndex(q=>q.id===target.id)));setTab("diagnostic");
   onNavigate?.("pilotage","diagnostic");
 }
 if(section==="audit")return <AuditMode campaign={campaign} establishment={establishment} onBack={onBack}/>;
 const sectionTitle=section==="workshops"?"Ateliers PCIF":section==="onf"?"Organigramme fonctionnel":section==="processes"?"Processus & logigrammes":"Pilotage du PCIF";
 const historical=["VALIDATED","ARCHIVED"].includes(campaign.status);
 return <div className="pilot-shell">
  <div className="pilot-head">
   <div><button className="text-btn" onClick={onBack}>← Tableau de bord</button><div className="pilot-kicker">PCIF ACADÉMIE · {establishment.uai}</div><h1>{sectionTitle}</h1><p>{establishment.name} · {campaign.label}</p></div>
   <div className="pilot-scope"><button className={scope==="both"?"active":""} onClick={()=>setScope("both")}>Les deux sphères</button><button className={scope==="O"?"active ord":""} onClick={()=>setScope("O")}>Ordonnateur</button><button className={scope==="C"?"active cpt":""} onClick={()=>setScope("C")}>Agence comptable</button></div>
  </div>
  {historical&&<div className="historical-banner"><b>Campagne historique · consultation</b><span>Cette campagne est validée. Les réponses et le plan d’action sont conservés en lecture seule.</span></div>}
  {section==="pilotage"&&<nav className="pilot-tabs">
   <button className={tab==="dashboard"?"active":""} onClick={()=>setTab("dashboard")}>Tableau de bord</button>
   <button className={tab==="diagnostic"?"active":""} onClick={()=>setTab("diagnostic")}>Diagnostic</button>
   <button className={tab==="risks"?"active":""} onClick={()=>setTab("risks")}>Risques</button>
   <button className={tab==="annual"?"active":""} onClick={()=>setTab("annual")}>Programme annuel</button>
  </nav>}
  {tab==="dashboard"&&<Dashboard campaign={campaign} auditOnly={!!data.access?.auditOnly} qs={qs} metrics={metrics} answered={answered} critical={critical} mastery={mastery} coverage={coverage} actions={data.actions} workshops={data.workshops} go={(target:string)=>target==="workshops"?onNavigate?.("workshops"):setTab(target as PilotageTab)}/>} 
  {tab==="diagnostic"&&<Diagnostic qs={qs} actions={data.actions} campaignId={campaign.id} userKey={me.user.sub} mode={mode} setMode={setMode} domain={domain} setDomain={setDomain} idx={idx} setIdx={setIdx} reload={load}/>}
  {tab==="risks"&&<RiskView qs={qs}/>}
  {tab==="annual"&&(historical?<HistoricalActionPlan data={data}/>:<Annual data={data} campaignId={campaign.id} reload={load}/>)} 
  {tab==="workshops"&&<Workshops data={data} campaignId={campaign.id} reload={load} onOpenOnf={()=>onNavigate?.("onf")}/>}
  {tab==="organisation"&&<OrganisationPcif campaignId={campaign.id} initialView={section==="processes"?"process":"ofn"} showTabs={false} readOnly={!!data.access?.auditOnly} onOpenQuestion={openPcifQuestion}/>} 
 </div>
}

function AuditMode({campaign,establishment,onBack}:{campaign:Campaign;establishment:Establishment;onBack:()=>void}){
 const[data,setData]=useState<AuditData|null>(null),[body,setBody]=useState(""),[filter,setFilter]=useState("attention");async function load(){setData(await api.audit(campaign.id))}useEffect(()=>{load()},[campaign.id]);
 if(!data)return <div className="pcif-loading">Analyse de la chaîne de maîtrise…</div>;
 const f=data.findings,cards=[{k:"withoutEvidence",n:f.withoutEvidence.length,t:"Maîtrisés sans justification",c:"amber"},{k:"divergences",n:f.divergences.length,t:"Écarts ordonnateur / comptable",c:"purple"},{k:"risksWithoutAction",n:f.risksWithoutAction.length,t:"Risques sans action",c:"red"},{k:"overdueActions",n:f.overdueActions.length,t:"Actions échues",c:"orange"},{k:"progressions",n:f.progressions.length,t:"Progressions à documenter",c:"green"},{k:"ofn",n:f.unassignedOperations,t:"Responsabilités non attribuées",c:"blue"}];
 const lists:any={withoutEvidence:f.withoutEvidence,divergences:f.divergences,risksWithoutAction:f.risksWithoutAction,overdueActions:f.overdueActions,progressions:f.progressions};
 return <div className="audit-mode"><button className="text-btn" onClick={onBack}>← Tableau de bord</button><header><div><span>MODE AUDIT · LECTURE ET OBSERVATION</span><h1>Chaîne de maîtrise</h1><p>{establishment.name} · {campaign.label}</p></div><strong>{cards.reduce((s,x)=>s+x.n,0)}<small> points d’attention</small></strong></header><div className="audit-principle">L’outil ne conclut pas qu’une déclaration est fausse. Il signale les endroits où il est pertinent de regarder et de demander la preuve.</div><div className="audit-cards">{cards.map(x=><button key={x.k} className={`${x.c} ${filter===x.k?"active":""}`} onClick={()=>setFilter(x.k)}><strong>{x.n}</strong><span>{x.t}</span></button>)}</div><section className="audit-findings"><h2>Points à examiner</h2>{(lists[filter]||[]).length?(lists[filter]||[]).map((x:any,i:number)=><article key={x.id||i}><div><b>{x.code||x.action_text||`Point ${i+1}`}</b><span>{x.label||x.domain||x.actor||"Élément de la campagne"}</span></div>{data.observationsAllowed&&<button onClick={()=>setBody(`Observation relative à ${x.code||x.action_text||"cet élément"} : `)}>Observer</button>}</article>):<p>Aucun élément détaillé dans cette catégorie.</p>}</section><section className="audit-observations"><div><h2>Observations d’audit</h2><p>Elles restent séparées des réponses et scores produits par l’établissement.</p></div>{data.observationsAllowed?<><textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Rédiger une observation factuelle…"/><button className="primary" disabled={body.trim().length<5} onClick={async()=>{await api.createAuditObservation(campaign.id,{body,subjectType:"CAMPAIGN"});setBody("");await load()}}>Déposer l’observation</button></>:<div className="historical-banner">Cette mission autorise la consultation, sans dépôt d’observation.</div>}{data.observations.map((o:any)=><article key={o.id}><header><b>{o.auditor_name}</b><span>{new Date(o.created_at).toLocaleDateString("fr-FR")} · {o.status}</span></header><p>{o.body}</p>{o.response&&<blockquote><b>Réponse de l’établissement</b>{o.response}</blockquote>}</article>)}</section></div>
}

function HistoricalActionPlan({data}:{data:PilotageData}){
 const done=data.actions.filter(a=>a.status==="REALISEE").length;
 return <section className="historical-plan"><header><div><span>PROGRAMME ANNUEL ARCHIVÉ</span><h2>Réalisation du plan d’action</h2><p>{done} action(s) réalisée(s) sur {data.actions.length}.</p></div><strong>{data.actions.length?Math.round(done*100/data.actions.length):0}%</strong></header>{data.actions.length?<div>{data.actions.map(a=><article key={a.id} className={a.status==="REALISEE"?"done":"pending"}><span>{a.priority}</span><div><b>{a.action_text}</b><small>{a.actor||"Pilote non renseigné"} · {a.period||a.target_date||"Échéance non renseignée"}</small><p>{a.note}</p></div><em>{a.status==="REALISEE"?"Réalisée":a.status==="EN_COURS"?"En cours":a.status==="PREPARATION"?"En préparation":"Non démarrée"}</em></article>)}</div>:<p className="empty-state">Aucune action n’était rattachée à cette campagne.</p>}</section>
}

function Dashboard({campaign,auditOnly,qs,metrics,answered,critical,mastery,coverage,actions,workshops,go}:any){
 const completed=workshops.filter((w:any)=>w.completed).length;
 const[exporting,setExporting]=useState(false),[exportError,setExportError]=useState("");
 async function exportCartopale(){setExporting(true);setExportError("");try{await api.exportCartopale(campaign.id)}catch{setExportError("L’export Cartop@le n’a pas pu être généré.")}finally{setExporting(false)}}
 return <div className="pilot-dashboard">
  <section className="cartopale-export"><div><span>INTEROPÉRABILITÉ CARTOP@LE</span><b>Exporter la campagne {campaign.label}</b><small>Réponses, observations et plan d’action de cette campagne uniquement.</small>{exportError&&<em>{exportError}</em>}</div><button className="primary-action" disabled={exporting} onClick={exportCartopale}>{exporting?"Génération…":"⇩ Exporter vers CARTOP@LE"}</button></section>
  <section className="journey"><h2>Cycle de vie du PCIF</h2><p>Prendre en main, construire le PCIF, puis le faire vivre et l’approfondir.</p><div className="journey-grid">
   {!auditOnly&&<Stage n="1" title="Prendre en main" value={`${completed} / 4`} text="Ateliers collectifs de lancement." onClick={()=>go("workshops")}/>} 
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
 const cells:Record<string,PilotageQuestion[]>={};
 for(let g=1;g<=3;g++)for(let o=1;o<=3;o++)cells[`${g}-${o}`]=[];
 qs.filter(q=>q.value===1||q.value===2).forEach(q=>{
   const g=gravity(q),p=probability(q);
   if(cells[`${g}-${p}`]) cells[`${g}-${p}`].push(q);
 });
 const gLabels:Record<number,string>={1:"Mineure",2:"Modérée",3:"Majeure"};
 const pLabels:Record<number,string>={1:"Rare",2:"Possible",3:"Probable"};
 return <div className="risk-matrix">
   <div className="axis">G ↓ / P →</div>
   {[1,2,3].map(p=><div className="axis" key={"h"+p}><b>P{p}</b><small>{pLabels[p]}</small></div>)}
   {[3,2,1].flatMap(g=>[
     <div className="axis" key={"g"+g}><b>G{g}</b><small>{gLabels[g]}</small></div>,
     ...[1,2,3].map(p=>{
       const score=p*g,count=cells[`${g}-${p}`].length;
       return <div className={`risk-cell ${score>=6?"critical":score>=4?"high":score>=2?"med":"low"}`} key={`${g}-${p}`}>
         <b>{count}</b><small>{count===1?"risque résiduel":"risques résiduels"}</small><em>P × G = {score}/9</em>
       </div>
     })
   ])}
 </div>
}

function defaultPriority(q:PilotageQuestion){
 const r=residual(q);
 if(r>=9 || (q.weight>=9 && q.value===1)) return "P1";
 if(r>=6 || q.weight>=6) return "P2";
 if(r>=3) return "P3";
 return "P4";
}
function reflexData(q:PilotageQuestion,action:string){
 const evals=q.corrective_evaluations||[];
 return {
  before:[
   `Relire le constat PCIF : ${q.label}`,
   "Identifier les pièces ou traces existantes permettant d’étayer la situation actuelle.",
   "Vérifier qui détient la compétence et qui doit être associé avant mise en œuvre.",
   "Repérer les dépendances avec l’autre sphère et les autres acteurs du processus."
  ],
  do:[
   action,
   "Formaliser le résultat attendu et conserver une trace datée de la décision ou de la procédure.",
   "Informer les acteurs concernés et intégrer, si nécessaire, la mesure dans les procédures, fiches de poste ou circuits de validation.",
   "Prévoir le point de contrôle permettant de vérifier que l’action est effectivement appliquée."
  ],
  check:evals.length?evals:[
   `Vérifier que le risque « ${q.risk_label||q.label} » est effectivement réduit.`,
   "Vérifier l’existence d’une preuve exploitable en cas de contrôle.",
   "Réévaluer la réponse PCIF après mise en œuvre."
  ],
  evidence:[
   "Acte, procédure, note ou décision formalisée selon la nature de l’action.",
   "Preuve de diffusion / information des acteurs concernés.",
   "Trace du contrôle ou de l’évaluation réalisée.",
   "Éléments déposés ou référencés dans le dossier de contrôle interne."
  ]
 };
}
function CorrectivePanel({q,campaignId,actions,reload}:{q:PilotageQuestion;campaignId:string;actions:PcifAction[];reload:()=>Promise<void>}){
 const proposals=q.corrective_actions||[];
 const [open,setOpen]=useState<number|null>(null);
 if(!(q.value===1||q.value===2))return null;
 const selected=(text:string)=>actions.find(a=>a.question_id===q.id&&a.action_text===text);
 async function toggle(text:string,checked:boolean){
  const ex=selected(text);
  if(checked&&!ex){
   await api.createAction(campaignId,{
    questionId:q.id,
    sphere:q.responsibility==="COMPTABLE"?"COMPTABLE":"ORDONNATEUR",
    actionText:text,
    priority:defaultPriority(q),
    period:(q.corrective_deadlines||[])[0]||"Trimestre",
    actor:(q.corrective_actors||[])[0]||(q.responsibility==="COMPTABLE"?"Agent comptable":"Chef d’établissement"),
    status:"A_LANCER",
    note:""
   });
  }else if(!checked&&ex){await api.deleteAction(campaignId,ex.id)}
  await reload();
 }
 return <section className={`corrective-panel ${q.weight>=9?"critical":""}`}>
   <div className="corrective-head"><div><b>Alimentez maintenant le plan d’action annuel</b><p>Réponse <strong>{answerLabel(q.value)}</strong> · risque brut <strong>{q.weight}/9</strong>. Sélectionnez les mesures que la sphère s’engage à conduire.</p></div><span>{q.weight}/9</span></div>
   {!proposals.length?<div className="corrective-empty">Aucune mesure pré-paramétrée pour cet item. Formalisez une action dans le programme annuel.</div>:
   <div className="corrective-list">{proposals.map((text,i)=>{
    const ex=selected(text),guide=reflexData(q,text);
    return <article className={`corrective-item ${ex?"selected":""}`} key={i}>
      <label><input type="checkbox" checked={!!ex} onChange={e=>toggle(text,e.target.checked)}/><span><b>{text}</b><small>{ex?"Retenue dans le programme annuel":"À décider"}</small></span></label>
      <button className="guide-btn" onClick={()=>setOpen(open===i?null:i)}>Guide de mise en œuvre {open===i?"▴":"▾"}</button>
      {open===i&&<div className="implementation-guide">
        <div><h4>Pilotes proposés</h4><div className="guide-chips">{(q.corrective_actors||[]).map(x=><span key={x}>{x}</span>)}</div></div>
        <div><h4>Échéances possibles</h4><div className="guide-chips">{(q.corrective_deadlines||[]).map(x=><span key={x}>{x}</span>)}</div></div>
        <div><h4>1. Avant d’agir</h4><ul>{guide.before.map(x=><li key={x}>{x}</li>)}</ul></div>
        <div><h4>2. À faire</h4><ul>{guide.do.map(x=><li key={x}>{x}</li>)}</ul></div>
        <div><h4>3. Contrôles de fin d’action</h4><ul>{guide.check.map(x=><li key={x}>{x}</li>)}</ul></div>
        <div><h4>4. Preuves à conserver</h4><ul>{guide.evidence.map(x=><li key={x}>{x}</li>)}</ul></div>
      </div>}
    </article>
   })}</div>}
   <div className="corrective-foot">{proposals.length?`${proposals.filter(x=>selected(x)).length} / ${proposals.length} mesure(s) retenue(s)`:"Action libre à créer"} · le risque reste signalé tant qu’aucune mesure n’est programmée.</div>
 </section>
}

function Diagnostic({qs,actions,campaignId,userKey,mode,setMode,domain,setDomain,idx,setIdx,reload}:any){
 let list=domain==="TOUS"?qs:qs.filter((q:PilotageQuestion)=>q.domain===domain);
 if(mode==="critical")list=list.filter((q:PilotageQuestion)=>(q.value===1||q.value===2)&&Number(q.weight)>=6);
 if(mode==="unanswered")list=list.filter((q:PilotageQuestion)=>q.value===undefined||q.value===null);
 if(mode==="sprint")list=list.slice(0,20);
 const q=list[Math.min(idx,Math.max(0,list.length-1))];
 const prefKey=`pcif-diagnostic-auto-advance:${userKey||"user"}`;
 const[autoAdvance,setAutoAdvance]=useState<boolean>(()=>{try{return localStorage.getItem(prefKey)!=="false"}catch{return true}});
 const[selectedValue,setSelectedValue]=useState<number|null>(null);
 const[saving,setSaving]=useState(false);
 useEffect(()=>{setSelectedValue(null)},[q?.id]);
 function changeAutoAdvance(value:boolean){setAutoAdvance(value);try{localStorage.setItem(prefKey,String(value))}catch{}}
 async function ans(v:number){
  if(!q||saving)return;
  setSelectedValue(v);setSaving(true);
  try{
   const sphere=q.responsibility==="COMPTABLE"?"COMPTABLE":"ORDONNATEUR";
   await api.saveAnswer(campaignId,q.id,{sphere,value:v,comment:q.comment||"",version:q.version||0});
   await reload();
   if(autoAdvance&&(v===3||v===0)){
    await new Promise(resolve=>setTimeout(resolve,450));
    setIdx((x:number)=>Math.min(x+1,Math.max(0,list.length-1)));
   }
  }finally{setSaving(false)}
 }
 const effectiveValue=selectedValue??q?.value??null;
 const answeredCount=list.filter((item:PilotageQuestion)=>item.value!==undefined&&item.value!==null).length;
 const answeredWithCurrent=q&&q.value==null&&selectedValue!==null?answeredCount+1:answeredCount;
 const progress=list.length?Math.round(100*answeredWithCurrent/list.length):0;
 const answerButton=(value:number,label:string,cls:string)=>{
  const selected=effectiveValue===value;
  return <button type="button" aria-pressed={selected} disabled={saving} className={`${cls} ${selected?"selected":""}`} onClick={()=>ans(value)}>{selected&&<span className="answer-check" aria-hidden="true">✓</span>}{label}</button>
 };
 return <section className="diagnostic-view"><div className="diag-toolbar"><div>{["all","sprint","critical","unanswered"].map(m=><button key={m} className={mode===m?"active":""} onClick={()=>{setMode(m);setIdx(0)}}>{m==="all"?"Parcours complet":m==="sprint"?"Sprint 20":m==="critical"?"Risques ≥ 6":"Non répondues"}</button>)}</div><select value={domain} onChange={e=>{setDomain(e.target.value);setIdx(0)}}><option>TOUS</option>{DOMAINS.map(d=><option key={d}>{d}</option>)}</select></div>
 {!q?<div className="empty-dark">Aucune question dans ce filtre.</div>:<article className="challenge"><div className="challenge-progress challenge-progress-strong"><span><b>Défi {Math.min(idx+1,list.length)} / {list.length}</b><small>{answeredWithCurrent} réponse{answeredWithCurrent>1?"s":""} · {Math.max(0,list.length-answeredWithCurrent)} restante{Math.max(0,list.length-answeredWithCurrent)>1?"s":""}</small></span><strong>{progress}%</strong></div><div className="challenge-bar challenge-bar-strong" role="progressbar" aria-label="Avancement du diagnostic" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{width:`${progress}%`}}/></div><div className="diagnostic-preferences"><label><input type="checkbox" checked={autoAdvance} onChange={e=>changeAutoAdvance(e.target.checked)}/><span><b>Passage automatique après Oui ou N/A</b><small>Partiel et Non restent sur la question pour documenter l’écart et, si besoin, alimenter le plan d’action.</small></span></label></div><div className="challenge-card"><div className="chips"><span>{q.domain}</span><span>{q.category}</span><span>{q.responsibility}</span><span>P{probability(q)} × G{gravity(q)} = {probability(q)*gravity(q)}/9</span>{q.is_key&&<span>◆ Point clé</span>}</div><h2>{q.label}</h2><p className="risk-text"><b>Risque :</b> {q.risk_label||"—"}</p><div className="semantic-answers">{answerButton(3,"Oui","yes")}{answerButton(2,"Partiel","partial")}{answerButton(1,"Non","no")}{answerButton(0,"N/A","na")}</div><textarea value={q.comment||""} readOnly placeholder="Observation / preuve…"/>{(effectiveValue===1||effectiveValue===2)&&<CorrectivePanel q={{...q,value:effectiveValue}} campaignId={campaignId} actions={actions} reload={reload}/>}<div className="diag-nav"><button onClick={()=>setIdx((x:number)=>Math.max(0,x-1))}>← Précédent</button><button onClick={()=>setIdx((x:number)=>Math.min(list.length-1,x+1))}>Suivant →</button></div></div></article>}
 </section>
}
function RiskView({qs}:{qs:PilotageQuestion[]}){
 const rr=qs.filter(q=>q.value===1||q.value===2).map(q=>({...q,residual:residual(q)})).sort((a,b)=>b.residual-a.residual);
 return <section className="risk-view"><div className="section-title"><div><h2>Cartographie détaillée des risques</h2><p>Réponses « Partiel » ou « Non », classées par risque résiduel.</p></div></div><div className="risk-layout"><div className="dash-card"><RiskMatrix qs={qs}/></div><div className="dash-card"><table className="risk-table"><thead><tr><th>Priorité</th><th>Domaine</th><th>Risque</th><th>Probabilité</th><th>Gravité</th><th>Niveau de risque</th><th>Réponse</th><th>Résiduel</th></tr></thead><tbody>{rr.map(q=>{const sv=sev(q.residual);return <tr key={q.id}><td className={sv[0]}>{sv[1]}</td><td>{q.domain}</td><td>{q.risk_label}</td><td>{probability(q)}/3</td><td>{gravity(q)}/3</td><td>{probability(q)*gravity(q)}/9</td><td>{answerLabel(q.value)}</td><td>{q.residual.toFixed(1)}</td></tr>})}</tbody></table></div></div></section>
}
function Annual({data,campaignId,reload}:{data:PilotageData;campaignId:string;reload:()=>Promise<void>}){
 const qmap=new Map<string,PilotageQuestion>();
 data.questions.forEach(q=>{if(!qmap.has(q.id)||q.sphere==="SYNTHESE")qmap.set(q.id,q)});
 const risks=[...qmap.values()].filter(q=>(q.value===1||q.value===2)&&Number(q.weight)>=6).sort((a,b)=>residual(b)-residual(a));
 async function add(q:PilotageQuestion,text:string){
  if(data.actions.some(a=>a.question_id===q.id&&a.action_text===text))return;
  await api.createAction(campaignId,{questionId:q.id,sphere:q.responsibility==="COMPTABLE"?"COMPTABLE":"ORDONNATEUR",
   actionText:text,priority:defaultPriority(q),period:(q.corrective_deadlines||[])[0]||"Trimestre",
   actor:(q.corrective_actors||[])[0]||(q.responsibility==="COMPTABLE"?"Agent comptable":"Chef d’établissement"),status:"A_LANCER",note:""});
  await reload();
 }
 async function patch(a:PcifAction,k:string,v:any){await api.updateAction(campaignId,a.id,{[k]:v});await reload()}
 async function remove(a:PcifAction){await api.deleteAction(campaignId,a.id);await reload()}
 return <section><div className="section-title"><div><h2>Programme annuel de maîtrise</h2><p>Le diagnostic propose les mesures ; ici, vous les arbitrez, attribuez, échéancez et documentez.</p></div></div>
 <div className="annual-summary"><span><b>{data.actions.length}</b> actions retenues</span><span><b>{data.actions.filter(a=>a.priority==="P1").length}</b> P1</span><span><b>{data.actions.filter(a=>a.status==="REALISEE").length}</b> réalisées</span><span><b>{new Set(data.actions.map(a=>a.question_id)).size}</b> risques couverts</span></div>
 <div className="annual-v2">{risks.map(q=>{
   const proposals=q.corrective_actions||[], selected=data.actions.filter(a=>a.question_id===q.id);
   return <article className="annual-risk" key={q.id}>
    <header><div><span>{q.domain} · {q.category}</span><h3>{q.risk_label||q.label}</h3><p>P{probability(q)} × G{gravity(q)} = <b>{probability(q)*gravity(q)}/9</b> · {answerLabel(q.value)} · résiduel <b>{residual(q).toFixed(1)}</b></p></div><strong className={sev(residual(q))[0]}>{sev(residual(q))[1]}</strong></header>
    {proposals.length>0&&<div className="proposal-bank"><h4>Mesures proposées</h4>{proposals.map((text,i)=>{
      const ex=selected.find(a=>a.action_text===text);
      return <div className={`proposal-line ${ex?"chosen":""}`} key={i}><span>{text}</span>{ex?<button onClick={()=>remove(ex)}>Retirer</button>:<button onClick={()=>add(q,text)}>+ Retenir</button>}</div>
    })}</div>}
    {selected.length>0&&<div className="selected-actions">{selected.map(a=>{
      const g=reflexData(q,a.action_text);
      return <div className="selected-action" key={a.id}><textarea value={a.action_text} onChange={e=>patch(a,"actionText",e.target.value)}/><div className="action-fields"><select value={a.priority} onChange={e=>patch(a,"priority",e.target.value)}>{["P1","P2","P3","P4"].map(x=><option key={x}>{x}</option>)}</select><select value={a.actor||""} onChange={e=>patch(a,"actor",e.target.value)}><option value="">Pilote à définir</option>{(q.corrective_actors||[]).map(x=><option key={x}>{x}</option>)}</select><select value={a.period||""} onChange={e=>patch(a,"period",e.target.value)}><option value="">Période</option>{(q.corrective_deadlines||[]).map(x=><option key={x}>{x}</option>)}</select><input type="date" value={a.target_date||""} onChange={e=>patch(a,"targetDate",e.target.value)}/><select value={a.status} onChange={e=>patch(a,"status",e.target.value)}><option value="A_LANCER">À lancer</option><option value="PREPARATION">Préparation</option><option value="EN_COURS">En cours</option><option value="REALISEE">Réalisée</option></select></div><details className="reflex-inline"><summary>Fiche réflexe / mise en œuvre</summary><div className="reflex-grid"><section><h5>Avant d’agir</h5><ul>{g.before.map(x=><li key={x}>{x}</li>)}</ul></section><section><h5>À faire</h5><ul>{g.do.map(x=><li key={x}>{x}</li>)}</ul></section><section><h5>Contrôles de fin</h5><ul>{g.check.map(x=><li key={x}>{x}</li>)}</ul></section><section><h5>Preuves à conserver</h5><ul>{g.evidence.map(x=><li key={x}>{x}</li>)}</ul></section></div></details></div>
    })}</div>}
   </article>
 })}</div></section>
}
function Workshops({data,campaignId,reload,onOpenOnf}:{data:PilotageData;campaignId:string;reload:()=>Promise<void>;onOpenOnf?:()=>void}){
 const [selected,setSelected]=useState(1);
 const [editing,setEditing]=useState<WorkshopSession|null>(null);
 const w=workshops[selected-1];
 const sessions=(data.workshopSessions||[]).filter(s=>s.workshop_no===selected);
 const latest=sessions[0];
 const statusLabel=(s?:WorkshopSession["status"])=>s==="A_PREPARER"?"À préparer":s==="EN_COURS"?"En cours":s==="TERMINEE"?"Session terminée":s==="A_REINTERROGER"?"À réinterroger":"Jamais réalisé";
 function fresh(kind:"INITIALISATION"|"REEXAMEN"){
   const today=new Date().toISOString().slice(0,10);
   setEditing({id:"",campaign_id:campaignId,workshop_no:selected,session_kind:kind,status:"A_PREPARER",session_date:today,next_review_date:null,reason:kind==="REEXAMEN"?"Réinterrogation en cours d’année":"Démarrage du PCIF",participants:"",notes:"",decisions:"",deliverable:"",exit_criteria:{},updated_at:""} as WorkshopSession)
 }
 async function save(){
   if(!editing)return;
   const payload={workshopNo:selected,sessionKind:editing.session_kind,status:editing.status,sessionDate:editing.session_date,
     nextReviewDate:editing.next_review_date||null,reason:editing.reason,participants:editing.participants,notes:editing.notes,
     decisions:editing.decisions,deliverable:editing.deliverable,exitCriteria:editing.exit_criteria};
   if(editing.id)await api.updateWorkshopSession(campaignId,editing.id,payload);else await api.createWorkshopSession(campaignId,payload);
   setEditing(null);await reload();
 }
 function patch(k:keyof WorkshopSession,v:any){if(editing)setEditing({...editing,[k]:v})}
 return <section className="workshops-v2">
  <div className="section-title"><div><h2>Ateliers PCIF · 4 × 60 minutes</h2><p>À utiliser pour lancer le PCIF ou pour le réinterroger pendant l’année. Chaque session est datée et conservée.</p></div></div>
  <div className="workshop-selector">{workshops.map((x,i)=>{
    const no=i+1,ss=(data.workshopSessions||[]).filter(s=>s.workshop_no===no),last=ss[0];
    return <button className={selected===no?"active":""} onClick={()=>{setSelected(no);setEditing(null)}} key={no}>
      <span>ATELIER {no}</span><em>{statusLabel(last?.status)}</em><h3>{x.title}</h3><p>{x.subtitle}</p><b>Livrable : <strong>{x.deliverable}</strong></b>
      {last&&<small>Dernière session : {last.session_date}{last.next_review_date?` · revue ${last.next_review_date}`:""}</small>}
    </button>
  })}</div>
  <article className="workshop-detail">
   <header><div><h2>Atelier {selected}/4 — {w.title}</h2><p><b>Livrable :</b> {w.deliverable}</p></div><div className="workshop-actions"><button className="primary" onClick={()=>fresh(sessions.length?"REEXAMEN":"INITIALISATION")}>{sessions.length?"+ Nouvelle session de réexamen":"+ Démarrer l’atelier"}</button></div></header>
   <div className="workshop-timeline">{w.phases.map(([time,label])=><div key={time+label}><b>{time}</b><span>{label}</span></div>)}</div>
   {selected===1&&<div className="workshop-facilitation">
    <div className="facilitation-head"><div><span>FIL D’ANIMATION · 60 MIN</span><h3>Produire l’ONF pendant l’atelier</h3><p>Décrire l’organisation telle qu’elle fonctionne réellement. Les écarts constatés sont repérés, pas résolus prématurément : ils alimenteront les ateliers suivants.</p></div>{onOpenOnf&&<button className="primary" onClick={onOpenOnf}>Ouvrir l’ONF →</button>}</div>
    <div className="facilitation-grid">
     <article><b>0–5 min · Cadrer</b><p>Présenter le livrable et la règle du jeu : décrire le réel, pas l’organisation théorique.</p><small>Sortie : objectif partagé.</small></article>
     <article><b>5–15 min · Identifier</b><p>« Qui intervient aujourd’hui dans la chaîne financière ? » Ajouter les personnes effectivement impliquées.</p><small>Sortie : acteurs nominatifs.</small></article>
     <article><b>15–30 min · Affecter</b><p>Pour chaque acteur : réalise, prépare, contrôle, valide ou décide ? Rester au niveau des responsabilités, sans détailler encore les procédures.</p><small>Sortie : responsabilités affectées.</small></article>
     <article><b>30–40 min · Formaliser</b><p>Repérer les délégations et habilitations. Question réflexe : « Sur quel fondement cette personne agit-elle ? »</p><small>Sortie : délégations renseignées ou à confirmer.</small></article>
     <article><b>40–50 min · Tester</b><p>« Si X est absent trois semaines, qui reprend ? » Tester la continuité sur les acteurs et opérations clés.</p><small>Sortie : suppléances et zones non couvertes.</small></article>
     <article><b>50–57 min · Vérifier</b><p>Lancer le contrôle de cohérence : responsabilité sans acteur, acteur sans rôle clair, doublon, délégation ou suppléance manquante.</p><small>Sortie : anomalies factuelles repérées.</small></article>
     <article><b>57–60 min · Valider</b><p>« Cet ONF décrit-il honnêtement notre fonctionnement aujourd’hui ? » Corriger si nécessaire puis créer la version datée.</p><small>Sortie : ONF validé.</small></article>
    </div>
    <div className="facilitation-rule"><b>Règle d’animation</b><span>Si la discussion bascule vers « normalement, on devrait… », revenir à : <strong>« Qui le fait aujourd’hui ? »</strong> Les améliorations seront traitées dans les ateliers 2 à 4.</span></div>
   </div>}
   {editing&&<div className="workshop-editor">
    <div className="editor-head"><h3>{editing.id?"Modifier la session":editing.session_kind==="REEXAMEN"?"Nouvelle session de réexamen":"Session initiale"}</h3><button onClick={()=>setEditing(null)}>Fermer</button></div>
    <div className="workshop-form-grid">
      <label>Date<input type="date" value={editing.session_date} onChange={e=>patch("session_date",e.target.value)}/></label>
      <label>Nature<select value={editing.session_kind} onChange={e=>patch("session_kind",e.target.value)}><option value="INITIALISATION">Initialisation</option><option value="REEXAMEN">Réexamen</option></select></label>
      <label>État<select value={editing.status} onChange={e=>patch("status",e.target.value)}><option value="A_PREPARER">À préparer</option><option value="EN_COURS">En cours</option><option value="TERMINEE">Session terminée</option><option value="A_REINTERROGER">À réinterroger</option></select></label>
      <label>Prochaine revue<input type="date" value={editing.next_review_date||""} onChange={e=>patch("next_review_date",e.target.value||null)}/></label>
    </div>
    <label>Motif / déclencheur<input value={editing.reason} onChange={e=>patch("reason",e.target.value)} placeholder="Démarrage du PCIF, changement d’organisation, incident, revue périodique…"/></label>
    <label>Participants<input value={editing.participants} onChange={e=>patch("participants",e.target.value)} placeholder="CE, SGE, agent comptable, fondé de pouvoir, gestionnaire…"/></label>
    <div className="workshop-columns">
      <label><b>Notes et constats</b><textarea value={editing.notes} onChange={e=>patch("notes",e.target.value)} placeholder="Situation de terrain, écarts, points de vigilance…"/></label>
      <label><b>Décisions / arbitrages</b><textarea value={editing.decisions} onChange={e=>patch("decisions",e.target.value)} placeholder="Décisions prises, responsabilités, suites à donner…"/></label>
    </div>
    <div className="exit-box"><h3>Critères de sortie</h3>{w.criteria.map(c=><label key={c}><input type="checkbox" checked={!!editing.exit_criteria[c]} onChange={e=>patch("exit_criteria",{...editing.exit_criteria,[c]:e.target.checked})}/>{c}</label>)}</div>
    <label><b>Livrable / synthèse produite</b><textarea value={editing.deliverable} onChange={e=>patch("deliverable",e.target.value)} placeholder={w.deliverable}/></label>
    <div className="editor-save"><button className="primary" onClick={save}>Enregistrer la session</button></div>
   </div>}
   {!editing&&<div className="workshop-body">
    <div><h3>Critères de sortie attendus</h3><ul>{w.criteria.map(c=><li key={c}>{c}</li>)}</ul></div>
    <div><h3>Historique des sessions</h3>{sessions.length===0?<p className="empty">Aucune session réalisée. L’atelier peut être utilisé pour initialiser le PCIF.</p>:<div className="session-history">{sessions.map(s=><button key={s.id} onClick={()=>setEditing(s)}><span>{s.session_kind==="REEXAMEN"?"Réexamen":"Initialisation"} · {s.session_date}</span><b>{statusLabel(s.status)}</b><small>{s.reason||"Sans motif précisé"}{s.updated_by_name?` · ${s.updated_by_name}`:""}</small></button>)}</div>}</div>
   </div>}
  </article>
 </section>
}
