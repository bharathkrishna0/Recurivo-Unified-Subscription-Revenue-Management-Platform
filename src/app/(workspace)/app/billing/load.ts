import { notFound } from "next/navigation";
import { AppError } from "@/server/platform/errors";

export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export const METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Bank transfer",
  UPI: "UPI",
  CARD_EXTERNAL: "Card (external)",
  CHEQUE: "Cheque",
  CASH: "Cash",
  OTHER: "Other",
};

export const stateKey = (state: string) => state.toUpperCase().replaceAll(" ", "_");
