'use strict';
import * as dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import admin from 'firebase-admin';
import {inviteTenants} from './src/modules/authentication/code_validation';
// eslint-disable-next-line max-len
import {addDocumentToCompany, createHousingCompany, getCompanyDocument, getCompanyDocuments, getHousingCompanies, getHousingCompany, joinWithCode, updateCompanyDocument, updateHousingCompanyDetail}
  from './src/modules/housing/manage_housing_company';
import {registerWithCode, register}
  from './src/modules/authentication/register';
import {validateFirebaseIdToken}
  from './src/modules/authentication/authentication';

import {addConsumptionValue,
  getLatestWaterConsumptionRequest,
  getPreviousWaterConsumptionRequest,
  getWaterConsumptionRequest,
  getWholeYearWaterConsumptionRequest,
  startNewWaterConsumptionPeriod}
  from './src/modules/water_consumption/manage_water_consumption';
// eslint-disable-next-line max-len
import {addApartmentRequest, addDocumentToApartment, editApartmentRequest, getApartmentDocument, getApartmentDocuments, getSingleApartmentRequest, getUserApartmentRequest, updateAparmentDocument}
  from './src/modules/housing/manage_apartment';
import {getWaterBillRequest, getWaterBillByYearRequest, getWaterBillLinkRequest}
  from './src/modules/water_consumption/water_bill';
import {addNewWaterPrice, deleteWaterPrice, getActiveWaterPriceRequest}
  from './src/modules/water_consumption/manage_water_price';
import {changeUserPassword, getUserData, updateUserData}
  from './src/modules/user/manage_user';
// eslint-disable-next-line max-len
import {getCountryByCountryCodeRequest, getCountryDataRequest, getSupportedContries}
  from './src/modules/country/manage_country';
// eslint-disable-next-line max-len
import {addCompanyBankAccountRequest, deleteCompanyBankAccountRequest, getCompanyBankAccountRequest}
  from './src/modules/payment/manage_payment';
// eslint-disable-next-line max-len
import {addUserNotificationToken, createNotificationChannels, deleteCompanyNotificationChannels, deleteNotificationToken, getCompanyNotificationChannels, getNotificationMessages, setNotificationMessageSeen, subscribeNotificationChannels}
  from './src/modules/notification/notification_service';
import {sendPasswordResetEmail} from './src/modules/email/email_module';
// eslint-disable-next-line max-len
import {editAnnouncement, getAnnouncementRequest, getAnnouncements, makeAnnouncement}
  from './src/modules/announcement/manage_announcement';
// eslint-disable-next-line max-len
import {getConversationRequest, joinConversationRequest, sendMessage, setConversationSeenRequest, startNewConversationRequest}
  from './src/modules/messaging/manage_messaging';


dotenv.config();
const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH;
const serviceAccount = require(serviceAccountPath!);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'priorli.appspot.com',
});


const jsonParser = bodyParser.json();

const cors = require('cors');
const app = express();


// eslint-disable-next-line new-cap
const router = express.Router();
// const axios = require('axios').default;
router.use(jsonParser);
router.use(cors({
  origin: '*',
}));

router.post('/code_register', registerWithCode);
router.get('/countries',
    getSupportedContries);
router.get('/country', validateFirebaseIdToken,
    getCountryDataRequest);
router.get('/country/:country_code', validateFirebaseIdToken,
    getCountryByCountryCodeRequest);
router.post('/register', register);
router.post('/reset_password', sendPasswordResetEmail);

router.get('/user',
    validateFirebaseIdToken, getUserData);
router.patch('/user',
    validateFirebaseIdToken, updateUserData);
router.patch('/user/notification_token',
    validateFirebaseIdToken, addUserNotificationToken);
router.delete('/user/notification_token',
    validateFirebaseIdToken, deleteNotificationToken);
router.patch('/change_password', validateFirebaseIdToken, changeUserPassword);

router.get('/housing_company',
    validateFirebaseIdToken, getHousingCompany);
router.get('/housing_company/all',
    validateFirebaseIdToken, getHousingCompanies);
router.post('/housing_company',
    validateFirebaseIdToken,
    createHousingCompany);
router.put('/housing_company',
    validateFirebaseIdToken,
    updateHousingCompanyDetail);
router.get('/apartments', validateFirebaseIdToken, getUserApartmentRequest);
router.get('/apartment', validateFirebaseIdToken, getSingleApartmentRequest);
router.put('/apartment', validateFirebaseIdToken, editApartmentRequest);
router.post('/apartments', validateFirebaseIdToken, addApartmentRequest);
router.post('/apartments/invite', validateFirebaseIdToken, inviteTenants);
router.post('/apartment/join_with_code',
    validateFirebaseIdToken,
    joinWithCode);

router.post('/water_price', validateFirebaseIdToken, addNewWaterPrice);
router.delete('/water_price', validateFirebaseIdToken, deleteWaterPrice);
router.get('/water_price', validateFirebaseIdToken, getActiveWaterPriceRequest);

router.post('/water_consumption',
    validateFirebaseIdToken,
    startNewWaterConsumptionPeriod);
router.get('/water_consumption',
    validateFirebaseIdToken,
    getWaterConsumptionRequest);
router.get('/water_consumption/yearly',
    validateFirebaseIdToken,
    getWholeYearWaterConsumptionRequest);
router.get('/water_consumption/latest',
    validateFirebaseIdToken,
    getLatestWaterConsumptionRequest);
router.get('/water_consumption/previous',
    validateFirebaseIdToken,
    getPreviousWaterConsumptionRequest);
router.post('/water_consumption/new_value',
    validateFirebaseIdToken,
    addConsumptionValue);


router.get('/water_bill/:year',
    validateFirebaseIdToken,
    getWaterBillByYearRequest);
router.get('/water_bill', validateFirebaseIdToken, getWaterBillRequest);
router.get('/water_bill_link',
    validateFirebaseIdToken, getWaterBillLinkRequest);

router.get('/bank_accounts',
    validateFirebaseIdToken, getCompanyBankAccountRequest);
router.post('/bank_accounts',
    validateFirebaseIdToken, addCompanyBankAccountRequest);
router.delete('/bank_accounts',
    validateFirebaseIdToken, deleteCompanyBankAccountRequest);

router.get('/announcement',
    validateFirebaseIdToken, getAnnouncements);
router.get('/announcement/:announcement_id',
    validateFirebaseIdToken, getAnnouncementRequest);
router.post('/announcement',
    validateFirebaseIdToken, makeAnnouncement);
router.patch('/announcement',
    validateFirebaseIdToken, editAnnouncement);


router.get('/notification_channels',
    validateFirebaseIdToken, getCompanyNotificationChannels);
router.post('/notification_channels',
    validateFirebaseIdToken, createNotificationChannels);
router.delete('/notification_channels',
    validateFirebaseIdToken, deleteCompanyNotificationChannels);
router.post('/notification_channels/subscribe',
    validateFirebaseIdToken, subscribeNotificationChannels);

router.get('/notification_messsage',
    validateFirebaseIdToken, getNotificationMessages);
router.patch('/notification_messsage/seen',
    validateFirebaseIdToken, setNotificationMessageSeen);

// router.post('/test_notification', sendNotificationTest);

router.post('/message', validateFirebaseIdToken, sendMessage);
router.post('/start_conversation',
    validateFirebaseIdToken, startNewConversationRequest);
router.put('/join_conversation',
    validateFirebaseIdToken, joinConversationRequest);
router.put('/seen_conversation',
    validateFirebaseIdToken, setConversationSeenRequest);
router.get('/conversation', validateFirebaseIdToken, getConversationRequest);

router.post('/housing_company/documents',
    validateFirebaseIdToken, addDocumentToCompany);
router.get('/housing_company/documents',
    validateFirebaseIdToken, getCompanyDocuments);
router.put('/housing_company/document/:document_id',
    validateFirebaseIdToken, updateCompanyDocument);
router.get('/housing_company/:housing_company_id/document/:document_id',
    validateFirebaseIdToken, getCompanyDocument);

router.post('/apartment/documents',
    validateFirebaseIdToken, addDocumentToApartment);
router.get('/apartment/documents',
    validateFirebaseIdToken, getApartmentDocuments);
router.put('/apartment/document/:document_id',
    validateFirebaseIdToken, updateAparmentDocument);
// eslint-disable-next-line max-len
router.get('/housing_company/:housing_company_id/apartment/:apartment_id/document/:document_id',
    validateFirebaseIdToken, getApartmentDocument);

app.get('/', (req, res) => {
  res.status(404).send('Hello priorli!');
});

app.use('/api/v1', router);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
});
