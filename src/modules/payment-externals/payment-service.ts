/* eslint-disable camelcase */
import { Request, Response } from "express";
import {
  addCompanySubscription,
  addCompanySubscriptionInvoice,
  markSubscriptionStatus,
  updateCompanySubscription,
} from "../subscription/subscription-service";
import admin from "firebase-admin";
import { HOUSING_COMPANIES, IS_ACTIVE, SUBSCRIPTIONS } from "../../constants";
import { addCredit } from "../credit/credit-service";

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

export const addPaymentCustomerAccount = async (
  email: string,
  name?: string,
  phone?: string
) => {
  const customer = await stripe.customers.create({
    email,
    name,
    phone,
    description: "New Customer from Api",
  });
  return customer;
};

export const addStripeSubscriptionProduct = async (
  name: string,
  interval: string,
  currency?: string,
  unitAmountDecimal?: number
) => {
  const amount = Math.round(unitAmountDecimal! * 100.0);
  const product = await stripe.products.create({
    name,
    default_price_data: {
      currency,
      unit_amount_decimal: amount,
      recurring: {
        interval,
        interval_count: 1,
      },
    },
  });
  return product;
};

export const addStripeProduct = async (
  name: string,
  currency?: string,
  unitAmountDecimal?: number
) => {
  const amount = Math.round(unitAmountDecimal! * 100.0);
  const product = await stripe.products.create({
    name,
    default_price_data: {
      currency,
      unit_amount_decimal: amount,
    },
  });
  return product;
};

export const createPaymentProductLink = async (
  company_id: string,
  payment_product_item_id: string,
  priceId: string,
  quantity: number
) => {
  const session = await stripe.paymentLinks.create({
    line_items: [
      {
        price: priceId,
        quantity,
      },
    ],
    metadata: { company_id, payment_product_item_id },
    invoice_creation: {
      enabled: true,
      invoice_data: {
        metadata: { company_id, payment_product_item_id },
      }
    },
  });
  return session;
};

export const createSubscriptionInvoiceLink = async (
  customerId: string,
  priceId: string,
  subscriptionPlanId: string,
  companyId: string,
  userId: string,
  quantity: number
) => {
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    collection_method: "send_invoice",
    items: [{ price: priceId, quantity }],
    days_until_due: 0,
    metadata: {
      quantity,
      company_id: companyId,
      user_id: userId,
      subscription_plan_id: subscriptionPlanId,
    },
  });
  const invoice = await stripe.invoices.update(subscription.latest_invoice, {
    metadata: {
      quantity: Number(quantity),
      company_id: companyId,
      user_id: userId,
      subscription_plan_id: subscriptionPlanId,
    },
  });
  const invoiceFinal = await stripe.invoices.sendInvoice(invoice.id);
  return invoiceFinal;
};

/**
 *
 * unused function
 */

export const createCheckoutSession = async (
  customerId: string,
  priceId: string,
  subscriptionPlanId: string,
  companyId: string,
  userId: string
) => {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: 30,
    },
    metadata: {
      company_id: companyId,
      user_id: userId,
      subscription_plan_id: subscriptionPlanId,
    },
    success_url: `http://localhost:8080/api/v1/subscription/payment_success?session_id={CHECKOUT_SESSION_ID}&subscription_plan_id=${subscriptionPlanId}&company_id=${companyId}&user_id=${userId}`,
    cancel_url: `http://localhost:4242/api/v1/subscription/failed`,
  });
  return session;
};

export const webhookEvents = async (request: Request, response: Response) => {
  const sig = request.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      request.body,
      sig,
      process.env.PAYMENT_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log(err);
    response.status(400).send(`Webhook Error: ${err}`);
    return;
  }

  // Handle the event
  switch (event.type) {
    case "customer.subscription.created": {
      await handleSubsriptionCreatedEvent(event);
      break;
    }
    case "customer.subscription.updated": {
      await handleSupscriptionUpdatedEvent(event);
      break;
    }
    case "invoice.finalized": {
      await handleInvoiceFinalizeEvent(event);
      break;
    }
    case "invoice.paid": {
      await handleInvoicePaidEvent(event);
      break;
    }
    case "customer.subscription.deleted": {
      {
        await handleSubscriptionDeletedEvent(event);
        break;
      }
    }
    default: {
      // Unexpected event type
      console.log(`Unhandled event type ${event.type}`);
    }
  }
  // Return a 200 response to acknowledge receipt of the event
  response.send();
};

export const retrieveCheckOutSession = async (sessionId: string) => {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return session;
};

export const retrieveSubscriptionDetail = async (subscriptionId: String) => {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return subscription;
};

export const retrieveInvoiceDetail = async (invoiceId: String) => {
  const invoice = await stripe.invoices.retrieve(invoiceId);
  return invoice;
};

const paidSubscriptionAutomatically = async (subscriptionId: string) => {
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    collection_method: "charge_automatically",
  });
  return subscription;
};

export const cancelSubscription = async (subscriptionId: string) => {
  const subscription = await stripe.subscriptions.del(subscriptionId);
  return subscription;
};

const cancelCompanySubscription = async (
  companyId: string,
  subscriptionPlanId: string
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
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .collection(SUBSCRIPTIONS)
    .doc(id)
    .update(IS_ACTIVE, false);
};

export const updateSubscriptionQuantity = async (
  subscriptionId: string,
  stripe_price_id: string,
  quantity: number
) => {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.items.data.length == 0) {
    return;
  }
  const item = subscription.items.data.find(
    (itemData: { plan: { id: string } }) => itemData.plan.id === stripe_price_id
  );
  const newQuantity = item.quantity + quantity;
  const newMetatdata = subscription.metadata;
  newMetatdata.quantity = Number(newQuantity);
  const updatedSubscription = await stripe.subscriptions.update(
    subscriptionId,
    {
      cancel_at_period_end: false,
      proration_behavior: "always_invoice",
      metadata: newMetatdata,
      items: [
        {
          id: item.id,
          quantity: newQuantity,
        },
      ],
    }
  );
  return updatedSubscription;
};
export const updateSubscriptionPrice = async (
  subscriptionId: string,
  stripe_price_id: string,
  subscriptionPlanId: string,
  quantity: number
) => {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.items.data.length != 1) {
    return;
  }
  const item = subscription.items.data[0];
  const newQuantity = item.quantity + quantity;
  const newMetatdata = subscription.metadata;
  newMetatdata.quantity = Number(newQuantity);
  newMetatdata.subscription_plan_id = subscriptionPlanId;
  const updatedSubscription = await stripe.subscriptions.update(
    subscriptionId,
    {
      cancel_at_period_end: false,
      proration_behavior: "always_invoice",
      metadata: newMetatdata,
      items: [
        {
          id: item.id,
          quantity: newQuantity,
          price: stripe_price_id,
        },
      ],
    }
  );
  return updatedSubscription;
};
async function handleSubsriptionCreatedEvent(event: any) {
  const object = event.data.object;
  const subscriptionPlanId = object.metadata.subscription_plan_id ?? "";
  const companyId = object.metadata.company_id ?? "";
  const userId = object.metadata.user_id ?? "";
  const subscription = object.id ?? "";
  const quantity = object.metadata.quantity ?? 0;
  if (
    userId.length > 0 &&
    companyId.length > 0 &&
    subscriptionPlanId.length > 0 &&
    subscription.length > 0
  ) {
    const invoice = await retrieveInvoiceDetail(object.latest_invoice);
    await addCompanySubscription(
      userId,
      companyId,
      subscriptionPlanId,
      quantity,
      undefined,
      subscription,
      invoice.hosted_invoice_url
    );
  }
}

async function handleSubscriptionDeletedEvent(event: any) {
  const object = event.data.object;
  // eslint-disable-next-line max-len
  const subscriptionPlanId = object.metadata.subscription_plan_id ?? "";
  const companyId = object.metadata.company_id ?? "";
  // const userId = object.metadata.user_id ?? '';
  const subscription = object.subscription ?? "";
  if (
    // userId.length > 0 &&
    companyId.length > 0 &&
    // subscriptionPlanId.length > 0 &&
    subscription.length > 0
  ) {
    await cancelCompanySubscription(companyId, subscriptionPlanId);
  }
}

async function handleInvoicePaidEvent(event: any) {
  const object = event.data.object;
  // eslint-disable-next-line max-len
  const subscriptionPlanId = object.metadata.subscription_plan_id ?? "";
  const companyId = object.metadata.company_id ?? "";
  const paymentProductItemId = object.metadata.payment_product_item_id ?? "";
  // const userId = object.metadata.user_id ?? '';
  const subscription = object.subscription ?? "";
  if (subscription.length > 0) {
    await paidSubscriptionAutomatically(subscription);
  }
  if (companyId.length > 0) {
    if (subscriptionPlanId.length > 0) {
      await markSubscriptionStatus(companyId, subscriptionPlanId);
      await addCompanySubscriptionInvoice(
        companyId,
        subscriptionPlanId,
        object
      );
      return;
    }
    if (paymentProductItemId.length > 0) {
      const items = object.lines.data;
      const amount = items.reduce(
        (
          acc: number,
          item: {
            price: any;
            amount: number;
          }
        ) => {
          return acc + item.price.unit_amount * item.amount;
        },
        0
      );
      await addCredit(
        companyId,
        amount,
        object.currency,
        object.id,
        paymentProductItemId
      );
    }
  }
}

async function handleInvoiceFinalizeEvent(event: any) {
  const object = event.data.object;
  // eslint-disable-next-line max-len
  const subscriptionPlanId = object.metadata.subscription_plan_id ?? "";
  const companyId = object.metadata.company_id ?? "";
  // const userId = object.metadata.user_id ?? '';
  if (companyId.length > 0 && subscriptionPlanId.length > 0) {
    await markSubscriptionStatus(
      companyId,
      subscriptionPlanId,
      object.hosted_invoice_url
    );
  }
}

async function handleSupscriptionUpdatedEvent(event: any) {
  const object = event.data.object;
  const subscriptionPlanId = object.metadata.subscription_plan_id ?? "";
  const companyId = object.metadata.company_id ?? "";
  const quantity = object.metadata.quantity ?? 0;
  const paymentServiceSubscriptionId = object.id ?? "";
  if (companyId.length > 0 && subscriptionPlanId.length > 0) {
    await updateCompanySubscription(
      companyId,
      subscriptionPlanId,
      paymentServiceSubscriptionId,
      quantity
    );
  }
}
