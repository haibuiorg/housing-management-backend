import {FirebaseObject} from './firebase_object';

export interface Image extends FirebaseObject {
    id: string,
    storage_link: string,
    image_type: string,
    presigned_url?: string,
    exprired_on?: number,
    is_deleted?: boolean,
    uploaded_by?: string,
};
