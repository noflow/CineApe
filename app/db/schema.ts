import { integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const titleType = pgEnum("title_type", ["movie", "tv"]);
export const recommendationStatus = pgEnum("recommendation_status", ["pending", "watching", "watched", "not_interested"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  ...timestamps,
});

export const titles = pgTable("titles", {
  id: uuid("id").defaultRandom().primaryKey(),
  tmdbId: integer("tmdb_id").notNull(),
  type: titleType("type").notNull(),
  name: text("name").notNull(),
  releaseYear: integer("release_year"),
  posterPath: text("poster_path"),
  ...timestamps,
}, (table) => [uniqueIndex("titles_tmdb_type_unique").on(table.tmdbId, table.type)]);

export const friendships = pgTable("friendships", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  friendId: uuid("friend_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ...timestamps,
}, (table) => [primaryKey({ columns: [table.userId, table.friendId] })]);

export const groups = pgTable("groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const groupMembers = pgTable("group_members", {
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.groupId, table.userId] })]);

export const recommendations = pgTable("recommendations", {
  id: uuid("id").defaultRandom().primaryKey(),
  titleId: uuid("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  note: text("note"),
  status: recommendationStatus("status").default("pending").notNull(),
  ...timestamps,
});

export const titleRatings = pgTable("title_ratings", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  titleId: uuid("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  review: text("review"),
  ...timestamps,
}, (table) => [uniqueIndex("title_ratings_user_title_unique").on(table.userId, table.titleId)]);

export const recommendationRatings = pgTable("recommendation_ratings", {
  id: uuid("id").defaultRandom().primaryKey(),
  recommendationId: uuid("recommendation_id").notNull().references(() => recommendations.id, { onDelete: "cascade" }).unique(),
  score: integer("score").notNull(),
  ...timestamps,
});
