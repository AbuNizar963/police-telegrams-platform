import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const classification = pgEnum("telegram_classification", ["secret", "normal"]);
export const priority = pgEnum("telegram_priority", ["slow", "normal", "urgent"]);
export const category = pgEnum("telegram_category", [
  "criminal",
  "administrative",
  "traffic",
  "security",
  "tactical",
]);
export const telegramStatus = pgEnum("telegram_status", [
  "pending",
  "in_progress",
  "resolved",
  "archived",
]);
export const numberSystem = pgEnum("number_system", ["latin", "arabic", "hindi"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  authUserId: uuid("authUserId").notNull().unique(),
  name: text("name"),
  username: varchar("username", { length: 120 }),
  passwordHash: text("password_hash"),
  badgeNumber: varchar("badgeNumber", { length: 80 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

export const departmentSettings = pgTable("department_settings", {
  id: serial("id").primaryKey(),
  configKey: varchar("configKey", { length: 32 }).default("primary").notNull().unique(),
  departmentName: varchar("departmentName", { length: 255 }).default("إدارة الشرطة").notNull(),
  unitName: varchar("unitName", { length: 255 }).default("وحدة العمليات").notNull(),
  unitChiefRank: varchar("unitChiefRank", { length: 120 }).default("العقيد").notNull(),
  unitChiefName: varchar("unitChiefName", { length: 255 }).default("رئيس الوحدة").notNull(),
  serialPrefix: varchar("serialPrefix", { length: 24 }).default("POL").notNull(),
  serialStart: integer("serialStart").default(1).notNull(),
  nextSerial: integer("nextSerial").default(1).notNull(),
  timezone: varchar("timezone", { length: 64 }).default("Asia/Damascus").notNull(),
  dateFormat: varchar("dateFormat", { length: 32 }).default("dd/MM/yyyy HH:mm:ss").notNull(),
  numberSystem: numberSystem("numberSystem").default("latin").notNull(),
  logoUrl: text("logoUrl"),
  updatedByUserId: integer("updatedByUserId"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const telegrams = pgTable(
  "telegrams",
  {
    id: serial("id").primaryKey(),
    serialNumber: integer("serialNumber").notNull().unique(),
    serialCode: varchar("serialCode", { length: 48 }).notNull().unique(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
    createdByUserId: integer("createdByUserId").notNull(),
    creatorName: varchar("creatorName", { length: 255 }).notNull(),
    creatorEmail: varchar("creatorEmail", { length: 320 }),
    creatorBadgeId: varchar("creatorBadgeId", { length: 80 }),
    creatorIp: varchar("creatorIp", { length: 80 }),
    creatorFingerprint: varchar("creatorFingerprint", { length: 128 }),
    subject: varchar("subject", { length: 255 }).notNull(),
    recipient: varchar("recipient", { length: 255 }).notNull(),
    body: text("body").notNull(),
    classification: classification("classification").default("normal").notNull(),
    priority: priority("priority").default("normal").notNull(),
    category: category("category").default("administrative").notNull(),
    status: telegramStatus("status").default("pending").notNull(),
    attachmentManifest: text("attachmentManifest"),
    gpsLatitude: varchar("gpsLatitude", { length: 40 }),
    gpsLongitude: varchar("gpsLongitude", { length: 40 }),
    archivedAt: timestamp("archivedAt", { withTimezone: true }),
  },
  table => [
    index("telegrams_creator_idx").on(table.createdByUserId),
    index("telegrams_created_at_idx").on(table.createdAt),
    index("telegrams_classification_idx").on(table.classification),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actorUserId").notNull(),
    actorName: varchar("actorName", { length: 255 }).notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: varchar("entityId", { length: 80 }),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("audit_actor_idx").on(table.actorUserId),
    index("audit_created_at_idx").on(table.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Telegram = typeof telegrams.$inferSelect;
export type InsertTelegram = typeof telegrams.$inferInsert;
export type DepartmentSettings = typeof departmentSettings.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
