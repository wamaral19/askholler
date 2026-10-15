/**
 * Operator administration for Google-sign-in workforce access. There is no
 * membership UI for the pilot; every grant is made here and takes effect on
 * the user's next request.
 *
 *   npm run workforce -- list
 *   npm run workforce -- add person@withholler.com
 *   npm run workforce -- grant person@withholler.com <merchantId> research_manager
 *   npm run workforce -- revoke person@withholler.com <merchantId> research_manager
 *   npm run workforce -- disable person@withholler.com
 *
 * Reads DATABASE_URL from the shell, falling back to .env.local. `disable`
 * also ends every open session for that user.
 */
import { existsSync } from "node:fs";

import { createDatabase } from "@holler/db";
import { workforceRoles, type WorkforceRole } from "@holler/domain";

import { WorkforceDirectory } from "../apps/web/app/lib/workforce-directory.server";

if (!process.env.DATABASE_URL && existsSync(".env.local"))
  process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const [command, email, merchantId, role] = process.argv.slice(2);
const { db, pool } = createDatabase(process.env.DATABASE_URL);
const directory = new WorkforceDirectory(db);

function requireRole(value: string | undefined): WorkforceRole {
  if (!workforceRoles.includes(value as WorkforceRole))
    throw new Error(`Role must be one of: ${workforceRoles.join(", ")}`);
  return value as WorkforceRole;
}

function requireArgs(...values: (string | undefined)[]): void {
  if (values.some((value) => !value))
    throw new Error("Missing arguments; see the usage in scripts/workforce.ts");
}

try {
  switch (command) {
    case "list":
      for (const user of await directory.listUsers())
        console.info(
          `${user.email ?? "(no email)"}  ${user.status}  last sign-in: ${
            user.lastLoginAt?.toISOString() ?? "never"
          }\n${user.grants
            .map((grant) => `    ${grant.merchantId}  ${grant.role}`)
            .join("\n")}`,
        );
      break;
    case "add":
      requireArgs(email);
      console.info(`Active: ${await directory.provisionUser(email!)}`);
      break;
    case "grant":
      requireArgs(email, merchantId);
      await directory.grantRole(email!, merchantId!, requireRole(role));
      console.info("Granted.");
      break;
    case "revoke":
      requireArgs(email, merchantId);
      await directory.revokeRole(email!, merchantId!, requireRole(role));
      console.info("Revoked.");
      break;
    case "disable":
      requireArgs(email);
      await directory.disableUser(email!);
      console.info("Disabled; open sessions revoked.");
      break;
    default:
      throw new Error(
        "Usage: npm run workforce -- list|add|grant|revoke|disable ...",
      );
  }
} finally {
  await pool.end();
}
