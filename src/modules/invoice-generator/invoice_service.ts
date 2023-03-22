import { Request, Response } from "express";

import { generateInvoicePdf } from "./generate_invoice_pdf";
import { Invoice, InvoiceGroup, InvoiceItem } from "../../dto/invoice";
import admin, { firestore } from "firebase-admin";
import {
  isAdminRole,
  isCompanyManager,
} from "../authentication/authentication";
import { retrieveUsers } from "../housing/manage_housing_company";
// eslint-disable-next-line max-len
import {
  COMPANY_ID,
  CREATED_ON,
  GROUP_ID,
  HOUSING_COMPANIES,
  INVOICES,
  INVOICE_GROUP,
  IS_DELETED,
  RECEIVER,
  STATUS,
} from "../../constants";
import { sendEmail } from "../email/email_module";
import { getUserDisplayName } from "../user/manage_user";
import { getBankAccounts } from "../payment/manage_payment";
import { hashCode } from "../../strings_utils";
import { sendNotificationToUsers } from "../notification/notification_service";
import { getPublicLinkForFile } from "../storage/manage_storage";
import { Address } from "../../dto/address";
import {
  getSubscriptionPlanById,
  hasOneActiveSubscription,
} from "../subscription/subscription-service";
import { deductCredit, getTotalCredit } from "../credit/credit-service";
import { BankAccount } from "../../dto/bank_account";
import { Company } from "../../dto/company";
import { User } from "../../dto/user";
const finnishBankUtils = require("finnish-bank-utils");

export const generateInvoice = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.body.company_id;
  const receiverIds = request.body.receiver_ids;
  const invoiceName = request.body.invoice_name;
  const items = request.body.items as InvoiceItem[];
  const sendEmail = request.body.send_email ?? false;
  const currentDate = new Date().getTime();
  const paymentDateInMs = request.body.payment_date ?? currentDate + 1209600000;
  const bankAccountId = request.body.bank_account_id;
  
  const company = await isCompanyManager(userId, companyId);
  if (!company) {
    response.status(403).send({ errors: { error: "unauthorized" } });
    return;
  }
  const activeSubscription = await hasOneActiveSubscription(companyId);
  if (!activeSubscription) {
    response.status(403).send({
      errors: {
        error: "No active subscription",
        code: "no_active_subscription",
      },
    });
    return;
  }
  const subscriptionPlan = await getSubscriptionPlanById(
    activeSubscription.subscription_plan_id
  );
  const invoiceCount = await getThisCycleCompanyInvoiceCount(companyId);
  const companyCredit = company.credit_amount ?? 0;
  if (invoiceCount >= subscriptionPlan.max_invoice_number) {
    if (
      subscriptionPlan.additional_invoice_cost > companyCredit ||
      !request.body.use_credit
    ) {
      response.status(403).send({
        errors: {
          error: "Max invoice number reached",
          code: "max_invoice_number_reached",
        },
      });
      return;
    }
  }
  const companyBankAccounts = await getBankAccounts(companyId, false);
  if (!companyBankAccounts || companyBankAccounts.length === 0) {
    response.status(500).send({ errors: { error: "No bank account added" } });
    return;
  }
  
  const bankAccount =
    companyBankAccounts.filter((item) => item.id === bankAccountId)[0] ??
    companyBankAccounts[0];
  const reveiverDetail = await retrieveUsers(receiverIds);
  const params: GenerateInvoiceParams = {
    userId,
    company,
    invoiceName,
    reveiverDetail,
    bankAccount,
    paymentDateInMs,
    shouldSendEmail: sendEmail,
    items,
  }
  const invoiceList = await generateInvoiceList(params);
  await deductCredit(companyId, subscriptionPlan.additional_invoice_cost);
  response.send(invoiceList);
};

export interface GenerateInvoiceParams {
  userId: string,
  company: Company,
  invoiceName: string,
  reveiverDetail: User[],
  bankAccount: BankAccount,
  paymentDateInMs: number,
  shouldSendEmail: boolean,
  items: InvoiceItem[],
}

export const generateInvoiceList = async (
  params: GenerateInvoiceParams
): Promise<Invoice[]> => {
  const invoiceList: Invoice[] = [];
  const groupId = admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(params.company.id ?? '')
    .collection(INVOICE_GROUP)
    .doc().id;
  const invoiceGroup: InvoiceGroup = {
    id: groupId,
    invoice_name: params.invoiceName,
    is_deleted: false,
    created_on: Date.now(),
    company_id: params.company.id ?? '',
    payment_date: params.paymentDateInMs,
    number_of_invoices: params.reveiverDetail.length,
  };
  const paymentDate = new Date(params.paymentDateInMs);
  const formatDate =
    paymentDate.getDate() +
    "." +
    (paymentDate.getMonth() + 1) +
    "." +
    paymentDate.getFullYear();
  const total = params.items.reduce(
    (previous, newItem) => previous + newItem.total,
    0
  );
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(params.company.id ?? '')
    .collection(INVOICE_GROUP)
    .doc(groupId)
    .set(invoiceGroup);
  await Promise.all(
    params.reveiverDetail.map(async (receiver) => {
      const id = admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(params.company.id ?? '')
        .collection(INVOICES)
        .doc().id;
      const ref = finnishBankUtils.generateFinnishRefNumber(hashCode(id));
      const virtualBarcode = finnishBankUtils.formatFinnishVirtualBarCode({
        iban: params.bankAccount.bank_account_number,
        sum: Number(total.toFixed(2)),
        reference: ref,
        date: formatDate,
      });
      const fileName =
        HOUSING_COMPANIES +
        "/" +
        (params.company.id ?? '') +
        "/" +
        "invoices/" +
        receiver.user_id +
        "/" +
        id +
        ".pdf";
      const invoice: Invoice = {
        id: id,
        currency_code: params.company.currency_code ?? "",
        group_id: groupId,
        created_on: Date.now(),
        reference_number: ref,
        invoice_name: params.invoiceName ?? "Invoice",
        subtotal: total,
        paid: 0,
        is_deleted: false,
        receiver: receiver.user_id,
        items: params.items,
        company_id: params.company.id ?? '',
        virtual_barcode: virtualBarcode,
        payment_date: params.paymentDateInMs,
        storage_link: fileName,
        status: "pending",
      };
      await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(params.company.id ?? '')
        .collection(INVOICES)
        .doc(id)
        .set(invoice);
      invoiceList.push(invoice);
      const gs = admin
        .storage()
        .bucket()
        .file(fileName)
        .createWriteStream({
          resumable: false,
          validation: false,
          contentType: "auto",
          metadata: {
            "Cache-Control": "public, max-age=31536000",
          },
        })
        .addListener("finish", async () => {
          if (params.shouldSendEmail) {
            const acitveSubscription = await hasOneActiveSubscription(
              params.company.id ?? ''
            );
            if (!acitveSubscription || acitveSubscription.is_active !== true) {
              return;
            }
            const subscriptionPlan = await getSubscriptionPlanById(
              acitveSubscription.subscription_plan_id
            );
            if (subscriptionPlan.notification_types.includes("email")) {
              await sendEmail(
                [receiver.email],
                await getUserDisplayName(params.userId, params.company.id ?? ''),
                "New invoice: " + invoice.invoice_name,
                "New invoice arrive",
                "Hello New invoice arrived. Total: " +
                  invoice.subtotal +
                  ". Due date: " +
                  new Date(invoice.payment_date),
                [fileName]
              );
            }
          }
        });
      const address: Address = receiver.addresses
        ? receiver.addresses[0]
        : { id: "" };
      await generateInvoicePdf(
        invoice,
        params.company,
        params.bankAccount,
        receiver,
        gs,
        address
      );
      await sendNotificationToUsers([receiver.user_id], {
        title: "New invoice: " + invoice.invoice_name,
        body:
          "New invoice arrived. Total: " +
          invoice.subtotal +
          ". Due date: " +
          new Date(invoice.payment_date),
      });
    })
  );
  return invoiceList;
}


export const getInvoices = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const companyId = request.query.company_id;
  const lastCreatedOn: number =
    parseInt(request.query.last_created_on?.toString() ?? "0") ??
    new Date().getTime();
  const limit = request.query.limit
    ? parseInt(request.query.limit.toString())
    : 10;
  const status = request.query.status;
  const onlyPersonal = request.query.personal ?? true;
  const groupId = request.query.group_id;

  let query = admin
    .firestore()
    .collectionGroup(INVOICES)
    .where(CREATED_ON, "<=", lastCreatedOn);
  if (companyId) {
    query = query.where(COMPANY_ID, "==", companyId);
  }
  if (groupId) {
    query = query.where(GROUP_ID, "==", groupId);
  }
  if (onlyPersonal) {
    query = query.where(RECEIVER, "==", userId);
  } else {
    if (!(await isCompanyManager(userId, companyId?.toString() ?? ""))) {
      response.status(403).send({ errors: { error: "unauthorized" } });
      return;
    }
  }
  if (status) {
    query = query.where(STATUS, "==", status);
  }
  query.limit(limit);
  try {
    const invoices = (await query.get()).docs.map((doc) => doc.data());
    response.status(200).send(invoices);
  } catch (errors) {
    console.log(errors);
    response.status(500).send({ errors: errors });
  }
};

export const getCompanyInvoiceGroups = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user.uid;
  const companyId = request.query.company_id;
  const lastCreatedOn =
    parseFloat(
      request.query.last_created_on?.toString() ??
        new Date().getTime().toString()
    ) ?? new Date().getTime();
  const limit = request.query.limit
    ? parseInt(request.query.limit.toString())
    : 10;
  const isAdmin = await isAdminRole(userId);
  let query = admin
    .firestore()
    .collectionGroup(INVOICE_GROUP)
    .where(CREATED_ON, "<=", lastCreatedOn);
  if (!(request.query.include_deleted && isAdmin)) {
    query = query.where(IS_DELETED, "==", false);
  }
  if (companyId) {
    if (!(await isCompanyManager(userId, companyId?.toString() ?? ""))) {
      response.status(403).send({ errors: { error: "unauthorized" } });
      return;
    }
    query = query.where(COMPANY_ID, "==", companyId);
  } else {
    if (!isAdmin) {
      response.status(403).send({ errors: { error: "unauthorized" } });
      return;
    }
  }
  query.limit(limit);
  try {
    const invoiceGroups = (await query.get()).docs.map((doc) => doc.data());
    response.status(200).send(invoiceGroups);
  } catch (errors) {
    console.log(errors);
    response.status(500).send({ errors: errors });
  }
};

export const getInvoiceDetail = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user.uid;
  const invoiceId = request.params.invoiceId;
  try {
    const invoice = (
      await admin
        .firestore()
        .collectionGroup(INVOICES)
        .where("id", "==", invoiceId)
        .limit(1)
        .get()
    ).docs.map((doc) => doc.data())[0] as Invoice;
    const now = new Date().getTime();

    if ((invoice.invoice_url_expiration ?? now) <= now) {
      const expiration = now + 604000;
      const invoiceUrl = await getPublicLinkForFile(
        invoice.storage_link ?? "",
        expiration
      );
      await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(invoice.company_id)
        .collection(INVOICES)
        .doc(invoiceId)
        .update({
          invoice_url: invoiceUrl,
          invoice_url_expiration: expiration,
        });
    }
    if (
      !invoice ||
      invoice.receiver != userId ||
      !(await isCompanyManager(userId, invoice.company_id))
    ) {
      response.status(403).send({ errors: { error: "unauthorized" } });
      return;
    }
    response.status(200).send(invoice);
  } catch (errors) {
    console.log(errors);
    response.status(500).send(errors);
  }
};

export const deleteInvoice = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const invoiceId = request.params.invoiceId;
  try {
    const invoice = (
      await admin
        .firestore()
        .collectionGroup(INVOICES)
        .where("id", "==", invoiceId)
        .limit(1)
        .get()
    ).docs.map((doc) => doc.data())[0] as Invoice;
    const now = new Date().getTime();
    if ((invoice.invoice_url_expiration ?? now) <= now) {
      const expiration = now + 604000;
      const invoiceUrl = await getPublicLinkForFile(
        invoice.storage_link ?? "",
        expiration
      );
      await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(invoice.company_id)
        .collection(INVOICES)
        .doc(invoice.id)
        .update({
          invoice_url: invoiceUrl,
          invoice_url_expiration: expiration,
        });
    }
    if (!(await isCompanyManager(userId, invoice.company_id))) {
      response.status(403).send({ errors: { error: "unauthorized" } });
      return;
    }
    invoice.is_deleted = true;
    invoice.updated_on = now;
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(invoice.company_id)
      .collection(INVOICES)
      .doc(invoiceId)
      .update(invoice);
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(invoice.company_id)
      .collection(INVOICE_GROUP)
      .doc(invoice.groupId)
      .update({ number_of_invoices: firestore.FieldValue.increment(-1) });
    response.status(200).send(invoice);
  } catch (errors) {
    console.log(errors);
    response.status(500).send(errors);
  }
};

export const getThisCycleCompanyInvoiceCount = async (
  companyId: string
): Promise<number> => {
  const date = new Date();
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  const invoiceCount = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(INVOICE_GROUP)
      .where(CREATED_ON, ">=", firstDay.getTime())
      .where(CREATED_ON, "<=", lastDay.getTime())
      .where(IS_DELETED, "==", false)
      .count()
      .get()
  ).data().count;
  return invoiceCount;
};
