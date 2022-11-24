import {FirebaseObject} from './firebase_object';

export interface Announcement extends FirebaseObject {
    id?: string,
    title?: string,
    subtitle?: string,
    body?: string,
    created_on?: number,
    created_by?: string,
    updated_by?: string,
    updated_on?: number,
    display_name?: string,
    is_deleted?:boolean
}
