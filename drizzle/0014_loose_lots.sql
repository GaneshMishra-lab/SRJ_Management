ALTER TABLE "item_sale" ADD COLUMN "lot_wastage" numeric(7, 3);--> statement-breakpoint
ALTER TABLE "item_sale" ADD COLUMN "lot_making" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "item_sale" ADD COLUMN "pieces" integer;--> statement-breakpoint
ALTER TABLE "item_type" ADD COLUMN "counted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "loose_stock_ledger" ADD COLUMN "wastage" numeric(7, 3) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "loose_stock_ledger" ADD COLUMN "making" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "loose_stock_ledger" ADD COLUMN "pieces" integer;