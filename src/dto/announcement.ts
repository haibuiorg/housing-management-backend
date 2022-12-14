import {FirebaseObject} from './firebase_object';
import {StorageItem} from './storage_item';

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
    is_deleted?:boolean,
    storage_items?: StorageItem[]
}
