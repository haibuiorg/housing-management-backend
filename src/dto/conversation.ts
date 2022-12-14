import {FirebaseObject} from './firebase_object';

export interface Conversation extends FirebaseObject {
    id: string,
    channel_id: string,
    name: string,
    type: string,
    user_ids?: string[],
    is_archived?: boolean;
    created_on?: number,
    updated_on?: number,
    status?: string,
    last_message_not_seen_by?: string[],
}
