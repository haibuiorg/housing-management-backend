import { FirebaseObject } from "./firebase_object";

export interface Translation extends FirebaseObject {
    value: string;
    language_code: string;
}