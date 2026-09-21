import { index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/** Core user table backing the Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  badgeNumber: varchar("badgeNumber", { length: 80 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const departmentSettings = mysqlTable("department_settings", {
  id: int("id").autoincrement().primaryKey(),
  configKey: varchar("configKey", { length: 32 }).default("primary").notNull().unique(),
  departmentName: varchar("departmentName", { length: 255 }).default("إدارة الشرطة").notNull(),
  serialStart: int("serialStart").default(1).notNull(),
  nextSerial: int("nextSerial").default(1).notNull(),
  logoUrl: text("logoUrl"),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const telegrams = mysqlTable(
  "telegrams",
  {
    id: int("id").autoincrement().primaryKey(),
    serialNumber: int("serialNumber").notNull().unique(),
    serialCode: varchar("serialCode", { length: 48 }).notNull().unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    creatorName: varchar("creatorName", { length: 255 }).notNull(),
    creatorEmail: varchar("creatorEmail", { length: 320 }),
    creatorBadgeId: varchar("creatorBadgeId", { length: 80 }),
    creatorIp: varchar("creatorIp", { length: 80 }),
    creatorFingerprint: varchar("creatorFingerprint", { length: 128 }),
    subject: varchar("subject", { length: 255 }).notNull(),
    recipient: varchar("recipient", { length: 255 }).notNull(),
    body: text("body").notNull(),
    classification: mysqlEnum("classification", ["urgent", "secret", "normal"]).default("normal").notNull(),
    category: mysqlEnum("category", ["criminal", "administrative", "traffic", "security", "tactical"]).default("administrative").notNull(),
    status: mysqlEnum("status", ["pending", "in_progress", "resolved", "archived"]).default("pending").notNull(),
    attachmentManifest: text("attachmentManifest"),
    gpsLatitude: varchar("gpsLatitude", { length: 40 }),
    gpsLongitude: varchar("gpsLongitude", { length: 40 }),
    archivedAt: timestamp("archivedAt"),
  },
  table => ({
    creatorIdx: index("telegrams_creator_idx").on(table.createdByUserId),
    createdAtIdx: index("telegrams_created_at_idx").on(table.createdAt),
    classificationIdx: index("telegrams_classification_idx").on(table.classification),
  }),
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorUserId: int("actorUserId").notNull(),
    actorName: varchar("actorName", { length: 255 }).notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: varchar("entityId", { length: 80 }),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    actorIdx: index("audit_actor_idx").on(table.actorUserId),
    createdAtIdx: index("audit_created_at_idx").on(table.createdAt),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Telegram = typeof telegrams.$inferSelect;
export type InsertTelegram = typeof telegrams.$inferInsert;
export type DepartmentSettings = typeof departmentSettings.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
