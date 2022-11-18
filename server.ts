'use strict';
import * as dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import admin from 'firebase-admin';
import {inviteTenants} from './src/modules/authentication/code_validation';
// eslint-disable-next-line max-len
import {createHousingCompany, getHousingCompanies, getHousingCompany, updateHousingCompanyDetail}
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
import {addApartmentRequest, getUserApartmentRequest}
  from './src/modules/housing/manage_apartment';
import {getWaterBillRequest, getWaterBillByYearRequest}
  from './src/modules/water_consumption/water_bill';
import {addNewWaterPrice, deleteWaterPrice, getActiveWaterPriceRequest}
  from './src/modules/water_consumption/manage_water_price';
import {getUserData, updateUserData} from './src/modules/user/manage_user';
import {getSupportedContries} from './src/modules/country/manage_country';

dotenv.config();
const path = process.env.SERVICE_ACCOUNT_PATH;
export const serviceAccount = require(path!);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
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
router.post('/register', register);

router.get('/user',
    validateFirebaseIdToken, getUserData);
router.patch('/user',
    validateFirebaseIdToken, updateUserData);

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
router.post('/apartments', validateFirebaseIdToken, addApartmentRequest);
router.post('/apartments/invite', validateFirebaseIdToken, inviteTenants);

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

app.get('/', (req, res) => {
  res.status(404).send('Hello priorli!');
});

app.use('/api/v1', router);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
});
