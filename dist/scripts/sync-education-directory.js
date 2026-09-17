import { pool } from "../src/db.js";
const endpoint = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records";
const base = `etat='OUVERT' AND statut_public_prive='Public' AND (type_etablissement='Collège' OR type_etablissement='Lycée' OR type_etablissement='EREA')`;
async function json(url) { const response = await fetch(url, { headers: { "user-agent": "PCIF-Academie/0.20 (+https://pcif.eple-tools.fr)" } }); if (!response.ok)
    throw new Error(`Annuaire Éducation indisponible (${response.status})`); return response.json(); }
const academyUrl = new URL(endpoint);
academyUrl.searchParams.set("select", "code_academie");
academyUrl.searchParams.set("where", base);
academyUrl.searchParams.set("group_by", "code_academie");
academyUrl.searchParams.set("limit", "100");
const academies = (await json(academyUrl)).results.map((x) => String(x.code_academie)).filter(Boolean);
let total = 0;
for (const academy of academies) {
    let offset = 0;
    for (;;) {
        const url = new URL(endpoint);
        url.searchParams.set("where", `${base} AND code_academie='${academy.replace(/'/g, "''")}'`);
        url.searchParams.set("limit", "100");
        url.searchParams.set("offset", String(offset));
        const body = await json(url), records = body.results || [];
        for (const r of records) {
            const uai = String(r.identifiant_de_l_etablissement || "").toUpperCase();
            if (!/^[0-9A-Z]{8}$/.test(uai))
                continue;
            await pool.query(`INSERT INTO education_directory(uai,name,establishment_type,nature_label,public_private,address,postal_code,city,email,department_code,department_name,academy_code,academy_name,siret,source_updated_at,synced_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now()) ON CONFLICT(uai) DO UPDATE SET name=excluded.name,establishment_type=excluded.establishment_type,nature_label=excluded.nature_label,public_private=excluded.public_private,address=excluded.address,postal_code=excluded.postal_code,city=excluded.city,email=excluded.email,department_code=excluded.department_code,department_name=excluded.department_name,academy_code=excluded.academy_code,academy_name=excluded.academy_name,siret=excluded.siret,source_updated_at=excluded.source_updated_at,synced_at=now()`, [uai, r.nom_etablissement, r.type_etablissement, r.libelle_nature, r.statut_public_prive, [r.adresse_1, r.adresse_2, r.adresse_3].filter(Boolean).join(", "), r.code_postal, r.nom_commune, r.mail, r.code_departement, r.libelle_departement, r.code_academie, r.libelle_academie, r.siren_siret, r.date_maj_ligne || null]);
            total++;
        }
        offset += records.length;
        if (!records.length || offset >= Number(body.total_count || 0))
            break;
    }
}
console.log(`Annuaire Éducation synchronisé : ${total} établissements secondaires publics.`);
await pool.end();
