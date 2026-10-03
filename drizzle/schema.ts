import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  uniqueIndex,
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
export const classification = pgEnum("telegram_classification", [
  "secret",
  "normal",
]);
export const priority = pgEnum("telegram_priority", [
  "slow",
  "normal",
  "urgent",
]);
export const category = pgEnum("telegram_category", [
  "criminal",
  "administrative",
  "traffic",
  "security",
  "tactical",
]);
export const telegramStatus = pgEnum("telegram_status", [
  "draft",
  "submitted",
  "in_review",
  "approved",
  "returned",
  "rejected",
  "forwarded",
  "pending",
  "in_progress",
  "resolved",
  "completed",
  "archived",
]);
export const numberSystem = pgEnum("number_system", [
  "latin",
  "arabic",
  "hindi",
]);
export const organizationType = pgEnum("organization_type", [
  "central",
  "governorate",
  "region",
  "police_department",
  "command",
  "department",
  "station",
  "unit",
]);
export const organizationMemberRole = pgEnum("organization_member_role", [
  "system_admin",
  "organization_admin",
  "dispatcher",
  "reviewer",
  "reader",
  "auditor",
]);
export const telegramRouteStatus = pgEnum("telegram_route_status", [
  "sent",
  "received",
  "accepted",
  "completed",
  "rejected",
  "cancelled",
]);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentOrganizationId: uuid("parentOrganizationId"),
    telegramDestinationOrganizationId: uuid(
      "telegramDestinationOrganizationId"
    ),
    code: varchar("code", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    type: organizationType("type").default("department").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index("organizations_parent_idx").on(table.parentOrganizationId),
    index("organizations_telegram_destination_idx").on(
      table.telegramDestinationOrganizationId
    ),
    index("organizations_active_idx").on(table.isActive),
  ]
);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    authUserId: uuid("authUserId").notNull().unique(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name"),
    username: varchar("username", { length: 120 }),
    passwordHash: text("password_hash"),
    badgeNumber: varchar("badgeNumber", { length: 80 }),
    bio: text("bio"),
    phone: varchar("phone", { length: 32 }),
    rank: varchar("rank", { length: 120 }),
    unit: varchar("unit", { length: 255 }),
    avatarKey: text("avatarKey"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
    role: userRole("role").default("user").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSignedIn: timestamp("lastSignedIn", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index("users_organization_idx").on(table.organizationId),
    uniqueIndex("users_username_lower_unique_idx")
      .on(sql`lower(${table.username})`)
      .where(sql`${table.username} is not null`),
  ]
);

export const departmentSettings = pgTable("department_settings", {
  id: serial("id").primaryKey(),
  configKey: varchar("configKey", { length: 32 })
    .default("primary")
    .notNull()
    .unique(),
  departmentName: varchar("departmentName", { length: 255 })
    .default("إدارة الشرطة")
    .notNull(),
  unitName: varchar("unitName", { length: 255 })
    .default("وحدة العمليات")
    .notNull(),
  unitChiefRank: varchar("unitChiefRank", { length: 120 })
    .default("العقيد")
    .notNull(),
  unitChiefName: varchar("unitChiefName", { length: 255 })
    .default("رئيس الوحدة")
    .notNull(),
  serialPrefix: varchar("serialPrefix", { length: 24 })
    .default("POL")
    .notNull(),
  serialStart: integer("serialStart").default(1).notNull(),
  nextSerial: integer("nextSerial").default(1).notNull(),
  timezone: varchar("timezone", { length: 64 })
    .default("Asia/Damascus")
    .notNull(),
  dateFormat: varchar("dateFormat", { length: 32 })
    .default("dd/MM/yyyy HH:mm:ss")
    .notNull(),
  numberSystem: numberSystem("numberSystem").default("latin").notNull(),
  logoUrl: text("logoUrl"),
  updatedByUserId: integer("updatedByUserId"),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: serial("id").primaryKey(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: organizationMemberRole("role").default("dispatcher").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index("organization_memberships_user_idx").on(table.userId),
    index("organization_memberships_org_role_idx").on(
      table.organizationId,
      table.role
    ),
  ]
);

export const telegrams = pgTable(
  "telegrams",
  {
    id: serial("id").primaryKey(),
    serialNumber: integer("serialNumber").notNull().unique(),
    serialCode: varchar("serialCode", { length: 48 }).notNull().unique(),
    idempotencyKey: varchar("idempotencyKey", { length: 120 }),
    verificationToken: uuid("verificationToken").notNull().unique(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdByUserId: integer("createdByUserId").notNull(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organizations.id),
    currentOrganizationId: uuid("currentOrganizationId")
      .notNull()
      .references(() => organizations.id),
    creatorName: varchar("creatorName", { length: 255 }).notNull(),
    creatorEmail: varchar("creatorEmail", { length: 320 }),
    creatorBadgeId: varchar("creatorBadgeId", { length: 80 }),
    creatorIp: varchar("creatorIp", { length: 80 }),
    creatorFingerprint: varchar("creatorFingerprint", { length: 128 }),
    subject: varchar("subject", { length: 255 }).notNull(),
    recipient: varchar("recipient", { length: 255 }).notNull(),
    body: text("body").notNull(),
    classification: classification("classification")
      .default("normal")
      .notNull(),
    priority: priority("priority").default("normal").notNull(),
    category: category("category").default("administrative").notNull(),
    status: telegramStatus("status").default("pending").notNull(),
    workflowReason: text("workflowReason"),
    attachmentManifest: text("attachmentManifest"),
    gpsLatitude: varchar("gpsLatitude", { length: 40 }),
    gpsLongitude: varchar("gpsLongitude", { length: 40 }),
    archivedAt: timestamp("archivedAt", { withTimezone: true }),
    closedAt: timestamp("closedAt", { withTimezone: true }),
  },
  table => [
    index("telegrams_creator_idx").on(table.createdByUserId),
    index("telegrams_organization_idx").on(table.organizationId),
    index("telegrams_current_organization_idx").on(table.currentOrganizationId),
    index("telegrams_created_at_idx").on(table.createdAt),
    index("telegrams_classification_idx").on(table.classification),
    uniqueIndex("telegrams_idempotency_key_idx").on(table.idempotencyKey),
  ]
);

export const telegramVersions = pgTable(
  "telegram_versions",
  {
    id: serial("id").primaryKey(),
    telegramId: integer("telegramId")
      .notNull()
      .references(() => telegrams.id, { onDelete: "restrict" }),
    versionNumber: integer("versionNumber").notNull(),
    changedByUserId: integer("changedByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    changeReason: text("changeReason").notNull(),
    snapshot: text("snapshot").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex("telegram_versions_number_idx").on(
      table.telegramId,
      table.versionNumber
    ),
    index("telegram_versions_telegram_idx").on(
      table.telegramId,
      table.createdAt
    ),
  ]
);

export const telegramAttachments = pgTable(
  "telegram_attachments",
  {
    id: serial("id").primaryKey(),
    telegramId: integer("telegramId")
      .notNull()
      .references(() => telegrams.id, { onDelete: "restrict" }),
    storageKey: text("storageKey").notNull().unique(),
    originalName: varchar("originalName", { length: 180 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    sizeBytes: integer("sizeBytes").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    uploadedByUserId: integer("uploadedByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    scanStatus: varchar("scanStatus", { length: 32 })
      .default("pending")
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index("telegram_attachments_telegram_idx").on(
      table.telegramId,
      table.createdAt
    ),
    index("telegram_attachments_scan_idx").on(table.scanStatus),
  ]
);

export const telegramActions = pgTable(
  "telegram_actions",
  {
    id: serial("id").primaryKey(),
    telegramId: integer("telegramId")
      .notNull()
      .references(() => telegrams.id, { onDelete: "restrict" }),
    actorUserId: integer("actorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: varchar("action", { length: 80 }).notNull(),
    fromStatus: telegramStatus("fromStatus"),
    toStatus: telegramStatus("toStatus"),
    reason: text("reason"),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index("telegram_actions_telegram_idx").on(
      table.telegramId,
      table.createdAt
    ),
    index("telegram_actions_actor_idx").on(table.actorUserId, table.createdAt),
  ]
);

export const telegramRoutes = pgTable(
  "telegram_routes",
  {
    id: serial("id").primaryKey(),
    telegramId: integer("telegramId")
      .notNull()
      .references(() => telegrams.id, { onDelete: "restrict" }),
    fromOrganizationId: uuid("fromOrganizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    toOrganizationId: uuid("toOrganizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    forwardedByUserId: integer("forwardedByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: telegramRouteStatus("status").default("sent").notNull(),
    approvalStatus: varchar("approvalStatus", { length: 24 })
      .default("not_required")
      .notNull(),
    approvedByUserId: integer("approvedByUserId"),
    approvedAt: timestamp("approvedAt", { withTimezone: true }),
    approvalReason: text("approvalReason"),
    note: text("note"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    receivedAt: timestamp("receivedAt", { withTimezone: true }),
    completedAt: timestamp("completedAt", { withTimezone: true }),
  },
  table => [
    index("telegram_routes_telegram_idx").on(table.telegramId, table.createdAt),
    index("telegram_routes_destination_idx").on(
      table.toOrganizationId,
      table.status
    ),
    index("telegram_routes_source_idx").on(
      table.fromOrganizationId,
      table.createdAt
    ),
    index("telegram_routes_forwarder_idx").on(table.forwardedByUserId),
  ]
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("userAgent"),
    lastUsedAt: timestamp("lastUsedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index("push_subscriptions_org_idx").on(
      table.organizationId,
      table.lastUsedAt
    ),
    index("push_subscriptions_user_idx").on(table.userId, table.lastUsedAt),
    uniqueIndex("push_subscriptions_user_endpoint_idx").on(
      table.userId,
      table.endpoint
    ),
  ]
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
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index("audit_actor_idx").on(table.actorUserId),
    index("audit_created_at_idx").on(table.createdAt),
  ]
);

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;
export type OrganizationMembership =
  typeof organizationMemberships.$inferSelect;
export type OrganizationMemberRole =
  (typeof organizationMemberRole.enumValues)[number];
export type TelegramRoute = typeof telegramRoutes.$inferSelect;
export type InsertTelegramRoute = typeof telegramRoutes.$inferInsert;
export type OrganizationType = (typeof organizationType.enumValues)[number];
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Telegram = typeof telegrams.$inferSelect;
export type InsertTelegram = typeof telegrams.$inferInsert;
export type TelegramVersion = typeof telegramVersions.$inferSelect;
export type TelegramAttachment = typeof telegramAttachments.$inferSelect;
export type TelegramAction = typeof telegramActions.$inferSelect;
export type DepartmentSettings = typeof departmentSettings.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
