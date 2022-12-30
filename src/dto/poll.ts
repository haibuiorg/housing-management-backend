import {FirebaseObject} from './firebase_object';

export interface Poll extends FirebaseObject {
    id: string;
    name: string;
    type: 'generic'|'company_internal'|'company'| 'message',
    description: string;
    expandable: boolean;
    annonymous: boolean;
    deleted: boolean;
    multiple: boolean;
    created_on: number;
    company_id?: string | null;
    ended_on: number;
    updated_on?: number | null;
    invitees: string[];
    voting_options: VotingOption[];
    created_by: string;
    created_by_name: string
    updated_by: string | null;
    updated_by_name: string | null,
}

export interface VotingOption extends FirebaseObject {
    id: number;
    description: string;
    added_by_name: string;
    added_by_user_id: string;
    voters: string[],
}
