CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION immutable_history();
CREATE TRIGGER lead_event_immutable BEFORE UPDATE OR DELETE ON "LeadEvent" FOR EACH ROW EXECUTE FUNCTION immutable_history();
ALTER TABLE "Lead" ADD CONSTRAINT lead_status CHECK(status IN ('NEW','CONTACTED','SCHEDULED','WON','CLOSED'));
ALTER TABLE "ExportJob" ADD CONSTRAINT export_status CHECK(status IN ('PENDING','PROCESSING','READY','FAILED','EXPIRED'));
CREATE INDEX payment_confirmed_report ON "PaymentAttempt"("confirmedAt") WHERE status='SUCCEEDED';
CREATE INDEX refund_completed_report ON "Refund"("completedAt") WHERE status='SUCCEEDED';
