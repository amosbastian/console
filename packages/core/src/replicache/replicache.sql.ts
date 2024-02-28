import {
  bigint,
  char,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
} from "drizzle-orm/mysql-core";
import { timestamps, id } from "../util/sql";
import { Actor } from "../actor";

export const replicache_client_group = mysqlTable(
  "replicache_client_group",
  {
    ...timestamps,
    id: char("id", { length: 36 }).notNull(),
    actor: json("actor").$type<Actor>(),
    cvrVersion: int("cvr_version").notNull(),
    clientVersion: int("client_version").notNull(),
  },
  (table) => ({
    primary: primaryKey({ columns: [table.id] }),
  })
);

export const replicache_client = mysqlTable(
  "replicache_client",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    mutationID: bigint("mutation_id", {
      mode: "number",
    })
      .default(0)
      .notNull(),
    ...timestamps,
    clientGroupID: char("client_group_id", { length: 36 }).notNull(),
    clientVersion: int("client_version").notNull(),
  },
  (table) => ({
    clientGroupID: index("client_group_id").on(table.clientGroupID),
  })
);

export const replicache_cvr = mysqlTable(
  "replicache_cvr",
  {
    ...id,
    ...timestamps,
    data: json("data").$type<Record<string, number>>().notNull(),
    id: int("id").notNull(),
    clientGroupID: char("client_group_id", { length: 36 }).notNull(),
    clientVersion: int("client_version").notNull(),
  },
  (table) => ({
    primary: primaryKey({ columns: [table.clientGroupID, table.id] }),
  })
);
