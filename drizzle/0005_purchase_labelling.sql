ALTER TABLE "item_purchased" ADD COLUMN "item_type" uuid;--> statement-breakpoint
ALTER TABLE "item_purchased" ADD COLUMN "gross_weight" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "item_purchased" ADD COLUMN "net_weight" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "item_purchased" ADD COLUMN "melting" numeric(7, 3);--> statement-breakpoint
ALTER TABLE "item_purchased" ADD CONSTRAINT "item_purchased_item_type_item_type_id_fk" FOREIGN KEY ("item_type") REFERENCES "public"."item_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_stock_item_uq" ON "item_stock" USING btree ("item");--> statement-breakpoint
-- Pieces bought before labelling was a separate step: copy what the bill said from the stock piece it made.
UPDATE "item_purchased" p SET "item_type" = s."item_type", "gross_weight" = s."gross_weight", "net_weight" = s."net_weight", "melting" = s."melting" FROM "item_stock" s WHERE s."item" = p."id";