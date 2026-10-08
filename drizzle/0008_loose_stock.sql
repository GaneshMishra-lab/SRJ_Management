CREATE TABLE "loose_stock_ledger" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp,
	"item_type" uuid NOT NULL,
	"melting" numeric(7, 3),
	"direction" text,
	"weight" numeric(12, 3),
	"source_table" text,
	"source_id" uuid,
	"desc" text
);
--> statement-breakpoint
ALTER TABLE "item_sale" ADD COLUMN "item_type" uuid;--> statement-breakpoint
ALTER TABLE "item_sale" ADD COLUMN "weight" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "item_sale" ADD COLUMN "melting" numeric(7, 3);--> statement-breakpoint
ALTER TABLE "item_type" ADD COLUMN "loose" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "item_type" ADD COLUMN "pieces_per_gram" integer;--> statement-breakpoint
ALTER TABLE "loose_stock_ledger" ADD CONSTRAINT "loose_stock_ledger_item_type_item_type_id_fk" FOREIGN KEY ("item_type") REFERENCES "public"."item_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loose_stock_purchased_uq" ON "loose_stock_ledger" USING btree ("source_id") WHERE "loose_stock_ledger"."source_table" = 'item_purchased';--> statement-breakpoint
ALTER TABLE "item_sale" ADD CONSTRAINT "item_sale_item_type_item_type_id_fk" FOREIGN KEY ("item_type") REFERENCES "public"."item_type"("id") ON DELETE no action ON UPDATE no action;