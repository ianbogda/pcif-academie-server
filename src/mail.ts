import nodemailer from "nodemailer";
import {createHash,randomBytes} from "node:crypto";
import {pool} from "./db.js";

function required(name:string){const value=process.env[name]?.trim();if(!value)throw new Error(`Configuration email manquante : ${name}`);return value}

function transport(){
 return nodemailer.createTransport({
  host:required("SMTP_HOST"),port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==="true",
  auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:required("SMTP_PASSWORD")}:undefined
 });
}

export function publicUrl(){return required("PUBLIC_APP_URL").replace(/\/$/,"")}

export function tokenHash(token:string){return createHash("sha256").update(token).digest("hex")}

export async function issuePasswordToken(userId:string,purpose:"ACTIVATION"|"RESET"){
 const token=randomBytes(32).toString("base64url");
 await pool.query(`UPDATE password_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`,[userId]);
 await pool.query(`INSERT INTO password_tokens(user_id,token_hash,purpose,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')`,[userId,tokenHash(token),purpose]);
 return token;
}

export async function sendPasswordLink(to:string,name:string,token:string,purpose:"ACTIVATION"|"RESET"){
 const activation=purpose==="ACTIVATION",url=`${publicUrl()}/?resetToken=${encodeURIComponent(token)}&mode=${activation?"activate":"reset"}`;
 const safeName=name.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
 const title=activation?"Activez votre compte PCIF Académie":"Réinitialisez votre mot de passe PCIF Académie";
 const intro=activation?"Un compte PCIF Académie vient d’être créé pour vous.":"Une demande de réinitialisation de votre mot de passe a été reçue.";
 await transport().sendMail({from:process.env.SMTP_FROM||required("SMTP_USER"),to,subject:title,text:`Bonjour ${name},\n\n${intro}\n\nOuvrez ce lien valable une heure :\n${url}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.\n\nPCIF Académie`,html:`<div style="font:15px Arial;max-width:620px;color:#172033"><h2 style="color:#2563eb">${title}</h2><p>Bonjour ${safeName},</p><p>${intro}</p><p><a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:7px;text-decoration:none;font-weight:bold">${activation?"Définir mon mot de passe":"Choisir un nouveau mot de passe"}</a></p><p>Ce lien est personnel, utilisable une seule fois et valable une heure.</p><p style="color:#667085;font-size:12px">Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.</p></div>`});
}
