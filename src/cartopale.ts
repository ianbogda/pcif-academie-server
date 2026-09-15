export type CartopaleSave = {
  etab: Record<string,string>;
  answers: Record<string,number>;
  obs: Record<string,string>;
  plans: Record<string,Array<Record<string,string>>>;
};

function safeJson(value:unknown){
  return JSON.stringify(value).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
}
function html(value:string){return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!))}

export function buildCartopaleHtml(save:CartopaleSave,meta:{campaignLabel:string;answerCount:number;exportedAt:string}){
  const title=`PCIF Académie → CARTOP@LE — ${meta.campaignLabel}`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title>
<style>body{font-family:Arial,sans-serif;max-width:850px;margin:48px auto;padding:0 24px;color:#17365d}h1{font-size:26px}p{line-height:1.55}.card{border:1px solid #cbd5e1;border-left:5px solid #1477bd;border-radius:10px;padding:18px;background:#f8fafc}.meta{color:#64748b;font-size:13px}code{background:#e2e8f0;padding:2px 5px;border-radius:4px}</style></head><body>
<h1>Export PCIF Académie pour CARTOP@LE</h1><div class="card"><p>Ce fichier est destiné à être importé depuis la fonction <strong>« Importer »</strong> de CARTOP@LE.</p><p><strong>Campagne :</strong> ${html(meta.campaignLabel)}<br><strong>Établissement :</strong> ${html(save.etab.name||"")} (${html(save.etab.uai||"")})<br><strong>Réponses exportées :</strong> ${meta.answerCount}</p></div>
<p class="meta">Export généré le ${html(meta.exportedAt)}. Le bloc <code>EMBEDDED_SAVE</code> ci-dessous constitue la donnée d’import.</p>
<script>var EMBEDDED_SAVE = ${safeJson(save)}; // CARTOPALE_EMBEDDED_SAVE_v1
</script></body></html>`;
}

export function cartopaleFilename(uai:string,campaignLabel:string,date:string){
  const clean=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"");
  return `PCIF_Academie_vers_CARTOPALE_${clean(uai||"etablissement")}_${clean(campaignLabel)}_${date}.html`;
}
