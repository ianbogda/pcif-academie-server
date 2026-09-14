INSERT INTO roles(code,label)
VALUES ('AUDITOR','Auditeur')
ON CONFLICT(code) DO UPDATE SET label=excluded.label;
