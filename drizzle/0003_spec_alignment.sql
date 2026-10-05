CREATE TABLE "lend_entry" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lend" uuid NOT NULL,
	"date" timestamp,
	"type" text,
	"amt" numeric(14, 2),
	"mode" text
);
--> statement-breakpoint
CREATE TABLE "loan_entry" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan" uuid NOT NULL,
	"date" timestamp,
	"type" text,
	"amt" numeric(14, 2),
	"mode" text
);
--> statement-breakpoint
CREATE TABLE "daily_metal_balance" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"metal" text NOT NULL,
	"standard" text NOT NULL,
	"opening_balance" numeric(12, 3),
	"computed_closing" numeric(12, 3),
	"actual_closing" numeric(12, 3),
	"discrepancy" numeric(12, 3),
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "daily_rate" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"metal" text NOT NULL,
	"rate" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fine_trade" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp,
	"type" text,
	"entity" uuid,
	"metal" text,
	"standard" text,
	"weight" numeric(12, 3),
	"rate" numeric(14, 2),
	"amt" numeric(14, 2),
	"mode" text
);
--> statement-breakpoint
CREATE TABLE "item_approval" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item" uuid NOT NULL,
	"entity" uuid NOT NULL,
	"date_out" timestamp,
	"date_back" timestamp,
	"outcome" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "item_order_payment" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order" uuid NOT NULL,
	"date" timestamp,
	"amt" numeric(14, 2),
	"mode" text
);
--> statement-breakpoint
CREATE TABLE "item_repairing_payment" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repair" uuid NOT NULL,
	"date" timestamp,
	"amt" numeric(14, 2),
	"mode" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_type" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"metal" text,
	"desc" text,
	"next_label" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_type" ADD COLUMN IF NOT EXISTS "next_label" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE TABLE "langdi_ledger" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp,
	"metal" text,
	"direction" text,
	"weight" numeric(12, 3),
	"pieces" integer,
	"est_purity" numeric(7, 3),
	"tested_purity" numeric(7, 3),
	"refining_deduction" numeric(12, 3),
	"fine_weight" numeric(12, 3),
	"standard" text,
	"source_table" text,
	"source_id" uuid,
	"entity" uuid,
	"amt" numeric(14, 2),
	"mode" text,
	"desc" text
);
--> statement-breakpoint
CREATE TABLE "old_item_payment" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"old_item" uuid NOT NULL,
	"date" timestamp,
	"amt" numeric(14, 2),
	"mode" text
);
--> statement-breakpoint
CREATE TABLE "supplier_return" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp,
	"supplier" uuid NOT NULL,
	"item" uuid NOT NULL,
	"bill" uuid,
	"amt" numeric(14, 2),
	"fine" numeric(12, 3)
);
--> statement-breakpoint
CREATE TABLE "supplier_return_settlement" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_return" uuid NOT NULL,
	"date" timestamp,
	"mode" text,
	"amt" numeric(14, 2),
	"fine_weight" numeric(12, 3),
	"standard" text,
	"bill_payment" uuid
);
--> statement-breakpoint
ALTER TABLE "lend_repayment" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loan_repayment" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fine_purchase" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "lend_repayment" CASCADE;--> statement-breakpoint
DROP TABLE "loan_repayment" CASCADE;--> statement-breakpoint
DROP TABLE "fine_purchase" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "entity" ALTER COLUMN "contact" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "lend" ALTER COLUMN "lender" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "loan" ALTER COLUMN "borrower" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_ledger" ALTER COLUMN "amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "daily_balance" ALTER COLUMN "opening_balance" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "daily_balance" ALTER COLUMN "computed_closing" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "daily_balance" ALTER COLUMN "actual_closing" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "daily_balance" ALTER COLUMN "discrepancy" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "expense" ALTER COLUMN "amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "metal_ledger" ALTER COLUMN "weight" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "misc_trade" ALTER COLUMN "unit_price" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "misc_trade" ALTER COLUMN "amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "bill" ALTER COLUMN "rate" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "bill" ALTER COLUMN "bill_amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "bill" ALTER COLUMN "fine" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "bill" ALTER COLUMN "paid_amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "bill_payment" ALTER COLUMN "amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "gold_loan" ALTER COLUMN "weight" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "gold_loan" ALTER COLUMN "amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "gold_loan" ALTER COLUMN "amt_paid" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "gold_loan" ALTER COLUMN "interest" SET DATA TYPE numeric(7, 3);--> statement-breakpoint
ALTER TABLE "gold_loan_payment" ALTER COLUMN "amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_order" ALTER COLUMN "weight" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "item_order" ALTER COLUMN "amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_order" ALTER COLUMN "amt_paid" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_purchased" ALTER COLUMN "wastage" SET DATA TYPE numeric(7, 3);--> statement-breakpoint
ALTER TABLE "item_purchased" ALTER COLUMN "making" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_purchased" ALTER COLUMN "extra_charges" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_purchased" ALTER COLUMN "amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_repairing" ALTER COLUMN "amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_repairing" ALTER COLUMN "paid_amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_sale" ALTER COLUMN "amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_sale_bill" ALTER COLUMN "total_amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_sale_bill" ALTER COLUMN "paid_amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_sale_details" ALTER COLUMN "amt_paid" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "old_item" ALTER COLUMN "weight" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "old_item" ALTER COLUMN "amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "old_item" ALTER COLUMN "paid_amt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "entity" uuid;--> statement-breakpoint
ALTER TABLE "metal_ledger" ADD COLUMN "standard" text;--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "metal" text;--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "standard" text;--> statement-breakpoint
ALTER TABLE "bill_payment" ADD COLUMN "fine_weight" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "bill_payment" ADD COLUMN "standard" text;--> statement-breakpoint
ALTER TABLE "gold_loan" ADD COLUMN "desc" text;--> statement-breakpoint
ALTER TABLE "gold_loan" ADD COLUMN "status" text DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "gold_loan_payment" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "item_order" ADD COLUMN "metal" text;--> statement-breakpoint
ALTER TABLE "item_order" ADD COLUMN "melting" numeric(7, 3);--> statement-breakpoint
ALTER TABLE "item_order" ADD COLUMN "rate_booked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "item_order" ADD COLUMN "booked_rate" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_repairing" ADD COLUMN "received_date" timestamp;--> statement-breakpoint
ALTER TABLE "item_repairing" ADD COLUMN "received_weight" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "item_repairing" ADD COLUMN "karigar" uuid;--> statement-breakpoint
ALTER TABLE "item_repairing" ADD COLUMN "sent_date" timestamp;--> statement-breakpoint
ALTER TABLE "item_repairing" ADD COLUMN "done_date" timestamp;--> statement-breakpoint
ALTER TABLE "item_repairing" ADD COLUMN "returned_date" timestamp;--> statement-breakpoint
ALTER TABLE "item_repairing" ADD COLUMN "returned_weight" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "item_sale" ADD COLUMN "rate" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_sale" ADD COLUMN "making_pct" numeric(7, 3);--> statement-breakpoint
ALTER TABLE "item_sale" ADD COLUMN "metal_value" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_sale" ADD COLUMN "making_amt" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_sale" ADD COLUMN "gst" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_sale_bill" ADD COLUMN "order" uuid;--> statement-breakpoint
ALTER TABLE "item_sale_bill" ADD COLUMN "computed_amt" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_sale_bill" ADD COLUMN "discount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_sale_details" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "item_stock" ADD COLUMN "item_type" uuid;--> statement-breakpoint
ALTER TABLE "item_stock" ADD COLUMN "metal" text;--> statement-breakpoint
ALTER TABLE "item_stock" ADD COLUMN "gross_weight" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "item_stock" ADD COLUMN "net_weight" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "item_stock" ADD COLUMN "melting" numeric(7, 3);--> statement-breakpoint
ALTER TABLE "item_stock" ADD COLUMN "huid" text;--> statement-breakpoint
ALTER TABLE "item_stock" ADD COLUMN "langdi_entry" uuid;--> statement-breakpoint
ALTER TABLE "old_item" ADD COLUMN "melting" numeric(7, 3);--> statement-breakpoint
ALTER TABLE "old_item" ADD COLUMN "gold_loan" uuid;--> statement-breakpoint
ALTER TABLE "old_item" ADD COLUMN "langdi_entry" uuid;--> statement-breakpoint
UPDATE "item_order" SET "melting" = "tunch";--> statement-breakpoint
UPDATE "old_item" SET "melting" = "tunch";--> statement-breakpoint
UPDATE "item_stock" s SET "gross_weight" = p."weight", "net_weight" = p."weight", "melting" = p."melting" FROM "item_purchased" p WHERE s."item" = p."id";--> statement-breakpoint
DO $$
BEGIN
	-- item_purchased.item_type_id only exists where db-fix.js was run
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'item_purchased' AND column_name = 'item_type_id') THEN
		EXECUTE 'UPDATE "item_stock" s SET "item_type" = p."item_type_id", "metal" = t."metal" FROM "item_purchased" p LEFT JOIN "item_type" t ON t."id" = p."item_type_id" WHERE s."item" = p."id"';
		EXECUTE 'UPDATE "bill" b SET "metal" = (SELECT min(t."metal") FROM "item_purchased" p JOIN "item_type" t ON t."id" = p."item_type_id" WHERE p."bill" = b."id") WHERE b."metal" IS NULL';
	END IF;
END $$;--> statement-breakpoint
UPDATE "item_stock" s SET "label" = n.rn FROM (SELECT "id", row_number() OVER (PARTITION BY "item_type" ORDER BY "created_at", "id") AS rn FROM "item_stock" WHERE "item_type" IS NOT NULL) n WHERE s."id" = n."id" AND s."label" IS NULL;--> statement-breakpoint
UPDATE "item_type" t SET "next_label" = m.mx + 1 FROM (SELECT "item_type", max("label") AS mx FROM "item_stock" WHERE "item_type" IS NOT NULL GROUP BY "item_type") m WHERE t."id" = m."item_type";--> statement-breakpoint
ALTER TABLE "lend_entry" ADD CONSTRAINT "lend_entry_lend_lend_id_fk" FOREIGN KEY ("lend") REFERENCES "public"."lend"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_entry" ADD CONSTRAINT "loan_entry_loan_loan_id_fk" FOREIGN KEY ("loan") REFERENCES "public"."loan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fine_trade" ADD CONSTRAINT "fine_trade_entity_entity_id_fk" FOREIGN KEY ("entity") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_approval" ADD CONSTRAINT "item_approval_item_item_stock_id_fk" FOREIGN KEY ("item") REFERENCES "public"."item_stock"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_approval" ADD CONSTRAINT "item_approval_entity_entity_id_fk" FOREIGN KEY ("entity") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_order_payment" ADD CONSTRAINT "item_order_payment_order_item_order_id_fk" FOREIGN KEY ("order") REFERENCES "public"."item_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_repairing_payment" ADD CONSTRAINT "item_repairing_payment_repair_item_repairing_id_fk" FOREIGN KEY ("repair") REFERENCES "public"."item_repairing"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langdi_ledger" ADD CONSTRAINT "langdi_ledger_entity_entity_id_fk" FOREIGN KEY ("entity") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "old_item_payment" ADD CONSTRAINT "old_item_payment_old_item_old_item_id_fk" FOREIGN KEY ("old_item") REFERENCES "public"."old_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return" ADD CONSTRAINT "supplier_return_supplier_entity_id_fk" FOREIGN KEY ("supplier") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return" ADD CONSTRAINT "supplier_return_item_item_stock_id_fk" FOREIGN KEY ("item") REFERENCES "public"."item_stock"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return" ADD CONSTRAINT "supplier_return_bill_bill_id_fk" FOREIGN KEY ("bill") REFERENCES "public"."bill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_settlement" ADD CONSTRAINT "supplier_return_settlement_supplier_return_supplier_return_id_fk" FOREIGN KEY ("supplier_return") REFERENCES "public"."supplier_return"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_settlement" ADD CONSTRAINT "supplier_return_settlement_bill_payment_bill_payment_id_fk" FOREIGN KEY ("bill_payment") REFERENCES "public"."bill_payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_metal_balance_date_metal_standard_uq" ON "daily_metal_balance" USING btree ("date","metal","standard");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_rate_date_metal_uq" ON "daily_rate" USING btree ("date","metal");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_entity_entity_id_fk" FOREIGN KEY ("entity") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_repairing" ADD CONSTRAINT "item_repairing_karigar_entity_id_fk" FOREIGN KEY ("karigar") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_sale_bill" ADD CONSTRAINT "item_sale_bill_order_item_order_id_fk" FOREIGN KEY ("order") REFERENCES "public"."item_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stock" ADD CONSTRAINT "item_stock_item_type_item_type_id_fk" FOREIGN KEY ("item_type") REFERENCES "public"."item_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stock" ADD CONSTRAINT "item_stock_langdi_entry_langdi_ledger_id_fk" FOREIGN KEY ("langdi_entry") REFERENCES "public"."langdi_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "old_item" ADD CONSTRAINT "old_item_gold_loan_gold_loan_id_fk" FOREIGN KEY ("gold_loan") REFERENCES "public"."gold_loan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "old_item" ADD CONSTRAINT "old_item_langdi_entry_langdi_ledger_id_fk" FOREIGN KEY ("langdi_entry") REFERENCES "public"."langdi_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_stock_type_label_uq" ON "item_stock" USING btree ("item_type","label");--> statement-breakpoint
ALTER TABLE "lend" DROP COLUMN "date";--> statement-breakpoint
ALTER TABLE "lend" DROP COLUMN "amt_lended";--> statement-breakpoint
ALTER TABLE "lend" DROP COLUMN "amt_to_be_paid";--> statement-breakpoint
ALTER TABLE "loan" DROP COLUMN "date";--> statement-breakpoint
ALTER TABLE "loan" DROP COLUMN "amt_borrowed";--> statement-breakpoint
ALTER TABLE "loan" DROP COLUMN "amt_to_be_paid";--> statement-breakpoint
ALTER TABLE "item_order" DROP COLUMN "tunch";--> statement-breakpoint
ALTER TABLE "item_purchased" DROP COLUMN IF EXISTS "name";--> statement-breakpoint
ALTER TABLE "item_purchased" DROP COLUMN IF EXISTS "metal";--> statement-breakpoint
ALTER TABLE "item_purchased" DROP COLUMN "weight";--> statement-breakpoint
ALTER TABLE "item_purchased" DROP COLUMN "melting";--> statement-breakpoint
ALTER TABLE "item_purchased" DROP COLUMN IF EXISTS "item_type_id";--> statement-breakpoint
ALTER TABLE "old_item" DROP COLUMN "tunch";--> statement-breakpoint
ALTER TABLE "lend" ADD CONSTRAINT "lend_lender_unique" UNIQUE("lender");--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_borrower_unique" UNIQUE("borrower");--> statement-breakpoint
ALTER TABLE "item_stock" ADD CONSTRAINT "item_stock_huid_unique" UNIQUE("huid");--> statement-breakpoint
ALTER TABLE "entity" ADD CONSTRAINT "entity_type_check" CHECK ("entity"."type" in ('customer', 'supplier', 'staff'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('owner', 'staff'));--> statement-breakpoint
ALTER TABLE "item_stock" ADD CONSTRAINT "item_stock_source_check" CHECK (("item_stock"."item" is not null and "item_stock"."old_item_source" is null) or ("item_stock"."item" is null and "item_stock"."old_item_source" is not null));--> statement-breakpoint
CREATE VIEW "public"."entity_balance" AS (
  select
    e.id as entity,
    e.name,
    e.type,
    coalesce((select sum(coalesce(s.total_amt, 0) - coalesce(s.paid_amt, 0)) from item_sale_bill s where s.customer = e.id), 0) as sale_due,
    coalesce((select sum(coalesce(r.amt, 0) - coalesce(r.paid_amt, 0)) from item_repairing r where r.customer = e.id), 0) as repair_due,
    coalesce((select sum(case when le.type = 'repayment' then -le.amt else le.amt end) from loan l join loan_entry le on le.loan = l.id where l.borrower = e.id), 0) as loan_due,
    coalesce((select sum(coalesce(g.amt, 0) - coalesce(g.amt_paid, 0)) from gold_loan g where g.customer = e.id and g.status = 'active'), 0) as gold_loan_principal_due,
    coalesce((select sum(coalesce(sr.amt, 0)) from supplier_return sr where sr.supplier = e.id), 0)
      - coalesce((select sum(coalesce(st.amt, 0)) from supplier_return sr join supplier_return_settlement st on st.supplier_return = sr.id where sr.supplier = e.id), 0) as supplier_return_due,
    coalesce((select sum(coalesce(b.bill_amt, 0) - coalesce(b.paid_amt, 0)) from bill b where b.supplier = e.id), 0) as bill_due,
    coalesce((select sum(case when le.type = 'repayment' then -le.amt else le.amt end) from lend l join lend_entry le on le.lend = l.id where l.lender = e.id), 0) as lend_due,
    coalesce((select sum(coalesce(o.amt, 0) - coalesce(o.paid_amt, 0)) from old_item o where o.customer = e.id and o.sale_bill is null and o."order" is null and o.gold_loan is null), 0) as old_item_due
  from entity e
);