ALTER TABLE "Order" ADD CONSTRAINT order_money CHECK ("totalMinor">0 AND currency='RUB');
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT payment_money CHECK ("amountMinor">0), ADD CONSTRAINT payment_status CHECK (status IN ('PROCESSING','UNKNOWN','SUCCEEDED','FAILED','CANCELLED')), ADD CONSTRAINT payment_last4 CHECK ("maskedLast4" IS NULL OR (method='CARD' AND "maskedLast4" ~ '^[0-9]{4}$'));
CREATE UNIQUE INDEX one_active_payment ON "PaymentAttempt" ("orderId") WHERE status IN ('PROCESSING','UNKNOWN');
CREATE UNIQUE INDEX one_successful_payment ON "PaymentAttempt" ("orderId") WHERE status='SUCCEEDED';
ALTER TABLE "Refund" ADD CONSTRAINT refund_money CHECK ("amountMinor">0), ADD CONSTRAINT refund_status CHECK (status IN ('PROCESSING','UNKNOWN','SUCCEEDED','FAILED')), ADD CONSTRAINT refund_action CHECK ("entitlementAction" IN ('KEEP','CANCEL'));
CREATE TRIGGER confirmation_immutable BEFORE UPDATE OR DELETE ON "PaymentConfirmation" FOR EACH ROW EXECUTE FUNCTION immutable_history();
CREATE TRIGGER payment_event_immutable BEFORE UPDATE OR DELETE ON "PaymentEvent" FOR EACH ROW EXECUTE FUNCTION immutable_history();
CREATE FUNCTION guard_order_terms() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF NEW."clientId" IS DISTINCT FROM OLD."clientId" OR NEW."planVersionId" IS DISTINCT FROM OLD."planVersionId" OR NEW."productSnapshot" IS DISTINCT FROM OLD."productSnapshot" OR NEW."totalMinor" IS DISTINCT FROM OLD."totalMinor" OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW."activationDate" IS DISTINCT FROM OLD."activationDate" THEN RAISE EXCEPTION 'Order purchase terms are immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER order_terms_immutable BEFORE UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION guard_order_terms();
CREATE FUNCTION guard_payment_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF TG_OP='DELETE' OR OLD.status='SUCCEEDED' THEN RAISE EXCEPTION 'Successful payments are immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER payment_history_guard BEFORE UPDATE OR DELETE ON "PaymentAttempt" FOR EACH ROW EXECUTE FUNCTION guard_payment_history();
CREATE FUNCTION guard_refund_limit() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE paid INTEGER; used BIGINT; BEGIN
IF TG_OP='UPDATE' AND OLD.status IN ('SUCCEEDED','FAILED') THEN RAISE EXCEPTION 'Finished refunds are immutable'; END IF;
SELECT "amountMinor" INTO paid FROM "PaymentAttempt" WHERE id=NEW."paymentId" AND status='SUCCEEDED' FOR UPDATE;
IF paid IS NULL THEN RAISE EXCEPTION 'Refund requires successful payment'; END IF;
SELECT COALESCE(SUM("amountMinor"),0) INTO used FROM "Refund" WHERE "paymentId"=NEW."paymentId" AND id<>NEW.id AND status<>'FAILED';
IF NEW.status<>'FAILED' AND used+NEW."amountMinor">paid THEN RAISE EXCEPTION 'Refund exceeds paid amount'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER refund_limit_guard BEFORE INSERT OR UPDATE ON "Refund" FOR EACH ROW EXECUTE FUNCTION guard_refund_limit();
