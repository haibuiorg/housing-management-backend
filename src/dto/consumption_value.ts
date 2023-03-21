import { FirebaseObject } from "./firebase_object";

export interface ConsumptionValue extends FirebaseObject {
  building: string;
  house_code?: string;
  consumption: number;
  updated_on: number;
  apartment_id: string;
}
