import { FirebaseObject } from "./firebase_object";

export interface BankAccount extends FirebaseObject {
  bank_account_number: string;
  swift: string;
  id: string;
  is_deleted: boolean;
  housing_company_id: string;
}
