import { ConsumptionValue } from './consumption_value';
import { FirebaseObject } from './firebase_object';

export interface WaterConsumption extends FirebaseObject {
  basic_fee: number;
  id: string;
  period: number;
  price_id: string;
  price_per_cube: number;
  total_reading: number;
  year: number;
  consumption_values?: ConsumptionValue[];
}
