-- Twilio calls start as "authorized" when a signed call intent is reserved,
-- before Twilio returns a Call SID; 0003 predates the Twilio call store.
ALTER TABLE calls DROP CONSTRAINT calls_status_check;--> statement-breakpoint
ALTER TABLE calls ADD CONSTRAINT calls_status_check CHECK (status IN ('created','manual_dial_ready','authorized','dialing','ringing','answered','completed','no_answer','failed'));
