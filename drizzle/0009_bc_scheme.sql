CREATE TABLE "bc" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer" uuid NOT NULL,
	"card_no" text,
	"start_date" date NOT NULL,
	"instalment" numeric(14, 2) NOT NULL,
	"months" integer NOT NULL,
	"multiplier" numeric(7, 3) NOT NULL,
	"matured_at" timestamp,
	"bonus" numeric(14, 2),
	"value" numeric(14, 2),
	"note" text
);
--> statement-breakpoint
CREATE TABLE "bc_payment" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bc" uuid NOT NULL,
	"date" timestamp,
	"amt" numeric(14, 2),
	"mode" text
);
--> statement-breakpoint
ALTER TABLE "item_sale_details" ADD COLUMN "bc" uuid;--> statement-breakpoint
ALTER TABLE "bc" ADD CONSTRAINT "bc_customer_entity_id_fk" FOREIGN KEY ("customer") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bc_payment" ADD CONSTRAINT "bc_payment_bc_bc_id_fk" FOREIGN KEY ("bc") REFERENCES "public"."bc"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_sale_details" ADD CONSTRAINT "item_sale_details_bc_bc_id_fk" FOREIGN KEY ("bc") REFERENCES "public"."bc"("id") ON DELETE no action ON UPDATE no action;