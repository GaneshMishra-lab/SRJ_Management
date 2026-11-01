CREATE TABLE "stock_check" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"metal" text NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"checked_by" integer
);
--> statement-breakpoint
CREATE TABLE "stock_check_line" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_name" text NOT NULL,
	"added" numeric(12, 3),
	"removed" numeric(12, 3),
	"expected" numeric(12, 3) NOT NULL,
	"away" numeric(12, 3) NOT NULL,
	"counted" numeric(12, 3) NOT NULL,
	"locker" numeric(12, 3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_check" ADD CONSTRAINT "stock_check_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_check_line" ADD CONSTRAINT "stock_check_line_check_stock_check_id_fk" FOREIGN KEY ("check") REFERENCES "public"."stock_check"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_check_day_uq" ON "stock_check" USING btree ("kind","metal","date");