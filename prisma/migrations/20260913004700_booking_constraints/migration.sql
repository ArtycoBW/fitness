ALTER TABLE "ClientOccupancy" ADD CONSTRAINT client_occupancy_period CHECK ("endAt">"startAt"), ADD CONSTRAINT client_no_overlap EXCLUDE USING gist ("clientId" WITH =, tsrange("startAt","endAt",'[)') WITH &&) WHERE (active);
ALTER TABLE "Booking" ADD CONSTRAINT booking_state CHECK ((status IN ('NEW','WAITLISTED','WAITLIST_EXPIRED','WAITLIST_SKIPPED','CANCELLED_ON_TIME','CANCELLED_BY_CLUB') AND "balanceState"='NONE') OR (status='CONFIRMED' AND "balanceState"='RESERVED') OR (status IN ('ATTENDED','NO_SHOW','CANCELLED_LATE') AND "balanceState"='CONSUMED'));
CREATE TRIGGER booking_event_immutable BEFORE UPDATE OR DELETE ON "BookingEvent" FOR EACH ROW EXECUTE FUNCTION immutable_history();
CREATE FUNCTION guard_booking_capacity() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE cap INTEGER; occupied BIGINT; BEGIN
IF NEW.status IN ('CONFIRMED','ATTENDED','NO_SHOW') THEN
SELECT capacity INTO cap FROM "ScheduledSession" WHERE id=NEW."sessionId" FOR UPDATE;
SELECT COUNT(*) INTO occupied FROM "Booking" WHERE "sessionId"=NEW."sessionId" AND id<>NEW.id AND status IN ('CONFIRMED','ATTENDED','NO_SHOW');
IF occupied>=cap THEN RAISE EXCEPTION 'Session is full' USING ERRCODE='23514'; END IF;
END IF; RETURN NEW; END; $$;
CREATE TRIGGER booking_capacity_guard BEFORE INSERT OR UPDATE ON "Booking" FOR EACH ROW EXECUTE FUNCTION guard_booking_capacity();
