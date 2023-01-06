import {FirebaseObject} from './firebase_object';

export interface Tax extends FirebaseObject {
    tax_percentage: number,
    tax_name: string,
    id: string,
}
