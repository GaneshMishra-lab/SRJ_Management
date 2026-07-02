CREATE TABLE "entity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"type" text,
	"contact" integer
);
--> statement-breakpoint
CREATE TABLE "misc_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "misc_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" uuid,
	"name" text,
	"desc" text,
	"unit" text
);
--> statement-breakpoint
CREATE TABLE "lend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lender" uuid,
	"date" timestamp,
	"amt_lended" integer,
	"amt_to_be_paid" integer
);
--> statement-breakpoint
CREATE TABLE "lend_repayment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lend" uuid,
	"data" timestamp,
	"amt" integer,
	"mode" text
);
--> statement-breakpoint
CREATE TABLE "loan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"borrower" uuid,
	"date" timestamp,
	"amt_borrowed" integer,
	"amt_to_be_paid" integer
);
--> statement-breakpoint
CREATE TABLE "loan_repayment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan" uuid,
	"data" timestamp,
	"amt" integer,
	"mode" text
);
--> statement-breakpoint
CREATE TABLE "cash_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp,
	"location" text,
	"direction" text,
	"amt" real,
	"source_table" text,
	"source_id" uuid,
	"desc" text
);
--> statement-breakpoint
CREATE TABLE "daily_balance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp,
	"location" text,
	"opening_balance" real,
	"computed_closing" real,
	"actual_closing" real,
	"discrepancy" real,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "expense" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp,
	"category" text,
	"desc" text,
	"amt" real,
	"mode" text,
	"location" text
);
--> statement-breakpoint
CREATE TABLE "metal_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp,
	"metal" text,
	"direction" text,
	"weight" real,
	"source_table" text,
	"source_id" uuid,
	"desc" text
);
--> statement-breakpoint
CREATE TABLE "misc_trade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp,
	"type" text,
	"entity" uuid,
	"item" uuid,
	"qty" integer,
	"unit_price" real,
	"amt" real,
	"mode" text
);
--> statement-breakpoint
CREATE TABLE "bill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier" uuid,
	"date" timestamp,
	"rate" real,
	"bill_amt" real,
	"fine" real,
	"paid_amt" real
);
--> statement-breakpoint
CREATE TABLE "bill_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp,
	"bill" uuid,
	"amt" real,
	"mode" text
);
--> statement-breakpoint
CREATE TABLE "fine_purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp,
	"supplier" uuid,
	"metal" text,
	"weight" real,
	"rate" real,
	"amt" real,
	"mode" text
);
--> statement-breakpoint
CREATE TABLE "gold_loan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer" uuid,
	"item" text,
	"weight" real,
	"date" timestamp,
	"amt" integer,
	"amt_paid" integer,
	"interest" real
);
--> statement-breakpoint
CREATE TABLE "gold_loan_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan" uuid,
	"date" timestamp,
	"amt" integer,
	"type" text,
	"desc" text
);
--> statement-breakpoint
CREATE TABLE "item_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer" uuid,
	"date" timestamp,
	"name" text,
	"weight" real,
	"tunch" integer,
	"status" text,
	"amt" integer,
	"amt_paid" integer
);
--> statement-breakpoint
CREATE TABLE "item_purchased" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill" uuid,
	"name" text,
	"metal" text,
	"weight" real,
	"melting" real,
	"wastage" real,
	"making" real,
	"extra_charges" real,
	"amt" real,
	"order" uuid
);
--> statement-breakpoint
CREATE TABLE "item_repairing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer" uuid,
	"desc" text,
	"status" text,
	"amt" integer,
	"paid_amt" integer
);
--> statement-breakpoint
CREATE TABLE "item_sale" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item" uuid,
	"amt" integer,
	"bill" uuid
);
--> statement-breakpoint
CREATE TABLE "item_sale_bill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp,
	"customer" uuid,
	"total_amt" integer,
	"paid_amt" integer
);
--> statement-breakpoint
CREATE TABLE "item_sale_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale" uuid,
	"date" timestamp,
	"amt_paid" integer
);
--> statement-breakpoint
CREATE TABLE "item_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp,
	"label" integer,
	"item" uuid,
	"status" text,
	"old_item_source" uuid
);
--> statement-breakpoint
CREATE TABLE "old_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer" uuid,
	"date" timestamp,
	"weight" real,
	"metal" text,
	"amt" real,
	"paid_amt" real,
	"tunch" real,
	"sale_bill" uuid,
	"order" uuid,
	"status" text,
	"processed_date" timestamp
);
--> statement-breakpoint
ALTER TABLE "misc_item" ADD CONSTRAINT "misc_item_category_misc_category_id_fk" FOREIGN KEY ("category") REFERENCES "public"."misc_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lend" ADD CONSTRAINT "lend_lender_entity_id_fk" FOREIGN KEY ("lender") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lend_repayment" ADD CONSTRAINT "lend_repayment_lend_lend_id_fk" FOREIGN KEY ("lend") REFERENCES "public"."lend"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_borrower_entity_id_fk" FOREIGN KEY ("borrower") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_repayment" ADD CONSTRAINT "loan_repayment_loan_loan_id_fk" FOREIGN KEY ("loan") REFERENCES "public"."loan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_supplier_entity_id_fk" FOREIGN KEY ("supplier") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_bill_bill_id_fk" FOREIGN KEY ("bill") REFERENCES "public"."bill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fine_purchase" ADD CONSTRAINT "fine_purchase_supplier_entity_id_fk" FOREIGN KEY ("supplier") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_loan" ADD CONSTRAINT "gold_loan_customer_entity_id_fk" FOREIGN KEY ("customer") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_loan_payment" ADD CONSTRAINT "gold_loan_payment_loan_gold_loan_id_fk" FOREIGN KEY ("loan") REFERENCES "public"."gold_loan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_order" ADD CONSTRAINT "item_order_customer_entity_id_fk" FOREIGN KEY ("customer") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_purchased" ADD CONSTRAINT "item_purchased_bill_bill_id_fk" FOREIGN KEY ("bill") REFERENCES "public"."bill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_purchased" ADD CONSTRAINT "item_purchased_order_item_order_id_fk" FOREIGN KEY ("order") REFERENCES "public"."item_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_repairing" ADD CONSTRAINT "item_repairing_customer_entity_id_fk" FOREIGN KEY ("customer") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_sale" ADD CONSTRAINT "item_sale_item_item_stock_id_fk" FOREIGN KEY ("item") REFERENCES "public"."item_stock"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_sale" ADD CONSTRAINT "item_sale_bill_item_sale_bill_id_fk" FOREIGN KEY ("bill") REFERENCES "public"."item_sale_bill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_sale_bill" ADD CONSTRAINT "item_sale_bill_customer_entity_id_fk" FOREIGN KEY ("customer") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_sale_details" ADD CONSTRAINT "item_sale_details_sale_item_sale_bill_id_fk" FOREIGN KEY ("sale") REFERENCES "public"."item_sale_bill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stock" ADD CONSTRAINT "item_stock_item_item_purchased_id_fk" FOREIGN KEY ("item") REFERENCES "public"."item_purchased"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stock" ADD CONSTRAINT "item_stock_old_item_source_old_item_id_fk" FOREIGN KEY ("old_item_source") REFERENCES "public"."old_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "old_item" ADD CONSTRAINT "old_item_customer_entity_id_fk" FOREIGN KEY ("customer") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "old_item" ADD CONSTRAINT "old_item_sale_bill_item_sale_bill_id_fk" FOREIGN KEY ("sale_bill") REFERENCES "public"."item_sale_bill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "old_item" ADD CONSTRAINT "old_item_order_item_order_id_fk" FOREIGN KEY ("order") REFERENCES "public"."item_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_balance_date_location_uq" ON "daily_balance" USING btree ("date","location");