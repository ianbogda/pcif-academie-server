import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, clearToken, getToken, setToken, type Campaign, type Establishment, type Me, type Question } from "./api";
import "./styles.css";

type View =
  | { kind: "home" }
  | { kind: "establishment"; establishment: Establishment }
  | { kind: "campaign"; campaign: Campaign };

const demoAccounts = [
  ["Administrateur", "admin@example.test", "ChangeMe-ADMIN-2026!"],
  ["Agent comptable", "ac@example.test", "ChangeMe-AC-2026!"],
  ["Fondé de pouvoir", "fp@example.test", "ChangeMe-FP-2026!"],
  ["Chef d'établissement", "ce@example.test", "ChangeMe-CE-2026!"],
  ["SGE", "sge@example.test", "ChangeMe-SGE-2026!"]
] as const;

function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [view, setView] = useState<View>({ kind: "home" });
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [fatal, setFatal] = useState("");

  async function loadSession() {
    setLoading(true);
    try {
      const data = await api.me();
      setMe(data);
      setFatal("");
    } catch {
      clearToken();
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (getToken()) loadSession();
    else setLoading(false);
  }, []);

  if (loading) return <Splash />;
  if (!me) return <Login onAuthenticated={loadSession} />;
  if (fatal) return <div className="fatal">{fatal}</div>;

  const logout = () => {
    clearToken();
    setMe(null);
    setView({ kind: "home" });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView({ kind: "home" })}>
          <span className="brand-mark">P</span>
          <span><strong>PCIF Académie</strong><small>Contrôle interne financier collaboratif</small></span>
        </button>
        <div className="user-zone">
          <div>
            <strong>{me.user.displayName}</strong>
            <small>{me.user.email}</small>
          </div>
          <button className="btn ghost" onClick={logout}>Déconnexion</button>
        </div>
      </header>

      <main className="main">
        {view.kind === "home" && <Home me={me} onOpen={(e) => setView({ kind: "establishment", establishment: e })} />}
        {view.kind === "establishment" && (
          <EstablishmentPage
            establishment={view.establishment}
            onBack={() => setView({ kind: "home" })}
            onOpenCampaign={(c) => setView({ kind: "campaign", campaign: c })}
          />
        )}
        {view.kind === "campaign" && (
          <CampaignPage
            campaign={view.campaign}
            me={me}
            onBack={async () => {
              const e = (await api.establishments()).find(x => x.id === view.campaign.establishment_id);
              if (e) setView({ kind: "establishment", establishment: e });
              else setView({ kind: "home" });
            }}
          />
        )}
      </main>
    </div>
  );
}

function Splash() {
  return <div className="splash"><div className="spinner" /><strong>PCIF Académie</strong></div>;
}

function Login({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [email, setEmail] = useState("ac@example.test");
  const [password, setPassword] = useState("ChangeMe-AC-2026!");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const result = await api.login(email, password);
      setToken(result.accessToken);
      await onAuthenticated();
    } catch {
      setError("Identifiants incorrects ou compte indisponible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark large">P</span>
          <div><h1>PCIF Académie</h1><p>Plateforme collaborative de contrôle interne financier</p></div>
        </div>
        <form onSubmit={submit}>
          <label>Adresse électronique<input value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>Mot de passe<input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          {error && <div className="alert error">{error}</div>}
          <button className="btn primary wide" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
        </form>
      </section>
      <aside className="demo-card">
        <h2>Comptes de démonstration</h2>
        <p>Cliquer sur un profil pour renseigner le formulaire.</p>
        <div className="demo-list">
          {demoAccounts.map(([label, mail, pwd]) => (
            <button key={mail} onClick={() => { setEmail(mail); setPassword(pwd); }}>
              <strong>{label}</strong><small>{mail}</small>
            </button>
          ))}
        </div>
        <p className="warning">Ces comptes sont exclusivement destinés à la démonstration.</p>
      </aside>
    </div>
  );
}

function Home({ me, onOpen }: { me: Me; onOpen: (e: Establishment) => void }) {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [dashboard, setDashboard] = useState<any[]>([]);
  const [busy, setBusy] = useState(true);
  const isAgencyUser = me.agencies.length > 0;

  useEffect(() => {
    (async () => {
      setBusy(true);
      const ets = await api.establishments();
      setEstablishments(ets);
      if (isAgencyUser) {
        const d = await api.agencyDashboard(me.agencies[0].id);
        setDashboard(d);
      }
      setBusy(false);
    })();
  }, []);

  if (busy) return <PageLoading />;

  if (!isAgencyUser && establishments.length === 1) {
    return (
      <section>
        <Hero title={establishments[0].name} eyebrow="Mon établissement"
          text="Accédez à la campagne PCIF de votre établissement et contribuez aux évaluations." />
        <div className="single-establishment">
          <EstablishmentCard e={establishments[0]} onOpen={onOpen} />
        </div>
      </section>
    );
  }

  return (
    <section>
      <Hero
        eyebrow={isAgencyUser ? "Agence comptable" : "Administration"}
        title={isAgencyUser ? me.agencies[0].name : "PCIF Académie"}
        text={isAgencyUser
          ? "Suivez l’avancement PCIF de l’ensemble des établissements rattachés."
          : "Sélectionnez un établissement accessible."}
      />
      {isAgencyUser && dashboard.length > 0 && (
        <div className="kpi-grid">
          <Kpi label="Établissements" value={String(establishments.length)} />
          <Kpi label="Campagnes actives" value={String(dashboard.filter(x => x.campaign_id).length)} />
          <Kpi label="Avancement moyen" value={`${Math.round(dashboard.reduce((s,x)=>s+Number(x.progress||0),0)/Math.max(dashboard.length,1))}%`} />
        </div>
      )}
      <div className="section-head">
        <div><h2>Établissements</h2><p>{establishments.length} établissement(s) accessible(s)</p></div>
      </div>
      <div className="establishment-grid">
        {establishments.map(e => {
          const d = dashboard.find(x => x.id === e.id);
          return <EstablishmentCard key={e.id} e={e} onOpen={onOpen} progress={d?.progress} />;
        })}
      </div>
    </section>
  );
}

function Hero({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="hero"><span>{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="kpi"><strong>{value}</strong><span>{label}</span></div>;
}

function EstablishmentCard({ e, onOpen, progress }: { e: Establishment; onOpen:(e:Establishment)=>void; progress?: number }) {
  const p = Number(progress ?? 0);
  return (
    <button className="establishment-card" onClick={() => onOpen(e)}>
      <div className="card-top"><span className="kind">{e.kind ?? "EPLE"}</span><span className="uai">{e.uai}</span></div>
      <h3>{e.name}</h3>
      {progress !== undefined && <>
        <div className="progress-line"><span style={{ width: `${Math.min(100,p)}%` }} /></div>
        <small>{p}% d’avancement</small>
      </>}
      <div className="card-action">Ouvrir <span>→</span></div>
    </button>
  );
}

function EstablishmentPage({ establishment, onBack, onOpenCampaign }: {
  establishment: Establishment;
  onBack: () => void;
  onOpenCampaign: (c: Campaign) => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    api.campaigns(establishment.id).then(setCampaigns).finally(() => setBusy(false));
  }, [establishment.id]);

  return (
    <section>
      <Back onClick={onBack} />
      <Hero eyebrow={`${establishment.kind ?? "EPLE"} · ${establishment.uai}`} title={establishment.name}
        text="Campagnes PCIF disponibles pour cet établissement." />
      {busy ? <PageLoading /> : (
        <div className="campaign-list">
          {campaigns.map(c => (
            <button className="campaign-card" key={c.id} onClick={() => onOpenCampaign(c)}>
              <div><span className={`status ${c.status.toLowerCase()}`}>{c.status}</span><h3>{c.label}</h3>
              <p>Référentiel {c.repository_version}</p></div><span className="arrow">→</span>
            </button>
          ))}
          {!campaigns.length && <Empty title="Aucune campagne" text="Aucune campagne PCIF n’est actuellement disponible." />}
        </div>
      )}
    </section>
  );
}

function CampaignPage({ campaign, me, onBack }: { campaign: Campaign; me: Me; onBack: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [busy, setBusy] = useState(true);
  const [domain, setDomain] = useState("TOUS");
  const [sphere, setSphere] = useState("TOUS");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.questions(campaign.id).then(setQuestions).finally(() => setBusy(false));
  }, [campaign.id]);

  const domains = useMemo(() => ["TOUS", ...Array.from(new Set(questions.map(q => q.domain)))], [questions]);
  const filtered = useMemo(() => questions.filter(q =>
    (domain === "TOUS" || q.domain === domain) &&
    (sphere === "TOUS" || q.responsibility === sphere || (sphere === "MIXTE" && q.responsibility === "MIXTE")) &&
    (!query || `${q.code} ${q.label}`.toLowerCase().includes(query.toLowerCase()))
  ), [questions, domain, sphere, query]);

  const answered = questions.filter(q => q.answers.length > 0).length;
  const progress = questions.length ? Math.round(answered * 100 / questions.length) : 0;

  function replaceQuestion(updated: Question) {
    setQuestions(prev => prev.map(q => q.id === updated.id ? updated : q));
  }

  const directRoles = me.establishments
    .filter(e => e.id === campaign.establishment_id)
    .map(e => e.role);
  const agencyRoles = me.agencies.map(a => a.role);
  const canEditOrdonnateur = directRoles.some(r =>
    ["PLATFORM_ADMIN", "HEAD", "SECRETARY_GENERAL", "CONTRIBUTOR"].includes(r)
  );
  const canEditComptable =
    directRoles.includes("PLATFORM_ADMIN") ||
    agencyRoles.some(r => ["AGENCY_ACCOUNTANT", "AGENCY_DEPUTY"].includes(r));
  const canEditSynthese = canEditOrdonnateur || canEditComptable;

  return (
    <section>
      <Back onClick={onBack} />
      <Hero eyebrow={campaign.status} title={campaign.label}
        text={`${answered}/${questions.length || "—"} questions renseignées · ${progress}% d’avancement`} />
      <div className="toolbar">
        <input placeholder="Rechercher une question…" value={query} onChange={e => setQuery(e.target.value)} />
        <select value={domain} onChange={e => setDomain(e.target.value)}>{domains.map(d => <option key={d}>{d}</option>)}</select>
        <select value={sphere} onChange={e => setSphere(e.target.value)}>
          <option value="TOUS">Toutes les sphères</option>
          <option value="ORDONNATEUR">Ordonnateur</option>
          <option value="COMPTABLE">Comptable</option>
          <option value="MIXTE">Mixte</option>
        </select>
      </div>
      {busy ? <PageLoading /> : (
        <div className="question-list">
          {filtered.map(q => (
            <QuestionCard
              key={q.id}
              q={q}
              campaignId={campaign.id}
              onChanged={replaceQuestion}
              permissions={{
                ORDONNATEUR: canEditOrdonnateur,
                COMPTABLE: canEditComptable,
                SYNTHESE: canEditSynthese
              }}
            />
          ))}
          {!filtered.length && <Empty title="Aucune question" text="Aucun résultat avec les filtres sélectionnés." />}
        </div>
      )}
    </section>
  );
}

function QuestionCard({ q, campaignId, onChanged, permissions }: {
  q: Question;
  campaignId: string;
  onChanged: (q: Question) => void;
  permissions: Record<"ORDONNATEUR" | "COMPTABLE" | "SYNTHESE", boolean>;
}) {
  const allowedSpheres = q.responsibility === "MIXTE"
    ? ["ORDONNATEUR", "COMPTABLE", "SYNTHESE"] as const
    : [q.responsibility] as const;

  return (
    <article className="question-card">
      <header>
        <div><span className={`sphere sphere-${q.responsibility.toLowerCase()}`}>{q.responsibility}</span>
          <span className="question-code">{q.code}</span></div>
        <div className="question-meta">Poids {q.weight} · {"★".repeat(q.stars)}{"☆".repeat(3-q.stars)}</div>
      </header>
      <h3>{q.label}</h3>
      <p className="domain">{q.domain}</p>
      <div className="answers-grid">
        {allowedSpheres.map(s => (
          <AnswerEditor
            key={s}
            q={q}
            sphere={s}
            campaignId={campaignId}
            onChanged={onChanged}
            editable={permissions[s]}
          />
        ))}
      </div>
    </article>
  );
}

function AnswerEditor({ q, sphere, campaignId, onChanged }: {
  q: Question;
  sphere: "ORDONNATEUR" | "COMPTABLE" | "SYNTHESE";
  campaignId: string;
  onChanged: (q: Question) => void;
  editable: boolean;
}) {
  const existing = q.answers.find(a => a.sphere === sphere);
  const [value, setValue] = useState<number | null>(existing?.value ?? null);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [state, setState] = useState<"idle"|"saving"|"saved"|"conflict"|"error">("idle");

  useEffect(() => {
    const e = q.answers.find(a => a.sphere === sphere);
    setValue(e?.value ?? null);
    setComment(e?.comment ?? "");
  }, [q.id, q.answers, sphere]);

  async function save() {
    setState("saving");
    try {
      const saved = await api.saveAnswer(campaignId, q.id, {
        sphere, value, comment, version: existing?.version ?? 0
      });
      const newAnswers = [...q.answers.filter(a => a.sphere !== sphere), {
        sphere,
        value: saved.value,
        comment: saved.comment,
        version: saved.version,
        updatedAt: saved.updated_at,
        updatedBy: ""
      }];
      onChanged({ ...q, answers: newAnswers as Question["answers"] });
      setState("saved");
      setTimeout(() => setState("idle"), 1800);
    } catch (e: any) {
      setState(e.status === 409 ? "conflict" : "error");
    }
  }

  return (
    <div className="answer-editor">
      <div className="answer-head">
        <strong>{sphereLabel(sphere)}</strong>
        <span className="answer-head-right">
          {!editable && <small className="readonly">Lecture seule</small>}
          {existing && <small>v{existing.version}</small>}
        </span>
      </div>
      <div className="score-row">
        {[0,1,2,3].map(n => <button key={n} className={value === n ? "score active" : "score"} onClick={() => editable && setValue(n)} disabled={!editable}>{n}</button>)}
        <button className={value === null ? "score active null" : "score null"} onClick={() => editable && setValue(null)} disabled={!editable}>—</button>
      </div>
      <textarea
        value={comment}
        onChange={e => editable && setComment(e.target.value)}
        placeholder="Commentaire…"
        rows={3}
        readOnly={!editable}
      />
      <div className="save-row">
        <span className={`save-state ${state}`}>
          {state === "saving" && "Enregistrement…"}
          {state === "saved" && "Enregistré"}
          {state === "conflict" && "Conflit : rechargez la question"}
          {state === "error" && "Erreur d’enregistrement"}
          {state === "idle" && existing?.updatedBy && `Dernière modification : ${existing.updatedBy}`}
        </span>
        {editable && <button className="btn primary small" onClick={save} disabled={state === "saving"}>Enregistrer</button>}
      </div>
    </div>
  );
}

function sphereLabel(s: string) {
  return s === "ORDONNATEUR" ? "Ordonnateur" : s === "COMPTABLE" ? "Comptable" : "Synthèse";
}
function Back({ onClick }: { onClick: () => void }) {
  return <button className="back" onClick={onClick}>← Retour</button>;
}
function PageLoading() {
  return <div className="page-loading"><div className="spinner" />Chargement…</div>;
}
function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><h3>{title}</h3><p>{text}</p></div>;
}

createRoot(document.getElementById("root")!).render(<App />);
