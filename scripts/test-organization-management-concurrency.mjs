import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const apiUrl = process.env.API_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey =
  process.env.SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SECRET_KEY;

if (!apiUrl || !serviceRoleKey) {
  throw new Error("Supabase API_URL and SERVICE_ROLE_KEY are required");
}

const hostname = new URL(apiUrl).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
  throw new Error(
    `Refusing to write test fixtures outside a local Supabase instance (${hostname})`
  );
}

const supabase = createClient(apiUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
const organizationIds = [];

function assertNoError(result, operation) {
  if (result.error) {
    throw new Error(`${operation}: ${result.error.message}`);
  }
  return result.data;
}

async function createOrganization(label, type = "department") {
  const data = assertNoError(
    await supabase
      .from("organizations")
      .insert({
        code: `TEST-${suffix}-${label}`,
        name: `Test ${label} ${suffix}`,
        type,
        parentOrganizationId: null,
      })
      .select("id")
      .single(),
    `create ${label}`
  );
  organizationIds.push(data.id);
  return data.id;
}

function settingsPayload(overrides = {}) {
  return {
    departmentName: `Test Settings ${suffix}`,
    unitName: "Concurrency Test Unit",
    unitChiefRank: "Captain",
    unitChiefName: "Test Chief",
    serialPrefix: "OUT",
    incomingSerialPrefix: "IN",
    serialStart: 100,
    incomingSerialStart: 300,
    nextSerial: 100,
    nextOutgoingSerial: 100,
    nextIncomingSerial: 300,
    timezone: "Asia/Damascus",
    dateFormat: "dd/MM/yyyy HH:mm:ss",
    numberSystem: "latin",
    logoUrl: null,
    updatedByUserId: null,
    ...overrides,
  };
}

async function saveSettings(organizationId, settingsId, payload) {
  return supabase.rpc("save_department_settings_atomic", {
    p_settings_id: settingsId,
    p_organization_id: organizationId,
    p_settings: payload,
  });
}

async function cleanup() {
  if (organizationIds.length === 0) return;

  for (const organizationId of organizationIds) {
    const { error } = await supabase
      .from("department_settings")
      .delete()
      .eq("organizationId", organizationId);
    if (error) throw new Error(`cleanup settings: ${error.message}`);
  }

  const reset = await supabase
    .from("organizations")
    .update({ type: "department", parentOrganizationId: null })
    .in("id", organizationIds);
  if (reset.error)
    throw new Error(`cleanup organization links: ${reset.error.message}`);

  const removed = await supabase
    .from("organizations")
    .delete()
    .in("id", organizationIds);
  if (removed.error)
    throw new Error(`cleanup organizations: ${removed.error.message}`);
}

try {
  const rootCountResult = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .eq("type", "central");
  assertNoError(rootCountResult, "count central roots");

  if ((rootCountResult.count ?? 0) === 0) {
    const first = await createOrganization("ROOT-A");
    const second = await createOrganization("ROOT-B");
    const rootAttempts = await Promise.all(
      [first, second].map(organizationId =>
        supabase
          .from("organizations")
          .update({ type: "central", parentOrganizationId: null })
          .eq("id", organizationId)
          .select("id")
          .maybeSingle()
      )
    );
    assert.equal(
      rootAttempts.filter(result => !result.error).length,
      1,
      "exactly one of two concurrent central-root writes must succeed"
    );
    assert.ok(
      rootAttempts.some(result => result.error),
      "the competing central-root write must be rejected by the database"
    );
  } else {
    console.log(
      "Concurrent central-root test skipped: a central root already exists"
    );
  }

  const cycleA = await createOrganization("CYCLE-A");
  const cycleB = await createOrganization("CYCLE-B");
  const cycleAttempts = await Promise.all([
    supabase
      .from("organizations")
      .update({ parentOrganizationId: cycleB })
      .eq("id", cycleA)
      .select("id")
      .maybeSingle(),
    supabase
      .from("organizations")
      .update({ parentOrganizationId: cycleA })
      .eq("id", cycleB)
      .select("id")
      .maybeSingle(),
  ]);
  assert.equal(
    cycleAttempts.filter(result => !result.error).length,
    1,
    "exactly one of two concurrent reciprocal-parent writes must succeed"
  );
  assert.ok(
    cycleAttempts.some(result => result.error),
    "the update that creates a cycle must be rejected by the database"
  );
  const links = assertNoError(
    await supabase
      .from("organizations")
      .select("id,parentOrganizationId")
      .in("id", [cycleA, cycleB]),
    "read resulting hierarchy"
  );
  assert.ok(
    !(
      links.find(row => row.id === cycleA)?.parentOrganizationId === cycleB &&
      links.find(row => row.id === cycleB)?.parentOrganizationId === cycleA
    ),
    "the resulting organization hierarchy must remain acyclic"
  );

  const settingsOrganizationId = await createOrganization("SETTINGS");
  const initialWrites = await Promise.all([
    saveSettings(settingsOrganizationId, null, settingsPayload()),
    saveSettings(settingsOrganizationId, null, settingsPayload()),
  ]);
  assert.ok(
    initialWrites.every(result => !result.error),
    "both concurrent initial settings upserts must succeed"
  );
  assert.equal(
    Number(initialWrites[0].data),
    Number(initialWrites[1].data),
    "concurrent initial saves must return the same settings row"
  );
  const settingsId = Number(initialWrites[0].data);
  const rows = assertNoError(
    await supabase
      .from("department_settings")
      .select("id")
      .eq("organizationId", settingsOrganizationId),
    "count settings rows"
  );
  assert.equal(
    rows.length,
    1,
    "one settings row must exist for the organization"
  );

  const firstOutgoing = assertNoError(
    await supabase.rpc("allocate_organization_serial", {
      p_organization_id: settingsOrganizationId,
      p_direction: "outgoing",
    }),
    "allocate first outgoing serial"
  );
  const firstIncoming = assertNoError(
    await supabase.rpc("allocate_organization_serial", {
      p_organization_id: settingsOrganizationId,
      p_direction: "incoming",
    }),
    "allocate first incoming serial"
  );
  assert.equal(Number(firstOutgoing), 100);
  assert.equal(Number(firstIncoming), 300);

  const [nextOutgoing, nextIncoming, staleSettingsSave] = await Promise.all([
    supabase.rpc("allocate_organization_serial", {
      p_organization_id: settingsOrganizationId,
      p_direction: "outgoing",
    }),
    supabase.rpc("allocate_organization_serial", {
      p_organization_id: settingsOrganizationId,
      p_direction: "incoming",
    }),
    saveSettings(settingsOrganizationId, settingsId, settingsPayload()),
  ]);
  assert.equal(
    Number(assertNoError(nextOutgoing, "allocate concurrent outgoing serial")),
    101
  );
  assert.equal(
    Number(assertNoError(nextIncoming, "allocate concurrent incoming serial")),
    301
  );
  assertNoError(
    staleSettingsSave,
    "save stale settings concurrently with allocation"
  );

  const finalSettings = assertNoError(
    await supabase
      .from("department_settings")
      .select("nextOutgoingSerial,nextIncomingSerial")
      .eq("id", settingsId)
      .single(),
    "read final allocation counters"
  );
  assert.equal(
    finalSettings.nextOutgoingSerial,
    102,
    "settings save must not roll the outgoing counter backwards"
  );
  assert.equal(
    finalSettings.nextIncomingSerial,
    302,
    "settings save must not roll the incoming counter backwards"
  );

  console.log("Concurrent organization/settings integrity checks passed");
} finally {
  await cleanup();
}
