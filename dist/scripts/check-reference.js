import { pool } from "../src/db.js";
const client = await pool.connect();
try {
    await client.query("BEGIN");
    const rv = (await client.query(`
   SELECT rv.id FROM repository_versions rv
   JOIN repositories r ON r.id=rv.repository_id
   WHERE rv.version='PCIF-267-2026.09'
   ORDER BY rv.active DESC,rv.published_at DESC NULLS LAST LIMIT 1`)).rows[0];
    if (!rv)
        throw new Error("Référentiel PCIF-267-2026.09 absent.");
    const count = (await client.query(`SELECT count(*)::int n FROM questions WHERE repository_version_id=$1 AND active=true`, [rv.id])).rows[0].n;
    if (count !== 267)
        throw new Error(`Référentiel réglementaire invalide : ${count}/267 questions.`);
    const wrong = await client.query(`
   SELECT c.id,c.label,e.uai,rv.version,
          (SELECT count(*)::int FROM questions q WHERE q.repository_version_id=c.repository_version_id AND q.active=true) question_count
   FROM campaigns c
   JOIN establishments e ON e.id=c.establishment_id
   JOIN repository_versions rv ON rv.id=c.repository_version_id
   WHERE c.status IN ('DRAFT','OPEN','REVIEW') AND c.repository_version_id<>$1`, [rv.id]);
    if (wrong.rowCount) {
        console.warn(`${wrong.rowCount} campagne(s) active(s) utilisent un ancien référentiel.`);
        for (const c of wrong.rows)
            console.warn(`- ${c.uai} · ${c.label} · ${c.version} · ${c.question_count} questions`);
        console.warn("Aucune migration automatique hors comptes de démonstration : correction administrative requise pour préserver les données.");
    }
    else {
        console.log("Conformité référentiel : toutes les campagnes actives utilisent PCIF-267-2026.09 (267 questions).");
    }
    await client.query("COMMIT");
}
catch (e) {
    await client.query("ROLLBACK");
    throw e;
}
finally {
    client.release();
    await pool.end();
}
