"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { DatabaseSync } = require("node:sqlite");

const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, "data", "commission.db"));
const adminName = process.env.ADMIN_NAME || "DIASSY";

function readSecret(prompt) {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== "function") {
        return Promise.reject(new Error("Lancez cette commande depuis un terminal interactif."));
    }

    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    process.stdout.write(prompt);

    return new Promise((resolve, reject) => {
        let value = "";
        const finish = (error, result) => {
            input.removeListener("keypress", onKeypress);
            input.setRawMode(false);
            process.stdout.write("\n");
            if (error) reject(error);
            else resolve(result);
        };
        const onKeypress = (character, key = {}) => {
            if (key.ctrl && key.name === "c") {
                finish(new Error("Opération annulée."));
            } else if (key.name === "return" || key.name === "enter") {
                finish(null, value);
            } else if (key.name === "backspace") {
                value = Array.from(value).slice(0, -1).join("");
            } else if (character && !key.ctrl && !key.meta) {
                value += character;
            }
        };
        input.on("keypress", onKeypress);
    });
}

async function main() {
    if (!fs.existsSync(dbPath)) {
        throw new Error(`Base de données introuvable : ${dbPath}`);
    }

    const db = new DatabaseSync(dbPath);
    try {
        db.exec("pragma busy_timeout=5000");
        const admin = db.prepare("select id,name from users where name=? and role='admin'").get(adminName);
        if (!admin) {
            throw new Error(`Aucun compte administrateur « ${adminName} » trouvé dans cette base.`);
        }

        process.stdout.write(`Réinitialisation du compte administrateur ${admin.name} dans ${dbPath}\n`);
        const password = await readSecret("Nouveau mot de passe (8 à 128 caractères, saisie masquée) : ");
        if (password.length < 8 || password.length > 128) {
            throw new Error("Le mot de passe doit contenir entre 8 et 128 caractères.");
        }
        const confirmation = await readSecret("Confirmez le nouveau mot de passe : ");
        if (password !== confirmation) {
            throw new Error("Les mots de passe ne correspondent pas.");
        }

        const salt = crypto.randomBytes(16).toString("hex");
        const hash = `${salt}:${crypto.scryptSync(password, salt, 32).toString("hex")}`;
        db.exec("begin immediate");
        try {
            const result = db.prepare("update users set hash=? where id=? and role='admin'").run(hash, admin.id);
            if (result.changes !== 1) throw new Error("Le compte administrateur a changé ; aucune modification effectuée.");
            db.prepare("delete from sessions where uid=?").run(admin.id);
            db.prepare("insert into audit values(?,?,?,?,?)").run(
                new Date().toISOString(),
                admin.name,
                "réinitialiser le mot de passe administrateur",
                "users",
                admin.name
            );
            db.exec("commit");
        } catch (error) {
            db.exec("rollback");
            throw error;
        }
        process.stdout.write("Mot de passe réinitialisé. Connectez-vous avec le nouveau mot de passe.\n");
    } finally {
        db.close();
    }
}

main().catch(error => {
    process.stderr.write(`Échec de la réinitialisation : ${error.message}\n`);
    process.exitCode = 1;
});
