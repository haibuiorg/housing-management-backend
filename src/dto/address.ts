import { FirebaseObject } from "./firebase_object";

export interface Address extends FirebaseObject {
  street_address_1?: string;
  street_address_2?: string;
  postal_code?: string;
  city?: string;
  country_code?: string;
  id: string;
}
