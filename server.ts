/* eslint-disable @typescript-eslint/no-var-requires */
"use strict";
// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();
import bodyParser from "body-parser";
import express from "express";
import admin from "firebase-admin";
import { cancelPendingInvitationRequest, getInvitationRequest, inviteTenants, resendPendingInvitationRequest } from "./src/modules/authentication/code_validation";
// eslint-disable-next-line max-len
import { validateFirebaseIdToken, validateIdTokenAllowAnonymous } from "./src/modules/authentication/authentication";
import {
  register,
  registerWithCode,
} from "./src/modules/authentication/register";
import {
  addCompanyPaymentProductItemRequest,
  addDocumentToCompany,
  addNewManager,
  createHousingCompany,
  deletePaymentProductItemRequest,
  getCompanyDocument,
  getCompanyDocuments,
  getCompanyManagerRequest,
  getCompanyPaymentProductItemRequest,
  getCompanyUserRequest,
  getHousingCompanies,
  getHousingCompany,
  joinWithCode,
  removeUserAsCompanyMangerRequest,
  removeUserFromCompanyRequest,
  setUpPaymentAccountRequest,
  updateCompanyDocument,
  updateHousingCompanyDetail,
} from "./src/modules/housing/manage_housing_company";

import {
  addConsumptionValue,
  getLatestWaterConsumptionRequest,
  getPreviousWaterConsumptionRequest,
  getWaterConsumptionRequest,
  getWholeYearWaterConsumptionRequest,
  startNewWaterConsumptionPeriod,
} from "./src/modules/water_consumption/manage_water_consumption";
// eslint-disable-next-line max-len
import {
  addApartmentRequest,
  addDocumentToApartment,
  editApartmentRequest,
  getApartmentDocument,
  getApartmentDocuments,
  getApartmentTenantRequest,
  getSingleApartmentRequest,
  getUserApartmentRequest,
  removeUserFromApartmentRequest,
  updateAparmentDocument,
} from "./src/modules/housing/manage_apartment";
import {
  changeUserPassword,
  getUserData,
  updateUserData,
} from "./src/modules/user/manage_user";
import {
  addNewWaterPrice,
  deleteWaterPrice,
  getActiveWaterPriceRequest,
} from "./src/modules/water_consumption/manage_water_price";
import {
  getWaterBillByYearRequest,
  getWaterBillLinkRequest,
  getWaterBillRequest,
} from "./src/modules/water_consumption/water_bill";
// eslint-disable-next-line max-len
import {
  getCountryByCountryCodeRequest,
  getCountryDataRequest,
  getCountryLegalDocumentsRequest,
  getSupportedContriesRequest,
} from "./src/modules/country/manage_country";
// eslint-disable-next-line max-len
import {
  addCompanyBankAccountRequest,
  deleteCompanyBankAccountRequest,
  getCompanyBankAccountRequest,
} from "./src/modules/payment/manage_payment";
// eslint-disable-next-line max-len
import { sendPasswordResetEmail } from "./src/modules/email/email_module";
import {
  addUserNotificationToken,
  createNotificationChannels,
  deleteCompanyNotificationChannels,
  deleteNotificationToken,
  getCompanyNotificationChannels,
  getNotificationMessages,
  setNotificationMessageSeen,
  subscribeNotificationChannels,
} from "./src/modules/notification/notification_service";
// eslint-disable-next-line max-len
import {
  editAnnouncement,
  getAnnouncementRequest,
  getAnnouncements,
  makeAnnouncement,
} from "./src/modules/announcement/manage_announcement";
// eslint-disable-next-line max-len
import {
  changeConversationType,
  getConversationRequest,
  joinConversationRequest,
  sendMessage,
  setConversationSeenRequest,
  startNewConversationRequest,
} from "./src/modules/messaging/manage_messaging";
// eslint-disable-next-line max-len
import {
  addPollOption,
  createPoll,
  editPoll,
  getPoll,
  getPolls,
  removePollOption,
  selectPollOption,
} from "./src/modules/poll/poll-service";
// eslint-disable-next-line max-len
import {
  createEvents,
  editEvent,
  getEvent,
  getEvents,
  removeFromFromEvent,
  responseToEvent,
} from "./src/modules/events/event-service";
import { createFaultReport } from "./src/modules/fault-report/fault-report-service";
// eslint-disable-next-line max-len
import {
  addPaymentProductItem,
  addStorageLinkReferenceDocument,
  addSubscriptionPlan,
  createDocumentIndex,
  deletePaymentProductItem,
  deleteSubscriptionPlan,
  generateImageRequest,
  getAllCompanies,
  getContactLeadListRequest,
  getPaymentProductItems,
  getReferenceDocIndexList,
  updateContactLeadStatus,
} from "./src/modules/admin/admin-service";
import {
  submitContactForm,
  submitOfferForm,
} from "./src/modules/contact/customer-service";
import { startNewChatbotRequest } from "./src/modules/contact/public-chat-service";
import {
  deleteInvoice,
  generateInvoice,
  getCompanyInvoiceGroups,
  getInvoiceDetail,
  getInvoices,
  sendInvoiceManually,
} from "./src/modules/invoice-generator/invoice_service";
import { connectAccountWebhookEvents, webhookEvents } from "./src/modules/payment-externals/payment-service";
import {
  cancelSubscriptionRequest,
  createPaymentLinkSubscription,
  getAvailableSubscriptionPlans,
  getCompanySubscriptionRequest,
  getPaymentKey,
  getSubscriptionDetailByIdRequest,
  purchasePaymentProductItem,
  subscriptionStatusCheck,
} from "./src/modules/subscription/subscription-service";

const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH;
const serviceAccount = require(serviceAccountPath!);
const adminApp = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "priorli.appspot.com",
});
const firestore = adminApp.firestore();
firestore.settings({ ignoreUndefinedProperties: true });

const jsonParser = bodyParser.json();

const cors = require("cors");
const app = express();

// eslint-disable-next-line new-cap
const router = express.Router();
// const axios = require('axios').default;
router.post(
  "/payment/webhooks",
  express.raw({ type: "application/json" }),
  webhookEvents
);
router.post(
  "/payment/account/webhooks",
  express.raw({ type: "application/json" }),
  connectAccountWebhookEvents
);

router.use(jsonParser);
router.use(
  cors({
    origin: "*",
  })
);

router.post("/code_register", registerWithCode);
router.get("/countries", getSupportedContriesRequest);
router.get("/country", validateFirebaseIdToken, getCountryDataRequest);
router.get(
  "/country/:country_code",
  validateFirebaseIdToken,
  getCountryByCountryCodeRequest
);
router.get(
  "/country/:country_code/legal_documents",
  getCountryLegalDocumentsRequest
);
router.post("/register", register);
router.post("/reset_password", sendPasswordResetEmail);

router.get("/user", validateIdTokenAllowAnonymous, getUserData);
router.patch("/user", validateIdTokenAllowAnonymous, updateUserData);
router.patch(
  "/user/notification_token",
  validateIdTokenAllowAnonymous,
  addUserNotificationToken
);
router.delete(
  "/user/notification_token",
  validateIdTokenAllowAnonymous,
  deleteNotificationToken
);
router.patch("/change_password", validateFirebaseIdToken, changeUserPassword);

router.get("/housing_company", validateFirebaseIdToken, getHousingCompany);
router.get(
  "/housing_company/all",
  validateFirebaseIdToken,
  getHousingCompanies
);
router.delete("/housing_company/tenants", validateFirebaseIdToken, removeUserFromCompanyRequest);
router.post("/housing_company/apartment_tenants", validateFirebaseIdToken, removeUserFromCompanyRequest);
router.post("/housing_company", validateFirebaseIdToken, createHousingCompany);
router.post("/housing_company_manager", validateFirebaseIdToken, addNewManager);
router.delete("/housing_company_manager", validateFirebaseIdToken, removeUserAsCompanyMangerRequest);
router.get(
  "/housing_company_manager/:companyId",
  validateFirebaseIdToken,
  getCompanyManagerRequest
);
router.put(
  "/housing_company",
  validateFirebaseIdToken,
  updateHousingCompanyDetail
);
router.post("/invoices", validateFirebaseIdToken, generateInvoice);
router.get("/invoices", validateFirebaseIdToken, getInvoices);
router.get("/invoice_groups", validateFirebaseIdToken, getCompanyInvoiceGroups);
router.get("/invoice/:invoiceId", validateFirebaseIdToken, getInvoiceDetail);
router.delete("/invoice/:invoiceId", validateFirebaseIdToken, deleteInvoice);
router.get("/apartments", validateFirebaseIdToken, getUserApartmentRequest);
router.get("/apartment", validateFirebaseIdToken, getSingleApartmentRequest);
router.put("/apartment", validateFirebaseIdToken, editApartmentRequest);
router.delete("/apartment/tenant", validateFirebaseIdToken, removeUserFromApartmentRequest);
router.get("/apartment/tenants", validateFirebaseIdToken, getApartmentTenantRequest);
router.post("/apartments", validateFirebaseIdToken, addApartmentRequest);
router.post("/invoice/:invoiceId", validateFirebaseIdToken, sendInvoiceManually);

router.post("/apartment/join_with_code", validateFirebaseIdToken, joinWithCode);


router.post("/invitations", validateFirebaseIdToken, inviteTenants);
router.get("/invitations", validateFirebaseIdToken, getInvitationRequest);
router.post("/invitations/resend", validateFirebaseIdToken, resendPendingInvitationRequest);
router.delete("/invitations", validateFirebaseIdToken, cancelPendingInvitationRequest);

router.post("/water_price", validateFirebaseIdToken, addNewWaterPrice);
router.delete("/water_price", validateFirebaseIdToken, deleteWaterPrice);
router.get("/water_price", validateFirebaseIdToken, getActiveWaterPriceRequest);

router.post(
  "/water_consumption",
  validateFirebaseIdToken,
  startNewWaterConsumptionPeriod
);
router.get(
  "/water_consumption",
  validateFirebaseIdToken,
  getWaterConsumptionRequest
);
router.get(
  "/water_consumption/yearly",
  validateFirebaseIdToken,
  getWholeYearWaterConsumptionRequest
);
router.get(
  "/water_consumption/latest",
  validateFirebaseIdToken,
  getLatestWaterConsumptionRequest
);
router.get(
  "/water_consumption/previous",
  validateFirebaseIdToken,
  getPreviousWaterConsumptionRequest
);
router.post(
  "/water_consumption/new_value",
  validateFirebaseIdToken,
  addConsumptionValue
);

router.get(
  "/water_bill/:year",
  validateFirebaseIdToken,
  getWaterBillByYearRequest
);
router.get("/water_bill", validateFirebaseIdToken, getWaterBillRequest);
router.get(
  "/water_bill_link",
  validateFirebaseIdToken,
  getWaterBillLinkRequest
);

router.get(
  "/bank_accounts",
  validateFirebaseIdToken,
  getCompanyBankAccountRequest
);
router.post(
  "/bank_accounts",
  validateFirebaseIdToken,
  addCompanyBankAccountRequest
);
router.delete(
  "/bank_accounts",
  validateFirebaseIdToken,
  deleteCompanyBankAccountRequest
);
router.post(
  "/bank_accounts/setup_payment_connect_account",
  validateFirebaseIdToken,
  setUpPaymentAccountRequest
);
router.get("/announcement", validateFirebaseIdToken, getAnnouncements);
router.get(
  "/announcement/:announcement_id",
  validateFirebaseIdToken,
  getAnnouncementRequest
);
router.post("/announcement", validateFirebaseIdToken, makeAnnouncement);
router.patch("/announcement", validateFirebaseIdToken, editAnnouncement);

router.get(
  "/notification_channels",
  validateFirebaseIdToken,
  getCompanyNotificationChannels
);
router.post(
  "/notification_channels",
  validateFirebaseIdToken,
  createNotificationChannels
);
router.delete(
  "/notification_channels",
  validateFirebaseIdToken,
  deleteCompanyNotificationChannels
);
router.post(
  "/notification_channels/subscribe",
  validateFirebaseIdToken,
  subscribeNotificationChannels
);

router.get(
  "/notification_messsage",
  validateFirebaseIdToken,
  getNotificationMessages
);
router.patch(
  "/notification_messsage/seen",
  validateFirebaseIdToken,
  setNotificationMessageSeen
);

// router.post('/test_notification', sendNotificationTest);
// allow anonymous for chatbot
router.post("/message", validateIdTokenAllowAnonymous, sendMessage);
router.post(
  "/start_conversation",
  validateIdTokenAllowAnonymous,
  startNewConversationRequest
);
router.put(
  "/join_conversation",
  validateIdTokenAllowAnonymous,
  joinConversationRequest
);
router.put(
  "/seen_conversation",
  validateIdTokenAllowAnonymous,
  setConversationSeenRequest
);
router.get("/conversation", validateIdTokenAllowAnonymous, getConversationRequest);
router.put("/conversation/type", validateIdTokenAllowAnonymous, changeConversationType);


router.post(
  "/housing_company/documents",
  validateFirebaseIdToken,
  addDocumentToCompany
);
router.post(
  "/housing_company/invoice/payment_product_item",
  validateFirebaseIdToken,
  addCompanyPaymentProductItemRequest
)
router.get(
  "/housing_company/invoice/payment_product_items",
  validateFirebaseIdToken,
  getCompanyPaymentProductItemRequest
);
router.delete(
  "/housing_company/invoice/payment_product_items",
  validateFirebaseIdToken,
  deletePaymentProductItemRequest
);
router.get(
  "/housing_company/:companyId/users",
  validateFirebaseIdToken,
  getCompanyUserRequest
);
router.get(
  "/housing_company/documents",
  validateFirebaseIdToken,
  getCompanyDocuments
);
router.put(
  "/housing_company/document/:document_id",
  validateFirebaseIdToken,
  updateCompanyDocument
);
router.get(
  "/housing_company/:housing_company_id/document/:document_id",
  validateFirebaseIdToken,
  getCompanyDocument
);

router.post(
  "/apartment/documents",
  validateFirebaseIdToken,
  addDocumentToApartment
);
router.get(
  "/apartment/documents",
  validateFirebaseIdToken,
  getApartmentDocuments
);
router.put(
  "/apartment/document/:document_id",
  validateFirebaseIdToken,
  updateAparmentDocument
);
// eslint-disable-next-line max-len
router.get(
  "/housing_company/:housing_company_id/apartment/:apartment_id/document/:document_id",
  validateFirebaseIdToken,
  getApartmentDocument
);

router.post(
  "/housing_company/:companyId/apartment/:apartmentId/fault-report",
  validateFirebaseIdToken,
  createFaultReport
);

router.get("/polls", validateFirebaseIdToken, getPolls);
router.get("/poll/:pollId", validateFirebaseIdToken, getPoll);
router.post("/poll", validateFirebaseIdToken, createPoll);
router.put("/poll/:pollId", validateFirebaseIdToken, editPoll);
router.put("/poll/:pollId/remove", validateFirebaseIdToken, removePollOption);
router.put("/poll/:pollId/add", validateFirebaseIdToken, addPollOption);
router.put("/poll/:pollId/select", validateFirebaseIdToken, selectPollOption);

router.get("/events", validateFirebaseIdToken, getEvents);
router.get("/event/:eventId", validateFirebaseIdToken, getEvent);
router.post("/event", validateFirebaseIdToken, createEvents);
router.put("/event/:eventId", validateFirebaseIdToken, editEvent);
router.put(
  "/event/:eventId/response",
  validateFirebaseIdToken,
  responseToEvent
);
router.put(
  "/event/:eventId/remove_users",
  validateFirebaseIdToken,
  removeFromFromEvent
);

router.get("/subscription_plans", getAvailableSubscriptionPlans);
router.get(
  "/subscription/status_check",
  validateFirebaseIdToken,
  subscriptionStatusCheck
);
router.get(
  "/subscriptions",
  validateFirebaseIdToken,
  getCompanySubscriptionRequest
);
router.get(
  "/subscription",
  validateFirebaseIdToken,
  getSubscriptionDetailByIdRequest
);
router.delete(
  "/subscription",
  validateFirebaseIdToken,
  cancelSubscriptionRequest
);
router.post(
  "/checkout/subscription",
  validateFirebaseIdToken,
  createPaymentLinkSubscription
);

router.post("/checkout/payment_product", validateFirebaseIdToken, purchasePaymentProductItem);
router.get("/payment_key", validateFirebaseIdToken, getPaymentKey);

//public routes
router.post("/contact_leads/contact_form", submitContactForm);
router.post("/contact_leads/offer_form", submitOfferForm);

// admin routes
router.post(
  "/admin/subscription_plan",
  validateFirebaseIdToken,
  addSubscriptionPlan
);
router.delete(
  "/admin/subscription_plan",
  validateFirebaseIdToken,
  deleteSubscriptionPlan
);
router.get(
  "/admin/contact_leads",
  validateFirebaseIdToken,
  getContactLeadListRequest
);
router.put(
  "/admin/contact_leads",
  validateFirebaseIdToken,
  updateContactLeadStatus
);
router.get("/admin/companies", validateFirebaseIdToken, getAllCompanies);
router.post("/admin/add_reference_doc", validateFirebaseIdToken, addStorageLinkReferenceDocument);
router.post("/admin/add_index", validateFirebaseIdToken, createDocumentIndex);
router.get("/admin/reference_indexes", validateFirebaseIdToken, getReferenceDocIndexList);
router.post("/admin/payment_product", validateFirebaseIdToken, addPaymentProductItem);
router.delete("/admin/payment_product", validateFirebaseIdToken, deletePaymentProductItem);
router.get("/payment_products", validateFirebaseIdToken, getPaymentProductItems);

router.post("/admin/generate_image", validateFirebaseIdToken, generateImageRequest);

router.post("/chatbot", startNewChatbotRequest);

app.get("/", (req, res) => {
  res.status(404).send("Hello priorli!");
});

app.use("/api/v1", router);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8181;
app.listen(PORT, () => {
  return;
});
