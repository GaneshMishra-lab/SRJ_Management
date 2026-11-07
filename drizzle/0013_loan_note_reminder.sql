ALTER TABLE "lend" ADD COLUMN "remind_on" date;--> statement-breakpoint
ALTER TABLE "loan" ADD COLUMN "remind_on" date;--> statement-breakpoint
ALTER TABLE "loan_entry" ADD COLUMN "note" text;