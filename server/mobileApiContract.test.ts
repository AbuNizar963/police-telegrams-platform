import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mobileLib = join(repositoryRoot, "mobile", "lib");

function listDartFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory()
      ? listDartFiles(entryPath)
      : entryPath.endsWith(".dart")
        ? [entryPath]
        : [];
  });
}

function listProcedurePaths(record: unknown, prefix = ""): string[] {
  if (!record || typeof record !== "object") return [];

  return Object.entries(record).flatMap(([name, value]) => {
    const path = prefix ? `${prefix}.${name}` : name;
    if (typeof value === "function" && "_def" in value) return [path];
    return listProcedurePaths(value, path);
  });
}

function listMobileProcedureCalls(): Map<string, string[]> {
  const calls = new Map<string, string[]>();
  const callPattern =
    /\b(?:call|readCachedResponse)\(\s*['"]([A-Za-z][A-Za-z0-9_.]+)['"]/g;

  for (const file of listDartFiles(mobileLib)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(callPattern)) {
      const procedure = match[1];
      const locations = calls.get(procedure) ?? [];
      locations.push(relative(repositoryRoot, file));
      calls.set(procedure, locations);
    }
  }

  return calls;
}

describe("Flutter mobile API contract", () => {
  it("keeps every statically named mobile tRPC call registered by the server", () => {
    const serverProcedures = new Set(listProcedurePaths(appRouter._def.record));
    const missing = [...listMobileProcedureCalls()]
      .filter(([procedure]) => !serverProcedures.has(procedure))
      .map(([procedure, files]) => ({ procedure, files: [...new Set(files)] }));

    expect(missing).toEqual([]);
  });
});
