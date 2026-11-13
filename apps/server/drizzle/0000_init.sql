CREATE TABLE "match_players" (
	"match_id" uuid NOT NULL,
	"seat" smallint NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid,
	"device_id" text,
	"name" text NOT NULL,
	"avatar" text,
	"won" boolean NOT NULL,
	"hands_won" smallint NOT NULL,
	"dry_wins" smallint NOT NULL,
	"calls" smallint NOT NULL,
	CONSTRAINT "match_players_match_id_seat_pk" PRIMARY KEY("match_id","seat")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_code" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"seed" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"actions" text NOT NULL,
	"score_0" smallint NOT NULL,
	"score_1" smallint NOT NULL,
	"winner" smallint NOT NULL,
	"hands" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"code" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"google_sub" text,
	"email" text,
	"name" text NOT NULL,
	"photo" text,
	"avatar" text DEFAULT 'photo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_players_user" ON "match_players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "match_players_device" ON "match_players" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "matches_ended" ON "matches" USING btree ("ended_at");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");