CREATE TABLE IF NOT EXISTS shared_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('PLATFORM','ACADEMY','DEPARTMENT','AGENCY')),
  scope_key text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  url text NOT NULL,
  image_url text,
  category text NOT NULL DEFAULT 'RESSOURCE',
  provider text NOT NULL DEFAULT '',
  duration text,
  status text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_resources_scope_idx ON shared_resources(scope_type,scope_key,status,sort_order);

INSERT INTO shared_resources(scope_type,scope_key,title,description,url,image_url,category,provider,duration,status,sort_order)
SELECT 'PLATFORM','*',v.title,v.description,v.url,v.image_url,'FORMATION',v.provider,v.duration,'PUBLISHED',v.ord
FROM (VALUES
 ('Sensibilisation à la responsabilité des gestionnaires publics (RGP)','Comprendre les principes de la RGP et leurs conséquences dans les pratiques professionnelles.','https://mentor.gouv.fr/catalog/3654','https://mentor.gouv.fr/pluginfile.php/1386611/local_trainings/thumbnail/3654/Banniere_RGP.png','École nationale des finances publiques','1 h',10),
 ('Acculturation au contrôle interne et à la maîtrise des risques','Acquérir les notions essentielles du contrôle interne et de la maîtrise des risques.','https://mentor.gouv.fr/catalog/1012','https://mentor.gouv.fr/pluginfile.php/436357/local_trainings/thumbnail/1012/241014%20VARIATION%20VIGNETTE%20CIMR.png','CFMD · Ministère des Armées','3 h',20),
 ('30 minutes pour comprendre la démarche qualité','Découvrir les bases, les étapes et les outils d’une démarche qualité.','https://mentor.gouv.fr/catalog/503','https://mentor.gouv.fr/pluginfile.php/127631/local_trainings/thumbnail/503/Fiche30mind%C3%A9marchequalit%C3%A9600X400.png','Ministère de la Transition écologique','30 min',30),
 ('Fondamentaux d''une démarche de contrôle de gestion','S’initier aux notions et outils du contrôle de gestion et au pilotage de la performance.','https://mentor.gouv.fr/catalog/205','https://mentor.gouv.fr/pluginfile.php/24160/local_trainings/thumbnail/205/vignette%20mentor.png','IRA de Nantes','1 h 30',40)
) AS v(title,description,url,image_url,provider,duration,ord)
WHERE NOT EXISTS (SELECT 1 FROM shared_resources r WHERE r.url=v.url AND r.scope_type='PLATFORM' AND r.scope_key='*');
