import { FirebaseObject } from "./firebase_object";

export interface WaterPrice extends FirebaseObject {
  basic_fee?: number;
  id: string;
  is_active: boolean;
  price_per_cube?: number;
  updated_on: number;
}
