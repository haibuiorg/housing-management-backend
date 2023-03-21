/* eslint-disable camelcase */
import { Request, Response } from "express";
import admin from "firebase-admin";
import {
  HOUSING_COMPANIES,
  IS_ACTIVE,
  PAYMENT_PRODUCT_ITEMS,
  SUBSCRIPTIONS,
  SUBSCRIPTION_INVOICES,
  SUBSCRIPTION_PLAN,
} from "../../constants";
import {
  isAdminRole,
  isCompanyManager,
} from "../authentication/authentication";
import {
  cancelSubscription,
  createPaymentProductLink,
  createSubscriptionInvoiceLink,
  // createPaymentLink,
  retrieveCheckOutSession,
  retrieveInvoiceDetail,
  retrieveSubscriptionDetail,
  updateSubscriptionPrice,
  updateSubscriptionQuantity,
} from "../payment-externals/payment-service";
import { SubscriptionPlan } from "../../dto/subscription_plan";
import { Subscription } from "../../dto/subscription";
import { retrieveUser } from "../user/manage_user";
import { PaymentProductItem } from "../../dto/payment-product-item";

export const getCompanySubscriptionRequest = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user.uid;
  const companyId = request.query.company_id?.toString() ?? "";
  const company = await isCompanyManager(userId, companyId);
  if (!company) {
    response.sendStatus(403);
    return;
  }
  const subscriptions = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(SUBSCRIPTIONS)
      .where(IS_ACTIVE, "==", true)
      .get()
  ).docs.map((doc) => doc.data());
  response.send(subscriptions);
};

export const getSubscriptionDetailByIdRequest = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user.uid;
  const companyId = request.query.company_id?.toString() ?? "";
  const company = await isCompanyManager(userId, companyId);
  if (!company) {
    response.sendStatus(403);
    return;
  }
  const subscriptionId = request.query.subscription_id?.toString() ?? "";
  const subscription = await getSubscriptionDetailById(
    subscriptionId,
    companyId
  );
  response.send(subscription);
};

export const getSubscriptionDetailById = async (
  subscriptionId: string,
  companyId: string
) => {
  try {
    const subscription = (
      await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(companyId)
        .collection(SUBSCRIPTIONS)
        .doc(subscriptionId)
        .get()
    ).data() as Subscription;
    if (subscription.payment_service_subscription_id) {
      const suscriptionDetail = await retrieveSubscriptionDetail(
        subscription.payment_service_subscription_id
      );
      subscription.detail = suscriptionDetail;
    }
    return subscription;
  } catch (error) {
    console.log(error);
  }
};

export const cancelSubscriptionRequest = async (
  request: Request,
  response: Response
) => {
  const id = request.query.subscription_id?.toString() ?? "";
  // @ts-ignore
  const userId = request.user.uid;
  const companyId = request.query.company_id?.toString() ?? "";
  const company = await isCompanyManager(userId, companyId);
  if (!company) {
    response.sendStatus(403);
    return;
  }
  const subscription = await getSubscriptionDetailById(id, companyId);
  if (!subscription) {
    response.sendStatus(404);
    return;
  }
  const subscriptionDetail = await cancelSubscription(
    subscription.payment_service_subscription_id!
  );
  response.status(200).send(subscriptionDetail);
};

export const getSubscriptionPlanById = async (
  id: string
): Promise<SubscriptionPlan> => {
  const subscription = (
    await admin.firestore().collection(SUBSCRIPTION_PLAN).doc(id).get()
  ).data();
  return subscription as SubscriptionPlan;
};

export const subscriptionStatusCheck = async (
  request: Request,
  response: Response
) => {
  const checkOutSession = await retrieveCheckOutSession(
    request.query.session_id?.toString() ?? ""
  );
  if (
    checkOutSession.payment_status != "paid" &&
    checkOutSession.payment_status != "no_payment_required"
  ) {
    response.sendStatus(404);
    return;
  }
  const subscriptionPlanId =
    checkOutSession.metadata.subscription_plan_id?.toString() ?? "";
  const companyId = checkOutSession.metadata.company_id?.toString() ?? "";
  const userId = checkOutSession.metadata.user_id?.toString() ?? "";
  const checkoutId = checkOutSession.id;

  // const subscriptionPlan = await getSubscriptionPlanById(subscriptionPlanId);
  const subscription = await addCompanySubscription(
    userId,
    companyId,
    subscriptionPlanId,
    checkOutSession.metadata.quantity ?? 1,
    checkoutId,
    checkOutSession.subscription,
    checkOutSession.invoice_url
  );
  response.send(subscription);
};

export const addCompanySubscription = async (
  userId: string,
  companyId: string,
  subscriptionPlanId: string,
  quantity: number,
  checkOutSessionId?: string,
  paymentServiceSubscriptionId?: string,
  invoiceUrl?: string
) => {
  const createdOn = new Date().getTime();
  const subscriptionId = admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .collection(SUBSCRIPTIONS)
    .doc().id;
  const subscription: Subscription = {
    id: subscriptionId,
    is_active: true,
    used_active_users: 0,
    payment_service_subscription_id: paymentServiceSubscriptionId,
    subscription_plan_id: subscriptionPlanId,
    created_by: userId,
    checkout_session_id: checkOutSessionId ?? "",
    created_on: createdOn,
    company_id: companyId,
    latest_invoice_paid: false,
    latest_invoice_url: invoiceUrl ?? "",
  };
  subscription.quantity = Number(quantity);
  if (subscription.payment_service_subscription_id) {
    const suscriptionDetail = await retrieveSubscriptionDetail(
      subscription.payment_service_subscription_id
    );
    subscription.detail = suscriptionDetail;
  }
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .collection(SUBSCRIPTIONS)
    .doc(subscriptionId)
    .set(subscription);
  return subscription;
};

export const updateCompanySubscription = async (
  companyId: string,
  subscription_plan_id: string,
  paymentServiceSubscriptionId: string,
  quantity: number
) => {
  const hasExistingSuscription = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(SUBSCRIPTIONS)
      .where(
        "payment_service_subscription_id",
        "==",
        paymentServiceSubscriptionId ?? ""
      )
      .get()
  ).docs.map((doc) => doc.data()) as Subscription[];
  if (hasExistingSuscription.length > 0) {
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(SUBSCRIPTIONS)
      .doc(hasExistingSuscription[0].id)
      .update({
        quantity: Number(quantity),
        subscription_plan_id: subscription_plan_id,
      });
  }
};

export const getPaymentKey = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  if (!userId) {
    response.sendStatus(403);
    return;
  }
  const key = process.env.STRIPE_PUBLIC_KEY;
  response.send({ key: key });
};

export const createPaymentLinkSubscription = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user.uid;
  const companyId = request.body.company_id;
  const company = await isCompanyManager(userId, companyId);
  if (!company) {
    response.sendStatus(403);
    return;
  }
  const { subscription_plan_id, quantity } = request.body;
  const hasExistingSuscription = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(SUBSCRIPTIONS)
      .where("subscription_plan_id", "==", subscription_plan_id ?? "")
      .where(IS_ACTIVE, "==", true)
      .get()
  ).docs.map((doc) => doc.data()) as Subscription[];
  const subscriptionPlan = await getSubscriptionPlanById(subscription_plan_id);
  const user = await retrieveUser(userId);
  if (hasExistingSuscription.length > 0) {
    const paymentLink = await addMoreAccountToSubscription(
      hasExistingSuscription[0].payment_service_subscription_id!,
      subscriptionPlan.stripe_price_id,
      quantity
    );
    if (paymentLink.length < 1) {
      response.sendStatus(500);
      return;
    }
    response.status(200).send({ payment_url: paymentLink });
    return;
  }
  /* const paymentLink = (await createPaymentLink(
          subscriptionPlan.stripe_price_id,
          subscription_plan_id,
          companyId,
          userId)).url;*/
  const activeSubscription = await hasOneActiveSubscription(companyId);
  if (activeSubscription) {
    const paymentLink = await changeSubscription(
      activeSubscription.payment_service_subscription_id!,
      subscriptionPlan.stripe_price_id,
      subscription_plan_id,
      quantity
    );
    if (paymentLink.length < 1) {
      response.sendStatus(500);
      return;
    }
    response.status(200).send({ payment_url: paymentLink });
    return;
  }
  const paymentLink = (
    await createSubscriptionInvoiceLink(
      user.payment_customer_id,
      subscriptionPlan.stripe_price_id,
      subscription_plan_id,
      companyId,
      userId,
      quantity
    )
  ).hosted_invoice_url;
  response.status(200).send({ payment_url: paymentLink });
};

export const getAvailableSubscriptionPlans = async (
  request: Request,
  response: Response
) => {
  const country_code = request.query.country_code ?? "fi";
  const subscriptionList = (
    await admin
      .firestore()
      .collection(SUBSCRIPTION_PLAN)
      .where("is_active", "==", true)
      .where("country_code", "==", country_code)
      .get()
  ).docs.map((doc) => doc.data());
  response.send(subscriptionList);
};

export const hasOneActiveSubscription = async (
  companyId: string
): Promise<Subscription> => {
  const hasActiveSubscription = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(SUBSCRIPTIONS)
      .where(IS_ACTIVE, "==", true)
      .get()
  ).docs.map((doc) => doc.data())[0];
  return hasActiveSubscription as Subscription;
};

const addMoreAccountToSubscription = async (
  payment_service_subscription_id: string,
  stripe_price_id: string,
  quantity: number
) => {
  const newSubscription = await updateSubscriptionQuantity(
    payment_service_subscription_id,
    stripe_price_id,
    quantity
  );
  if (!newSubscription) {
    return "";
  }
  const latestInvoice = await retrieveInvoiceDetail(
    newSubscription.latest_invoice
  );
  return latestInvoice.hosted_invoice_url;
};
const changeSubscription = async (
  payment_service_subscription_id: string,
  stripe_price_id: string,
  subscriptionPlanId: string,
  quantity: number
): Promise<string> => {
  const newSubscription = await updateSubscriptionPrice(
    payment_service_subscription_id,
    stripe_price_id,
    subscriptionPlanId,
    quantity
  );
  if (!newSubscription) {
    return "";
  }
  const latestInvoice = await retrieveInvoiceDetail(
    newSubscription.latest_invoice
  );
  if (!latestInvoice) {
    return "";
  }
  return latestInvoice.hosted_invoice_url;
};

export const markSubscriptionStatus = async (
  companyId: string,
  subscriptionPlanId: string,
  latestInvoiceUrl?: string
) => {
  const subscriptions = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(SUBSCRIPTIONS)
      .where("subscription_plan_id", "==", subscriptionPlanId)
      .get()
  ).docs.map((doc) => doc.data());
  if (!subscriptions || subscriptions.length != 1) {
    return;
  }
  const id = subscriptions[0].id;
  const data = latestInvoiceUrl
    ? {
        latest_invoice_paid: false,
        latest_invoice_url: latestInvoiceUrl,
      }
    : {
        latest_invoice_paid: true,
      };
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .collection(SUBSCRIPTIONS)
    .doc(id)
    .update(data);
};

export const addCompanySubscriptionInvoice = async (
  companyId: string,
  subscriptionPlanId: string,
  invoice: any
) => {
  const subscriptions = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(SUBSCRIPTIONS)
      .where("subscription_plan_id", "==", subscriptionPlanId)
      .get()
  ).docs.map((doc) => doc.data());
  if (!subscriptions || subscriptions.length != 1) {
    throw new Error("Subscription not found");
  }
  const id = subscriptions[0].id;
  const invoiceId = admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .collection(SUBSCRIPTIONS)
    .doc(id)
    .collection(SUBSCRIPTION_INVOICES)
    .doc().id;
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .collection(SUBSCRIPTIONS)
    .doc(id)
    .collection(SUBSCRIPTION_INVOICES)
    .doc(invoiceId)
    .set(invoice);
};

export const getAvailablePaymentProductItems = async (
  request: Request,
  response: Response
) => {
  const country_code = request.query.country_code ?? "fi";
  const productItems = (
    await admin
      .firestore()
      .collection(PAYMENT_PRODUCT_ITEMS)
      .where("is_active", "==", true)
      .where("country_code", "==", country_code)
      .get()
  ).docs.map((doc) => doc.data());
  response.send(productItems);
};

export const purchasePaymentProductItem = async (
  request: Request,
  response: Response
) => {
  const company_id = request.body.company_id;
  const payment_product_item_id = request.body.payment_product_item_id;
  const quantity = request.body.quantity;
  // @ts-ignore
  const userId = request.user.uid;
  if (!await isCompanyManager(userId, company_id)) {
    response.sendStatus(403);
    return;
  }
  const paymentProductItem = (
    await admin
      .firestore()
      .collection(PAYMENT_PRODUCT_ITEMS)
      .doc(payment_product_item_id)
      .get()
  ).data() as PaymentProductItem;
  const session = await createPaymentProductLink(
    company_id,
    payment_product_item_id,
    paymentProductItem.stripe_price_id,
    Number(quantity)
  );
  response.status(200).send({ payment_url: session.url });
};
