ALTER TABLE "misc_trade" ALTER COLUMN "entity" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "misc_trade" ALTER COLUMN "item" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "misc_trade" ADD CONSTRAINT "misc_trade_entity_entity_id_fk" FOREIGN KEY ("entity") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misc_trade" ADD CONSTRAINT "misc_trade_item_misc_item_id_fk" FOREIGN KEY ("item") REFERENCES "public"."misc_item"("id") ON DELETE no action ON UPDATE no action;