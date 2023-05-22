/* eslint-disable camelcase */
import { Request, Response } from 'express';
import admin from 'firebase-admin';
import {
  CONTACT_LEADS,
  COUNTRY_CODE,
  HOUSING_COMPANIES,
  IS_ACTIVE,
  PAYMENT_PRODUCT_ITEMS,
  STORAGE_ITEMS,
  SUBSCRIPTION_PLAN,
} from '../../constants';
import { SubscriptionPlan } from '../../dto/subscription_plan';
import { isAdminRole } from '../authentication/authentication';
import { addStripeProduct, addStripeSubscriptionProduct } from '../payment-externals/payment-service';
import { PaymentProductItem } from '../../dto/payment-product-item';
import { getCountryData } from '../country/manage_country';
import { addReferenceDoc, createPineconeIndex, getPineconeIndexes } from '../chat-helper/chat-helper-service';
import { copyStorageFolder } from '../storage/manage_storage';
import { StorageItem } from '../../dto/storage_item';

export const addSubscriptionPlan = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const isAdmin = await isAdminRole(userId);
  if (!isAdmin) {
    response.sendStatus(403);
    return;
  }
  const {
    name,
    price,
    country_code = 'fi',
    currency = 'eur',
    interval = 'month',
    interval_count = 1,
    max_announcement = 5,
    max_invoice_number = 1,
    additional_invoice_cost = 0.99,
    has_apartment_document = false,
    notification_types = ['push'],
    max_messaging_channels = 3,
  } = request.body;
  const stripeSubscription = await addStripeSubscriptionProduct(name, interval, currency, price);
  const subscriptionStripeProductId = stripeSubscription.id;
  const subscrptionStripePriceId = stripeSubscription.default_price;
  const id = admin.firestore().collection(SUBSCRIPTION_PLAN).doc().id;
  const subscriptionPlan: SubscriptionPlan = {
    id,
    name,
    price,
    currency,
    country_code,
    is_active: true,
    stripe_product_id: subscriptionStripeProductId,
    stripe_price_id: subscrptionStripePriceId,
    created_on: new Date().getTime(),
    translation: false,
    max_messaging_channels,
    max_announcement,
    max_invoice_number,
    additional_invoice_cost,
    interval,
    interval_count,
    notification_types,
    has_apartment_document,
  };
  try {
    await admin.firestore().collection(SUBSCRIPTION_PLAN).doc(id).set(subscriptionPlan);
    response.send(subscriptionPlan);
  } catch (error) {
    response.sendStatus(500);
  }
};

export const addPaymentProductItem = async (request: Request, response: Response) => {
  const { amount, name, country_code, description = '', tax_percentage } = request.body;
  // @ts-ignore
  const userId = request.user.uid;
  if (!(await isAdminRole(userId))) {
    response.sendStatus(403);
    return;
  }
  const country = await getCountryData(country_code);
  const stripeProduct = await addStripeProduct(name, country.currency_code, amount);
  const stripeProductId = stripeProduct.id;
  const stripePriceId = stripeProduct.default_price;
  const id = admin.firestore().collection(PAYMENT_PRODUCT_ITEMS).doc().id;
  const paymentProducItem: PaymentProductItem = {
    description,
    id,
    name,
    amount,
    tax_percentage: tax_percentage ?? 0,
    currency_code: country.currency_code,
    country_code,
    is_active: true,
    stripe_product_id: stripeProductId,
    stripe_price_id: stripePriceId,
    created_on: Date.now(),
    company_id: null,
  };
  try {
    await admin.firestore().collection(PAYMENT_PRODUCT_ITEMS).doc(id).set(paymentProducItem);
    response.send(paymentProducItem);
  } catch (error) {
    response.sendStatus(500);
  }
};
export const deletePaymentProductItem = async (request: Request, response: Response) => {
  const { id } = request.query;
  // @ts-ignore
  const userId = request.user.uid;
  if (!(await isAdminRole(userId))) {
    response.sendStatus(403);
    return;
  }
  try {
    await admin
      .firestore()
      .collection(PAYMENT_PRODUCT_ITEMS)
      .doc(id?.toString() ?? '')
      .update({ is_active: false });
    response.sendStatus(200);
  } catch (error) {
    response.sendStatus(500);
  }
};

export const getPaymentProductItems = async (request: Request, response: Response) => {
  const country_code = request.query.country_code?.toString() ?? 'fi';
  try {
    const paymentProductItems = await admin
      .firestore()
      .collection(PAYMENT_PRODUCT_ITEMS)
      .where(IS_ACTIVE, '==', true)
      .where(COUNTRY_CODE, '==', country_code)
      .where('company_id', '==', null)
      .get();
    const paymentProductItemsList = paymentProductItems.docs.map((doc) => doc.data() as PaymentProductItem);
    response.send(paymentProductItemsList);
  } catch (error) {
    response.sendStatus(500);
  }
};

export const deleteSubscriptionPlan = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const isAdmin = await isAdminRole(userId);
  if (!isAdmin) {
    response.sendStatus(403);
    return;
  }
  const subscriptionPlanId = request.query.subscription_plan_id?.toString() ?? '';
  if (subscriptionPlanId === '') {
    response.sendStatus(400);
    return;
  }
  try {
    await admin.firestore().collection(SUBSCRIPTION_PLAN).doc(subscriptionPlanId).update({ is_active: false });
    response.sendStatus(200);
  } catch (error) {
    response.sendStatus(500);
  }
};

export const getContactLeadListRequest = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const isAdmin = await isAdminRole(userId);
  if (!isAdmin) {
    response.sendStatus(403);
    return;
  }
  const status = request.query.status?.toString() ?? '';
  const type = request.query.type?.toString() ?? '';
  if (status === '' && type === '') {
    const contactLead = (await admin.firestore().collection(CONTACT_LEADS).get()).docs.map((doc) => doc.data());
    response.send(contactLead);
    return;
  }
  if (status === '' && type !== '') {
    const contactLead = (await admin.firestore().collection(CONTACT_LEADS).where('type', '==', type).get()).docs.map(
      (doc) => doc.data(),
    );
    response.send(contactLead);
    return;
  }
  if (status !== '' && type === '') {
    const contactLead = (
      await admin.firestore().collection(CONTACT_LEADS).where('status', '==', status).get()
    ).docs.map((doc) => doc.data());
    response.send(contactLead);
    return;
  }
  const contactLead = (
    await admin.firestore().collection(CONTACT_LEADS).where('status', '==', status).where('type', '==', type).get()
  ).docs.map((doc) => doc.data());
  response.send(contactLead);
};

export const updateContactLeadStatus = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const isAdmin = await isAdminRole(userId);
  if (!isAdmin) {
    response.sendStatus(403);
    return;
  }
  const { id, status } = request.body;
  await admin.firestore().collection(CONTACT_LEADS).doc(id).update({ status });
  response.sendStatus(200);
};

export const getAllCompanies = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const isAdmin = await isAdminRole(userId);
  if (!isAdmin) {
    response.sendStatus(403);
    return;
  }
  const limit = request.query.limit ? parseInt(request.query.limit.toString()) : 20;
  const companies = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      // .orderBy(CREATED_ON, 'desc')
      // .startAfter(lastItemCreatedTime)
      .limit(limit)
      .get()
  ).docs.map((doc) => doc.data());
  response.send(companies);
};

export const addStorageLinkReferenceDocument = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const isAdmin = await isAdminRole(userId);
  if (!isAdmin) {
    response.sendStatus(403);
    return;
  }
  const { storage_links, doc_type, language_code, index_name } = request.body;

  try {
    const storageItems: StorageItem[] = [];
    await Promise.all(
      storage_links.map(async (storage_link: any) => {
        const lastPath = storage_link.toString().split('/').at(-1);
        const newFileLocation = `${STORAGE_ITEMS}/${doc_type}/${lastPath}`;
        await copyStorageFolder(storage_link, newFileLocation);
        const createdOn = new Date().getTime();
        const id = admin.firestore().collection(STORAGE_ITEMS).doc().id;
        const storageItem: StorageItem = {
          type: doc_type,
          name: lastPath ?? '',
          id: id,
          is_deleted: false,
          uploaded_by: userId,
          storage_link: newFileLocation,
          created_on: createdOn,
          summary_translations: null,
        };
        await admin.firestore().collection(STORAGE_ITEMS).doc(id).set(storageItem);
        storageItems.push(storageItem);
        try {
          addReferenceDoc(newFileLocation, lastPath, doc_type, language_code, index_name);
        } catch (error) {
          console.log(error);
        }
      }),
    );
    response.status(200).send(storageItems);
  } catch (error) {
    console.log(error);
    response.sendStatus(500);
  }
};

export const createDocumentIndex = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const isAdmin = await isAdminRole(userId);
  if (!isAdmin) {
    response.sendStatus(403);
    return;
  }
  const { index_name } = request.body;
  try {
    await createPineconeIndex(index_name);
    response.sendStatus(200);
  } catch (error) {
    console.log(error);
    response.sendStatus(500);
  }
};

export const getReferenceDocIndexList = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const isAdmin = await isAdminRole(userId);
  if (!isAdmin) {
    response.sendStatus(403);
    return;
  }
  const indexList = await getPineconeIndexes();
  response.send(indexList);
};
