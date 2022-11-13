import {Request, Response} from 'express';
import {WaterPrice} from '../../dto/water_price';
import admin from 'firebase-admin';
import {HOUSING_COMPANIES, WATER_PRICE, IS_ACTIVE, UPDATED_ON}
  from '../../constants';
import {isCompanyManager, isCompanyTenant}
  from '../authentication/authentication';

export const addNewWaterPrice = async (request:Request, response: Response) => {
  const companyId = request.body.housing_company_id;
  // @ts-ignore
  const userId = request.user?.uid;
  if (await(isCompanyManager(userId, companyId))) {
    const waterPriceId = admin.firestore()
        .collection(HOUSING_COMPANIES).doc(companyId)
        .collection(WATER_PRICE).doc().id;
    const waterPrice : WaterPrice = {
      basic_fee: request.body.basic_fee ?? 0,
      price_per_cube: request.body.price_per_cube ?? 0,
      is_active: true,
      id: waterPriceId,
      updated_on: new Date().getTime(),
    };
    try {
      await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId)
          .collection(WATER_PRICE).doc(waterPriceId).set(waterPrice);
      response.status(200).send(waterPrice);
    } catch (errors) {
      response.status(500).send({errors: errors});
    }
    return;
  }
  response.status(403).send(
      {errors: {error: 'Unauthorized', code: 'not_manager'}},
  );
};

export const deleteWaterPrice = async (request:Request, response: Response) => {
  const companyId = request.body.housing_company_id;
  // @ts-ignore
  const userId = request.user?.uid;
  const waterPriceId = request.body.id;
  if (await(isCompanyManager(userId, companyId)) && waterPriceId) {
    const waterPrice : WaterPrice = {
      is_active: false,
      updated_on: new Date().getTime(),
      id: waterPriceId,
    };
    try {
      await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId)
          .collection(WATER_PRICE).doc(waterPriceId).update(waterPrice);
      response.status(200).send(waterPrice);
    } catch (errors) {
      response.status(500).send({errors: errors});
    }
    return;
  }
  response.status(403).send(
      {errors: {error: 'Unauthorized', code: 'not_manager'}},
  );
};

export const getActiveWaterPriceRequest =
    async (request:Request, response: Response) => {
      const companyId = request.query.housing_company_id;
      // @ts-ignore
      const userId = request.user?.uid;
      if (companyId &&
        (await(isCompanyTenant(userId, companyId.toString())) ||
            await(isCompanyManager(userId, companyId.toString()))
        )) {
        try {
          const waterPrice = await getActiveWaterPrice(companyId.toString());
          response.status(200).send(waterPrice);
        } catch (errors) {
          response.status(500).send({errors: errors});
        }
        return;
      }
      response.status(403).send(
          {errors: {error: 'Unauthorized', code: 'not_tenant'}},
      );
    };
export const getActiveWaterPrice =
    async (companyId: string) => {
      const waterPrices = (await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId.toString())
          .collection(WATER_PRICE).where(IS_ACTIVE, '==', true)
          .orderBy(UPDATED_ON, 'desc').limit(1).get())
          .docs.map((doc) => doc.data());
      return waterPrices[0];
    };
