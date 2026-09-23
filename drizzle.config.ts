import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run Drizzle database commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/generated",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
