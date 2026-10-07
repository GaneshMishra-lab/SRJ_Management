CREATE TABLE "daybook_entry" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp NOT NULL,
	"head" uuid NOT NULL,
	"party" text,
	"weight" numeric(12, 3),
	"purity" numeric(7, 3),
	"rate" numeric(14, 2),
	"amt" numeric(14, 2) NOT NULL,
	"mode" text NOT NULL,
	"note" text,
	"extra_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "daybook_entry_amt_check" CHECK ("daybook_entry"."amt" > 0),
	CONSTRAINT "daybook_entry_mode_check" CHECK ("daybook_entry"."mode" in ('cash', 'upi', 'cheque', 'bank'))
);
--> statement-breakpoint
CREATE TABLE "daybook_head" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_mr" text NOT NULL,
	"name_en" text NOT NULL,
	"side" text NOT NULL,
	"sort_order" integer NOT NULL,
	"page" integer DEFAULT 1 NOT NULL,
	"role" text,
	"active" boolean DEFAULT true NOT NULL,
	"party_required" boolean DEFAULT false NOT NULL,
	"show_rate" boolean DEFAULT false NOT NULL,
	"extra_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "daybook_head_side_check" CHECK ("daybook_head"."side" in ('credit', 'debit')),
	CONSTRAINT "daybook_head_role_check" CHECK ("daybook_head"."role" in ('opening', 'bank')),
	CONSTRAINT "daybook_head_page_check" CHECK ("daybook_head"."page" in (1, 2))
);
--> statement-breakpoint
CREATE TABLE "daybook_rule" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"kind" text PRIMARY KEY NOT NULL,
	"head" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daybook_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"invocation" text NOT NULL,
	"show_invocation" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daybook_settings_single_row" CHECK ("daybook_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "daybook_entry" ADD CONSTRAINT "daybook_entry_head_daybook_head_id_fk" FOREIGN KEY ("head") REFERENCES "public"."daybook_head"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daybook_rule" ADD CONSTRAINT "daybook_rule_head_daybook_head_id_fk" FOREIGN KEY ("head") REFERENCES "public"."daybook_head"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daybook_head_role_side_uq" ON "daybook_head" USING btree ("role","side");--> statement-breakpoint
-- The heads of the handwritten book in its own order: the first sheet, then the second from गिरवी on.
INSERT INTO "daybook_head" ("name_mr", "name_en", "side", "sort_order", "page", "role", "party_required", "show_rate", "extra_fields") VALUES
  ('श्री पुरात पेठे रोकड', 'Opening Cash', 'credit', 1, 1, 'opening', false, false, '[]'),
  ('श्री सोना व्यापार', 'Gold Sales', 'credit', 2, 1, NULL, false, true, '[]'),
  ('श्री चांदी व्यापार', 'Silver Sales', 'credit', 3, 1, NULL, false, true, '[]'),
  ('श्री पंचुरणी पेठे', 'Panchurani Pethe', 'credit', 4, 1, NULL, false, false, '[]'),
  ('श्री सावकारी पेठे', 'Savkari (Moneylending)', 'credit', 5, 1, NULL, true, false, '[]'),
  ('श्री उधारी पेठे', 'Udhari (Credit)', 'credit', 6, 1, NULL, true, false, '[]'),
  ('श्री बीसी पेठे', 'BC Pethe', 'credit', 7, 1, NULL, false, false, '[]'),
  ('श्री गिरवी पेठे', 'Girvi (Pledge)', 'credit', 8, 2, NULL, false, false, '[{"key":"item","labelMr":"वस्तू","labelEn":"Item","type":"text"},{"key":"interest","labelMr":"व्याज % (दरमहा)","labelEn":"Interest % (per month)","type":"number"}]'),
  ('श्री बदला पेठे', 'Badla Pethe', 'credit', 9, 2, NULL, false, false, '[]'),
  ('श्री राम ज्वेलर्स A/C', 'Ram Jewellers A/C', 'credit', 10, 2, 'bank', false, false, '[]'),
  ('श्री भंगारे पेठे', 'Bhangare Pethe', 'credit', 11, 2, NULL, false, false, '[]'),
  ('श्री सोना खरेदी', 'Gold Purchase', 'debit', 1, 1, NULL, false, true, '[]'),
  ('श्री चांदी खरेदी', 'Silver Purchase', 'debit', 2, 1, NULL, false, true, '[]'),
  ('श्री व्यापारी पेठे', 'Traders / Suppliers', 'debit', 3, 1, NULL, false, false, '[]'),
  ('श्री खर्च खाते', 'Expenses', 'debit', 4, 1, NULL, false, false, '[]'),
  ('श्री उधारी पेठे', 'Udhari (Credit)', 'debit', 5, 1, NULL, true, false, '[]'),
  ('श्री गिरवी पेठे', 'Girvi (Pledge)', 'debit', 6, 2, NULL, false, false, '[{"key":"item","labelMr":"वस्तू","labelEn":"Item","type":"text"},{"key":"interest","labelMr":"व्याज % (दरमहा)","labelEn":"Interest % (per month)","type":"number"}]'),
  ('श्री बदला पेठे', 'Badla Pethe', 'debit', 7, 2, NULL, false, false, '[]'),
  ('श्री राम ज्वेलर्स A/C', 'Ram Jewellers A/C', 'debit', 8, 2, 'bank', false, false, '[]'),
  ('श्री भंगारे पेठे', 'Bhangare Pethe', 'debit', 9, 2, NULL, false, false, '[]');--> statement-breakpoint
-- Where each kind of app entry is written until the owner changes it. Kinds are listed in lib/daybook/kinds.ts.
INSERT INTO "daybook_rule" ("kind", "head")
SELECT v.kind, h."id"
FROM (VALUES
  ('sale.gold', 'credit', 'Gold Sales'), ('sale.silver', 'credit', 'Silver Sales'),
  ('order.gold', 'credit', 'Gold Sales'), ('order.silver', 'credit', 'Silver Sales'),
  ('bullion_sell.gold', 'credit', 'Gold Sales'), ('bullion_sell.silver', 'credit', 'Silver Sales'),
  ('langdi.gold', 'credit', 'Gold Sales'), ('langdi.silver', 'credit', 'Silver Sales'),
  ('repair', 'credit', 'Panchurani Pethe'), ('misc_sale', 'credit', 'Panchurani Pethe'),
  ('girvi_received', 'credit', 'Girvi (Pledge)'),
  ('loan_repaid', 'credit', 'Udhari (Credit)'),
  ('borrow_taken', 'credit', 'Savkari (Moneylending)'), ('borrow_repaid', 'credit', 'Savkari (Moneylending)'),
  ('adjustment', 'credit', 'Opening Cash'),
  ('old.gold', 'debit', 'Gold Purchase'), ('old.silver', 'debit', 'Silver Purchase'),
  ('bullion_buy.gold', 'debit', 'Gold Purchase'), ('bullion_buy.silver', 'debit', 'Silver Purchase'),
  ('supplier.gold', 'debit', 'Traders / Suppliers'), ('supplier.silver', 'debit', 'Traders / Suppliers'),
  ('supplier_return', 'debit', 'Traders / Suppliers'), ('misc_purchase', 'debit', 'Traders / Suppliers'),
  ('expense', 'debit', 'Expenses'),
  ('girvi_given', 'debit', 'Girvi (Pledge)'),
  ('loan_given', 'debit', 'Udhari (Credit)')
) AS v("kind", "side", "name_en")
JOIN "daybook_head" h ON h."side" = v."side" AND h."name_en" = v."name_en";--> statement-breakpoint
INSERT INTO "daybook_settings" ("id", "invocation") VALUES (1, E'श्री गणेशाय नमः श्री महालक्ष्मी नमः श्री सरस्वती नमः श्री जीवदानी माता नमः\nश्री रामेश्वर महादेव नमः श्री नारायणाय नमः श्री चौरा देवी नमः जय श्री राम');