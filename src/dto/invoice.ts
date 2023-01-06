import {FirebaseObject} from './firebase_object';


export interface Invoice extends FirebaseObject {
    id: string;
    group_id: string;
    invoice_name: string;
    subtotal: number;
    paid: number;
    reference_number?: string;
    items: InvoiceItem[];
    receiver: string;
    storage_link?: string;
    invoice_url?: string;
    invoice_url_expiration?: number;
    payment_date: number;
    virtual_barcode?: string;
    is_deleted: boolean;
    created_on: number;
    company_id: string;
    status: 'paid' | 'pending'
    currency_code: string;
}

export interface InvoiceGroup extends FirebaseObject {
    id: string,
    invoice_name: string,
    created_on: number;
    is_deleted: boolean;
    company_id: string;
    payment_date: number;
    number_of_invoices: number;
}

export interface InvoiceItem extends FirebaseObject {
    name: string,
    description: string,
    unit_cost: number,
    quantity: number,
    total: number,
    tax_percentage: number,
}
