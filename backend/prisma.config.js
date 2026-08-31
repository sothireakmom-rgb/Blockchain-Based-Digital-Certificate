const path = require("node:path");
const { defineConfig } = require("prisma/config");

// Load .env before the config object is built.
require("dotenv").config();

// Read straight from process.env rather than Prisma's strict `env()` helper,
// so `prisma generate` still works before a database URL has been filled in.
// `prisma migrate` will fail with a clear connection error if these are empty.
module.exports = defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    // CLI-only connection (migrate, db push, studio). It MUST be the direct
    // session connection (port 5432): `prisma migrate` takes a Postgres
    // advisory lock, which Supabase's transaction pooler (6543) cannot hold,
    // so migrating through the pooled URL hangs indefinitely.
    //
    // The runtime client does not use this value at all - it connects through
    // the driver adapter in src/lib/prisma.js, which uses DATABASE_URL.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
