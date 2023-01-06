import {Request, Response} from 'express';

import {generateInvoicePdf} from './generate_invoice_pdf';
import {Invoice, InvoiceGroup, InvoiceItem} from '../../dto/invoice';
import admin, {firestore} from 'firebase-admin';
import {isAdminRole, isCompanyManager} from '../authentication/authentication';
import {retrieveUsers} from '../housing/manage_housing_company';
// eslint-disable-next-line max-len
import {COMPANY_ID, CREATED_ON, GROUP_ID, HOUSING_COMPANIES, INVOICES, INVOICE_GROUP, IS_DELETED, RECEIVER, STATUS}
  from '../../constants';
import {sendAnnouncementEmail} from '../email/email_module';
import {getUserDisplayName} from '../user/manage_user';
import {getBankAccounts} from '../payment/manage_payment';
import {hashCode} from '../../strings_utils';
import {sendNotificationToUsers} from '../notification/notification_service';
import {getPublicLinkForFile} from '../storage/manage_storage';
import {Address} from '../../dto/address';
const finnishBankUtils = require('finnish-bank-utils');

export const generateInvoice =
    async (request:Request, response: Response) => {
      // @ts-ignore
      const userId = request.user?.uid;
      const companyId = request.body.company_id;
      const receiverIds = request.body.receiver_ids;
      const invoiceName = request.body.invoice_name;
      const items = request.body.items as InvoiceItem[];
      const company = await isCompanyManager(userId, companyId);
      if (!company) {
        response.status(403).send({errors: {error: 'unauthorized'}});
        return;
      }
      const companyBankAccounts = await getBankAccounts(companyId, false);
      if (!companyBankAccounts || companyBankAccounts.length === 0) {
        response.status(500).send({errors: {error: 'No bank account added'}});
        return;
      };
      const bankAccountId = request.body.bank_account_id;
      const bankAccount = companyBankAccounts
          .filter((item) => item.id === bankAccountId)[0] ??
          companyBankAccounts[0];
      const total = items.reduce(
          (previous, newItem) =>
            previous + newItem.quantity * newItem.unit_cost,
          0);
      const currentDate = new Date().getTime();
      const paymentDate =
        request.body.payment_date ??currentDate + 1209600000;
      const finnishDate = new Date(paymentDate);
      const formatDate = finnishDate.getDate() +
      '.' + (finnishDate.getMonth() + 1) +
      '.' +finnishDate.getFullYear();
      const reveiverDetail = await retrieveUsers(receiverIds);
      const invoiceList: Invoice []= [];
      const groupId = admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId)
          .collection(INVOICE_GROUP).doc().id;
      const invoiceGroup: InvoiceGroup = {
        id: groupId,
        invoice_name: invoiceName,
        is_deleted: false,
        created_on: currentDate,
        company_id: companyId,
        payment_date: paymentDate,
        number_of_invoices: reveiverDetail.length,
      };
      await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId)
          .collection(INVOICE_GROUP).doc(groupId).set(invoiceGroup);
      await Promise.all(reveiverDetail.map(async (receiver) => {
        const id = admin.firestore()
            .collection(HOUSING_COMPANIES).doc(companyId)
            .collection(INVOICES).doc().id;
        const ref = finnishBankUtils.generateFinnishRefNumber(hashCode(id));
        const virtualBarcode = finnishBankUtils.formatFinnishVirtualBarCode(
            {iban: bankAccount.bank_account_number,
              sum: total,
              reference: ref,
              date: formatDate});
        const fileName = HOUSING_COMPANIES + '/' + companyId + '/' +
              'invoices/' + receiver.user_id + '/' + id +'.pdf';
        const invoice: Invoice = {
          id: id,
          currency_code: company.currency_code ?? '',
          group_id: groupId,
          created_on: currentDate,
          reference_number: ref,
          invoice_name: invoiceName ?? 'Invoice',
          subtotal: total,
          paid: 0,
          is_deleted: false,
          receiver: receiver.user_id,
          items: items,
          company_id: companyId,
          virtual_barcode: virtualBarcode,
          payment_date: paymentDate,
          storage_link: fileName,
          status: 'pending',
        };
        await admin.firestore().collection(HOUSING_COMPANIES).doc(companyId)
            .collection(INVOICES).doc(id).set(invoice);
        invoiceList.push(invoice);
        const gs = admin.storage().bucket().file(fileName)
            .createWriteStream({
              resumable: false,
              validation: false,
              contentType: 'auto',
              metadata: {
                'Cache-Control': 'public, max-age=31536000'},
            }).addListener('finish', async () => {
              if (request.body.send_email) {
                await sendAnnouncementEmail(
                    [receiver.email],
                    await getUserDisplayName(userId, companyId),
                    'New invoice: ' + invoice.invoice_name,
                    'New invoice arrive',
                    'Hello New invoice arrived. Total: ' + invoice.subtotal +
                    '. Due date: ' +
                    new Date(invoice.payment_date), [fileName]);
              };
            });
        const address : Address =
          receiver.addresses ? receiver.addresses[0] : {id: ''};
        await generateInvoicePdf(
            invoice, company, bankAccount, receiver, gs, address);
        await sendNotificationToUsers([receiver.user_id], {
          title: 'New invoice: ' + invoice.invoice_name,
          body: 'New invoice arrived. Total: ' + invoice.subtotal +
                '. Due date: ' +
                new Date(invoice.payment_date),
        });
      }));
      response.send(invoiceList);
    };

export const getInvoices = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const companyId = request.query.company_id;
  const lastCreatedOn : number =
   parseInt(request.query.last_created_on?.toString() ?? '0') ??
    new Date().getTime();
  const limit = (request.query.limit) ?
    parseInt(request.query.limit.toString()) : 10;
  const status = request.query.status;
  const onlyPersonal = request.query.personal ?? true;
  const groupId = request.query.group_id;

  let query = admin.firestore()
      .collectionGroup(INVOICES).where(CREATED_ON, '<=', lastCreatedOn);
  if (companyId) {
    query = query.where(COMPANY_ID, '==', companyId);
  }
  if (groupId) {
    query = query.where(GROUP_ID, '==', groupId);
  }
  if (onlyPersonal) {
    query = query.where(RECEIVER, '==', userId);
  } else {
    if (!await isCompanyManager(userId, companyId?.toString() ?? '')) {
      response.status(403).send({errors: {error: 'unauthorized'}});
      return;
    }
  }
  if (status) {
    query = query.where(STATUS, '==', status);
  }
  query.limit(limit);
  try {
    const invoices = (await query.get()).docs.map((doc) => doc.data());
    response.status(200).send(invoices);
  } catch (errors) {
    console.log(errors);
    response.status(500).send({errors: errors});
  }
};

export const getCompanyInvoiceGroups =
  async (request:Request, response: Response) => {
  // @ts-ignore
    const userId = request.user.uid;
    const companyId = request.query.company_id;
    const lastCreatedOn =
      parseFloat(
          request.query.last_created_on?.toString() ??
          new Date().getTime().toString()) ??
      new Date().getTime();
    const limit = (request.query.limit) ?
      parseInt(request.query.limit.toString()) : 10;
    const isAdmin = await isAdminRole(userId);
    let query = admin.firestore()
        .collectionGroup(INVOICE_GROUP).where(CREATED_ON, '<=', lastCreatedOn);
    if (!(request.query.include_deleted && isAdmin)) {
      query = query.where(IS_DELETED, '==', false);
    }
    if (companyId) {
      if (!await isCompanyManager(userId, companyId?.toString() ?? '')) {
        response.status(403).send({errors: {error: 'unauthorized'}});
        return;
      }
      query = query.where(COMPANY_ID, '==', companyId);
    } else {
      if (!isAdmin) {
        response.status(403).send({errors: {error: 'unauthorized'}});
        return;
      }
    }
    query.limit(limit);
    try {
      const invoiceGroups = (await query.get()).docs.map((doc) => doc.data());
      response.status(200).send(invoiceGroups);
    } catch (errors) {
      console.log(errors);
      response.status(500).send({errors: errors});
    }
  };

export const getInvoiceDetail =async (request:Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const invoiceId = request.params.invoiceId;
  try {
    const invoice = (await admin.firestore().collectionGroup(INVOICES)
        .where('id', '==', invoiceId).limit(1).get())
        .docs.map((doc) => doc.data())[0] as Invoice;
    const now = new Date().getTime();

    if ((invoice.invoice_url_expiration ?? now) <= now ) {
      const expiration = now + 604000;
      const invoiceUrl =
        await getPublicLinkForFile(invoice.storage_link ?? '', expiration);
      await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(invoice.company_id)
          .collection(INVOICES).doc(invoiceId)
          .update({invoice_url: invoiceUrl,
            invoice_url_expiration: expiration});
    }
    if (!invoice || invoice.receiver != userId ||
      !(await isCompanyManager(userId, invoice.company_id))) {
      response.status(403).send({errors: {error: 'unauthorized'}});
      return;
    }
    response.status(200).send(invoice);
  } catch (errors) {
    console.log(errors);
    response.status(500).send(errors);
  }
};

export const deleteInvoice = async (request:Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const invoiceId = request.params.invoiceId;
  try {
    const invoice = (await admin.firestore().collectionGroup(INVOICES)
        .where('id', '==', invoiceId).limit(1).get())
        .docs.map((doc) => doc.data())[0] as Invoice;
    const now = new Date().getTime();
    if ((invoice.invoice_url_expiration ?? now) <= now ) {
      const expiration = now + 604000;
      const invoiceUrl =
            await getPublicLinkForFile(invoice.storage_link ?? '', expiration);
      await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(invoice.company_id)
          .collection(INVOICES).doc(invoice.id)
          .update({invoice_url: invoiceUrl,
            invoice_url_expiration: expiration});
    }
    if (!(await isCompanyManager(userId, invoice.company_id))) {
      response.status(403).send({errors: {error: 'unauthorized'}});
      return;
    }
    invoice.is_deleted = true;
    invoice.updated_on = now;
    await admin.firestore()
        .collection(HOUSING_COMPANIES).doc(invoice.company_id)
        .collection(INVOICES).doc(invoiceId).update(invoice);
    await admin.firestore()
        .collection(HOUSING_COMPANIES).doc(invoice.company_id)
        .collection(INVOICE_GROUP).doc(invoice.groupId)
        .update({number_of_invoices: firestore.FieldValue.increment(-1)});
    response.status(200).send(invoice);
  } catch (errors) {
    console.log(errors);
    response.status(500).send(errors);
  }
};
