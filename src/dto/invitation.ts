import { FirebaseObject } from "./firebase_object";

export interface Invitation extends FirebaseObject { 
    apartment_id: string;
    invitation_code: string;
    email: string;
    housing_company_id: string;
    is_valid: number;
    valid_until: number;
    claimed_by: string | null;
    id: string;
    email_sent: number;
    set_as_apartment_owner: boolean;
}