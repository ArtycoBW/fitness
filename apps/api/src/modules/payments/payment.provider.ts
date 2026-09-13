import { Injectable } from "@nestjs/common";
export type ProviderResult = "SUCCEEDED" | "FAILED" | "UNKNOWN";
export interface PaymentProvider {
  resolve(outcome: string, checkCount: number): ProviderResult;
}
// Outcomes are persisted by the server, never accepted from a browser request.
// Replace this adapter with signed provider events when real acquiring is enabled.
@Injectable()
export class InternalPaymentProvider implements PaymentProvider {
  resolve(outcome: string, checkCount: number): ProviderResult {
    if (outcome === "FAILURE") return "FAILED";
    if (outcome === "UNKNOWN" && checkCount === 0) return "UNKNOWN";
    return "SUCCEEDED";
  }
}
