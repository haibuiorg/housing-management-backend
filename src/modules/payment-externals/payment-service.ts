/* eslint-disable camelcase */
import { Request, Response } from "express";
import {
  addCompanySubscription,
  addCompanySubscriptionInvoice,
  markSubscriptionStatus,
  updateCompanySubscription,
} from "../subscription/subscription-service";
import admin from "firebase-admin";
import { BANK_ACCOUNTS, HOUSING_COMPANIES, IS_ACTIVE, SUBSCRIPTIONS } from "../../constants";
import { addCredit } from "../credit/credit-service";
import { Company } from "../../dto/company";
import { BankAccount } from "../../dto/bank_account";
import { User } from "../../dto/user";
import { Invoice } from "../../dto/invoice";
import { updateInvoiceStatus } from "../invoice-generator/invoice_service";

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

export const addStripeProductForConnectAccount = async (
  connectAccount: string,
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

export const createInvoiceForCompanyCustomer = async (company: Company, receiver: User, applicationFeeAmount: number, invoice: Invoice) => {
  const stripeInvoice = await stripe.invoices.create({
    on_behalf_of: company.payment_account_id,
    application_fee_amount: applicationFeeAmount,
    transfer_data: {destination: company.payment_account_id},
    customer: receiver.payment_customer_id,
    due_date: invoice.payment_date / 1000,
    collection_method: "send_invoice",
    metadata: {
      company_id: company.id,
      invoice_id: invoice.id,
    },
  });
  await Promise.all(invoice.items.map(async (item) => {
    await stripe.invoiceItems.create({
      customer: receiver.payment_customer_id,
      invoice: stripeInvoice.id,
      price: item.payment_product_item.stripe_price_id,
      currency: item.payment_product_item.currency,
      quantity: item.quantity,
      description: item.payment_product_item.description,
    })
  }));
  const invoiceFinal = await stripe.invoices.sendInvoice(stripeInvoice.id);
  return invoiceFinal;
}

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
      //"whsec_c3143b41f66892fc3ffe5be6af11f96e3d07269b4894f131cf12c2f841ace328"
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

export const connectAccountWebhookEvents = async (request: Request, response: Response) => {
  const sig = request.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      request.body,
      sig,
      process.env.PAYMENT_CONNECT_ACCOUNT_WEBHOOK_SECRET
      //"whsec_c3143b41f66892fc3ffe5be6af11f96e3d07269b4894f131cf12c2f841ace328"
    );
  } catch (err) {
    console.log(err);
    response.status(400).send(`Webhook Error: ${err}`);
    return;
  }

  // Handle the event
  switch (event.type) {
    case "account.updated": {
      //await handleInvoiceFinalizeEvent(event);
      break;
    }
    case "account.external_account.created": {
      await handleConnectExternalAccountCreated(event.data.object);
      break;
    }
    case "account.external_account.deleted": {
      await handleConnectExternalAccountDeleted(event.data.object);
      break;
    }
    case "account.external_account.updated": {
      await handleConnectExternalAccountUpdated(event.data.object);
      break;
    }
    case "invoice.finalized": {
      //await handleInvoiceFinalizeEvent(event);
      break;
    }
    case "invoice.paid": {
      //await handleInvoicePaidEvent(event);
      break;
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
  const invoiceId = object.metadata.invoice_id ?? "";
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
    if (invoiceId.length > 0) {
      await updateInvoiceStatus(companyId, invoiceId, "paid", object.hosted_invoice_url);
    }
  }
}

async function handleInvoiceFinalizeEvent(event: any) {
  const object = event.data.object;
  // eslint-disable-next-line max-len
  const subscriptionPlanId = object.metadata.subscription_plan_id ?? "";
  const companyId = object.metadata.company_id ?? "";
  const invoiceId = object.metadata.invoice_id ?? "";
  // const userId = object.metadata.user_id ?? '';
  if (companyId.length > 0) {
    if (subscriptionPlanId.length > 0) {
      await markSubscriptionStatus(
        companyId,
        subscriptionPlanId,
        object.hosted_invoice_url
      );
    }
    if (invoiceId.length > 0) {
      await updateInvoiceStatus(companyId, invoiceId, "pending", object.hosted_invoice_url);
    }
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

export const createConnectAccount = 
  async (
    email: string, 
    countryCode: string,
    companyName: string,
    companyId: string,
    businessType: 'individual' | 'company' | 'non_profit' | 'government_entity') => {
      try {
        const account = await stripe.accounts.create({
          type: 'custom',
          country: countryCode,
          email,
          capabilities: {
            card_payments: {requested: true},
            transfers: {requested: true},
            bank_transfer_payments: {requested: true},
            sepa_debit_payments: {requested: true},
          },
          company: {
            name: companyName,
          },
          metadata: {
            company_id: companyId,
          },
          business_type: businessType,
        });
        return account;
      } catch (error) { 
        console.log(error);
      }
    
  }

export const retrieveConnectAccount = async (accountId: string) => { 
  const account = await stripe.accounts.retrieve(accountId);
  return account;
}

export const createConnectAccountLink = async (accountId: string, companyId: string) => {
  const appUrl = process.env.APP_URL;
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/#/housing_company/${companyId}/manage/payment`,
    return_url:  `${appUrl}/#/housing_company/${companyId}/manage`,
    type: 'account_onboarding',
  });
  return accountLink;
};

const handleConnectExternalAccountDeleted = async (externalAccount: any) => {
  const account = externalAccount.account;
  let companyId = externalAccount.metadata.company_id;
  if (externalAccount.object === 'bank_account') { 
    if (!companyId) {
      const company = await getCompanyByStripeAccountId(account);
      if (!company) {
        return;
      }
      companyId = company.id;
    }
    try {
      const internalBankAccountId = (await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(companyId)
        .collection(BANK_ACCOUNTS)
        .where('external_payment_account_id', '==', externalAccount.id).get()).docs[0].id;
      await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(companyId)
        .collection(BANK_ACCOUNTS)
        .doc(internalBankAccountId)
        .update({is_deleted: true});
    } catch (errors) {
      console.log(errors);
    }
  }
}

const handleConnectExternalAccountUpdated = async (externalAccount: any) => {
  const account = externalAccount.account;
  let companyId = externalAccount.metadata.company_id;
  if (externalAccount.object === 'bank_account') { 
    if (!companyId) {
      const company = await getCompanyByStripeAccountId(account);
      if (!company) {
        return;
      }
      companyId = company.id;
    }
    try {
      const internalBankAccountId = (await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(companyId)
        .collection(BANK_ACCOUNTS)
        .where('external_payment_account_id', '==', externalAccount.id).get()).docs[0].id;
      await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(companyId)
        .collection(BANK_ACCOUNTS)
        .doc(internalBankAccountId)
        .update({
          swift: externalAccount.routing_number,
          bank_account_number: externalAccount.bank_name + '...' + externalAccount.last4,
          account_holder_name: externalAccount.account_holder_name,
        });
    } catch (errors) {
      console.log(errors);
    }
  }
}

const handleConnectExternalAccountCreated = async (externalAccount: any) => {
  const account = externalAccount.account;
  let companyId = externalAccount.metadata.company_id;
  const accountNumber = externalAccount.metadata.account_number;
  const swift = externalAccount.metadata.swift;
  if (externalAccount.object === 'bank_account') { 
    if (!companyId) {
      const company = await getCompanyByStripeAccountId(account);
      if (!company) {
        return;
      }
      companyId = company.id;
    }
    const id = admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(BANK_ACCOUNTS).doc().id;
    const bankAccount: BankAccount = {
      id: id,
      swift: swift ?? externalAccount.routing_number,
      bank_account_number: accountNumber ?? externalAccount.bank_name + '...' + externalAccount.last4,
      is_deleted: false,
      housing_company_id: companyId,
      account_holder_name: externalAccount.account_holder_name,
      external_payment_account_id: externalAccount.id,
    };
    try {
      await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(companyId)
        .collection(BANK_ACCOUNTS)
        .doc(id)
        .set(bankAccount);
    } catch (errors) {
      console.log(errors);
     
    }
    
  }
}

export const addExternalPaymentBankAccount = 
  async (company: Company, swift: string, accountNumber: string, accountName?: string) => {
    const bankAccount = await stripe.accounts.createExternalAccount(
      company.payment_account_id,
      {
        external_account: {
          object: 'bank_account',
          country: company.country_code,
          currency: company.currency_code,
          account_holder_name: accountName ?? company.name,
          routing_number: swift,
          account_number: accountNumber,
        },
        metadata: {
          company_id: company.id,
          account_number: accountNumber,
          swift,
        }
      }
    );
    return bankAccount;
  }

export const deleteExternalPaymentBankAccount = async (company: Company, externalPaymentAccountId: string) => {
  const bankAccount = await stripe.accounts.deleteExternalAccount(
    company.payment_account_id,
    externalPaymentAccountId
  );
  return bankAccount;
}

const getCompanyByStripeAccountId = async (account: string) : Promise<Company | undefined> => {
  const company = await admin.firestore().collection(HOUSING_COMPANIES).where('payment_account_id', '==', account).get();
  return company.docs[0].data() as Company;
  
}

